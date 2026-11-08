#!/usr/bin/env node
// Vectorless retrieval over long structured documents: a table-of-contents tree
// the agent reasons over, instead of embeddings and top-k similarity.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

const USAGE = `tree-index: ToC tree retrieval for long structured documents (no vectors)

Usage:
  tree-index.mjs build <file|dir>... [--out DIR]   parse documents into a tree (.md .txt .pdf)
  tree-index.mjs show [--depth N] [--doc SLUG]     print the tree with summaries (feed this to reasoning)
  tree-index.mjs todo [--json]                     nodes with missing or stale summaries, leaves first
  tree-index.mjs summarize <id> <text>             set one node summary
  tree-index.mjs summarize --from FILE.json        set many: {"id": "summary", ...}
  tree-index.mjs read <id>... [--shallow] [--max-chars N]   full section text with citation header
  tree-index.mjs refs <id>                         cross-references in a node, resolved to node ids
  tree-index.mjs find <text>                       literal match over titles and summaries

Options:
  --out DIR / --index DIR   index directory (default .tree-index)
`;

const TEXT_EXT = new Set(['.md', '.markdown', '.mdx', '.txt', '.text', '.rst', '.adoc']);
const MD_EXT = new Set(['.md', '.markdown', '.mdx']);
const LABELS = 'part|chapter|section|article|appendix|annex|schedule|exhibit|item|note';

function parseArgs(argv) {
  const pos = [];
  const opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) opt[k] = v;
      else if (['shallow', 'json', 'help'].includes(k)) opt[k] = true;
      else opt[k] = argv[++i];
    } else pos.push(a);
  }
  return { pos, opt };
}

const sha = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
const slug = (s) => s.toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'doc';
const die = (msg) => { process.stderr.write(`tree-index: ${msg}\n`); process.exit(1); };

function gitCommit() {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}

// ---------- extraction: every document becomes lines, each with a page number

function extract(file) {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') {
    const r = spawnSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
    if (r.error || r.status !== 0) die(`pdftotext failed on ${file}; install poppler-utils or convert the PDF to markdown first`);
    const lines = [];
    const pages = r.stdout.split('\f');
    if (pages.length > 1 && !pages[pages.length - 1].trim()) pages.pop();
    pages.forEach((pg, i) => {
      for (const l of pg.split('\n')) lines.push({ text: l.replace(/\s+$/, ''), page: i + 1 });
    });
    return { kind: 'pdf', lines };
  }
  const raw = fs.readFileSync(file, 'utf8').replace(/\r\n?/g, '\n');
  return { kind: MD_EXT.has(ext) ? 'markdown' : 'text', lines: raw.split('\n').map((text) => ({ text, page: null })) };
}

function markdownHeadings(lines) {
  const out = [];
  let fence = null;
  lines.forEach(({ text }, i) => {
    const f = text.match(/^\s*(```|~~~)/);
    if (f) { fence = fence === f[1] ? null : fence ?? f[1]; return; }
    if (fence) return;
    const atx = text.match(/^(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (atx) return out.push({ line: i, level: atx[1].length, title: atx[2] });
    const next = lines[i + 1]?.text ?? '';
    if (text.trim() && !/^\s*([-*+]|\d+\.)\s/.test(text) && /^(=+|-+)\s*$/.test(next) && next.trim().length >= 3) {
      out.push({ line: i, level: next.trim()[0] === '=' ? 1 : 2, title: text.trim(), setext: true });
    }
  });
  return out;
}

// Plain text and PDFs have no markup, so headings are inferred from shape:
// numbered sections, labelled divisions (Appendix G, Part II) and short all-caps lines.
function textHeadings(lines) {
  const out = [];
  const labelRe = new RegExp(`^(${LABELS})\\s+([A-Z0-9IVXLC]+(?:[.-]\\d+)*)\\b[.:\\s-]*(.*)$`, 'i');
  lines.forEach(({ text }, i) => {
    const t = text.trim();
    if (!t || t.length > 90 || /[.,;]$/.test(t) && !/^\d/.test(t)) return;
    const prevBlank = i === 0 || !lines[i - 1].text.trim();
    let m = t.match(labelRe);
    if (m && prevBlank && /^[A-Z]/.test(t)) {
      const lvl = /^(note|item)$/i.test(m[1]) ? 2 : 1;
      return out.push({ line: i, level: lvl, title: t });
    }
    m = t.match(/^(\d{1,2}(?:\.\d{1,2}){0,4})\.?\s+([A-Z][^]{1,80})$/);
    if (m && prevBlank && !/\.\s*\d+$/.test(t) && !/\s{3,}\d+$/.test(t)) {
      return out.push({ line: i, level: m[1].split('.').length, title: t });
    }
    if (prevBlank && /^[A-Z][A-Z0-9 &,'()/-]{3,60}$/.test(t) && /[A-Z]{3}/.test(t) && t.split(/\s+/).length <= 8) {
      out.push({ line: i, level: 1, title: t, caps: true });
    }
  });
  // All-caps lines are a weak signal; demote them under any real section that precedes them.
  let lastStrong = 0;
  for (const h of out) {
    if (h.caps && lastStrong) h.level = Math.min(6, lastStrong + 1);
    else if (!h.caps) lastStrong = h.level;
  }
  return out;
}

function pageRange(lines, start, end) {
  const pages = lines.slice(start, end).map((l) => l.page).filter((p) => p != null);
  return pages.length ? [pages[0], pages[pages.length - 1]] : null;
}

function buildDoc(file, docId) {
  const { kind, lines } = extract(file);
  const heads = kind === 'markdown' ? markdownHeadings(lines) : textHeadings(lines);
  const nodes = [];
  const firstLine = heads.length ? heads[0].line : lines.length;
  const preamble = lines.slice(0, firstLine).map((l) => l.text).join('\n');
  if (preamble.trim()) {
    nodes.push({ id: `${docId}:0`, parent: null, level: 0, title: '(preamble)', start: 0, end: firstLine });
  }
  const stack = [];
  const counters = [];
  heads.forEach((h, i) => {
    const bodyStart = h.setext ? h.line + 2 : h.line + 1;
    let end = lines.length;
    for (let j = i + 1; j < heads.length; j++) if (heads[j].level <= h.level) { end = heads[j].line; break; }
    while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
    const depth = stack.length;
    counters.length = depth + 1;
    counters[depth] = (counters[depth] ?? 0) + 1;
    const node = {
      id: `${docId}:${counters.slice(0, depth + 1).join('.')}`,
      parent: stack.length ? stack[stack.length - 1].id : null,
      level: h.level,
      title: h.title.replace(/[*_`]/g, '').trim(),
      start: h.line,
      bodyStart,
      end,
    };
    nodes.push(node);
    stack.push(node);
  });
  for (const n of nodes) {
    const text = lines.slice(n.start, n.end).map((l) => l.text).join('\n');
    n.hash = sha(text);
    n.chars = text.length;
    n.pages = pageRange(lines, n.start, n.end);
    n.summary = '';
  }
  const fileText = lines.map((l) => l.text).join('\n');
  return { id: docId, path: file, kind, sha: sha(fileText), lines: lines.length, nodes };
}

// ---------- index persistence

const indexDir = (opt) => path.resolve(opt.out ?? opt.index ?? '.tree-index');
const indexFile = (opt) => path.join(indexDir(opt), 'tree.json');

function load(opt) {
  const f = indexFile(opt);
  if (!fs.existsSync(f)) die(`no index at ${f}; run "build" first`);
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

function save(opt, idx) {
  fs.mkdirSync(indexDir(opt), { recursive: true });
  fs.writeFileSync(indexFile(opt), JSON.stringify(idx, null, 2) + '\n');
}

const allNodes = (idx) => idx.docs.flatMap((d) => d.nodes.map((n) => ({ ...n, doc: d })));
function getNode(idx, id) {
  for (const d of idx.docs) {
    const n = d.nodes.find((x) => x.id === id);
    if (n) return { n, d };
  }
  die(`unknown node id "${id}"`);
}

function collectFiles(inputs) {
  const files = [];
  const walk = (p) => {
    const st = fs.statSync(p);
    if (st.isDirectory()) {
      for (const e of fs.readdirSync(p).sort()) {
        if (e.startsWith('.') || e === 'node_modules') continue;
        walk(path.join(p, e));
      }
    } else if (TEXT_EXT.has(path.extname(p).toLowerCase()) || path.extname(p).toLowerCase() === '.pdf') {
      files.push(p);
    }
  };
  for (const i of inputs) {
    if (!fs.existsSync(i)) die(`no such file or directory: ${i}`);
    walk(i);
  }
  return files;
}

// ---------- commands

function cmdBuild(pos, opt) {
  if (!pos.length) die('build needs at least one file or directory');
  const files = collectFiles(pos);
  if (!files.length) die('no supported documents found (.md .txt .pdf)');
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(indexFile(opt), 'utf8')); } catch { /* fresh build */ }
  const prevByKey = new Map();
  for (const d of prev?.docs ?? []) for (const n of d.nodes) prevByKey.set(`${d.path}\0${titlePath(d, n)}`, n);

  const used = new Set();
  const docs = files.map((f) => {
    const rel = path.relative(process.cwd(), f) || f;
    let id = slug(path.basename(f));
    for (let k = 2; used.has(id); k++) id = `${slug(path.basename(f))}-${k}`;
    used.add(id);
    return buildDoc(rel, id);
  });

  let kept = 0, stale = 0;
  for (const d of docs) {
    for (const n of d.nodes) {
      const old = prevByKey.get(`${d.path}\0${titlePath(d, n)}`);
      if (!old?.summary) continue;
      n.summary = old.summary;
      if (old.hash === n.hash && !old.stale) kept++;
      else { n.stale = true; stale++; }
    }
  }
  const idx = { version: 1, builtAt: new Date().toISOString(), commit: gitCommit(), docs };
  save(opt, idx);
  const total = docs.reduce((s, d) => s + d.nodes.length, 0);
  const todo = total - kept;
  console.log(`indexed ${docs.length} doc(s), ${total} node(s) -> ${path.relative(process.cwd(), indexFile(opt))}`);
  if (kept || stale) console.log(`kept ${kept} summary(ies), ${stale} now stale (content changed)`);
  for (const d of docs) if (d.nodes.length <= 1 && d.lines > 200) {
    console.log(`warning: ${d.path} has ${d.lines} lines but no detected structure; a tree will not help here`);
  }
  if (todo) console.log(`${todo} node(s) need a summary: run "todo"`);
}

function titlePath(d, n) {
  const parts = [n.title];
  let p = n.parent;
  while (p) {
    const pn = d.nodes.find((x) => x.id === p);
    if (!pn) break;
    parts.unshift(pn.title);
    p = pn.parent;
  }
  return parts.join(' > ');
}

function span(d, n) {
  if (n.pages) return n.pages[0] === n.pages[1] ? `p.${n.pages[0]}` : `p.${n.pages[0]}-${n.pages[1]}`;
  return `L${n.start + 1}-${n.end}`;
}

function cmdShow(pos, opt) {
  const idx = load(opt);
  const maxDepth = opt.depth ? Number(opt.depth) : Infinity;
  const total = idx.docs.reduce((s, d) => s + d.nodes.length, 0);
  console.log(`# tree-index: ${idx.docs.length} doc(s), ${total} node(s), built ${idx.builtAt.slice(0, 10)}${idx.commit ? ` @ ${idx.commit}` : ''}`);
  console.log('# ! = summary stale (section changed since it was written), ? = no summary yet');
  for (const d of idx.docs) {
    if (opt.doc && d.id !== opt.doc) continue;
    console.log(`\n[${d.id}] ${d.path} (${d.kind})`);
    const depthOf = new Map();
    for (const n of d.nodes) {
      const depth = n.parent ? depthOf.get(n.parent) + 1 : 0;
      depthOf.set(n.id, depth);
      if (depth >= maxDepth) continue;
      const mark = !n.summary ? '?' : n.stale ? '!' : ' ';
      const summary = n.summary ? ` :: ${n.summary}` : '';
      console.log(`${'  '.repeat(depth)}${mark} ${n.id}  ${n.title}  (${span(d, n)})${summary}`);
    }
  }
}

function sectionText(idx, d, n, { shallow = false } = {}) {
  const { lines } = extract(d.path);
  let end = n.end;
  if (shallow) {
    const child = d.nodes.find((x) => x.parent === n.id);
    if (child) end = child.start;
  }
  return lines.slice(n.start, end).map((l) => l.text).join('\n');
}

function cmdTodo(pos, opt) {
  const idx = load(opt);
  const depthOf = new Map();
  const rows = [];
  for (const d of idx.docs) {
    if (fs.existsSync(d.path) && sha(extract(d.path).lines.map((l) => l.text).join('\n')) !== d.sha) {
      console.error(`warning: ${d.path} changed since the index was built; rebuild first`);
    }
    for (const n of d.nodes) {
      depthOf.set(n.id, n.parent ? depthOf.get(n.parent) + 1 : 0);
      if (n.summary && !n.stale) continue;
      const hasKids = d.nodes.some((x) => x.parent === n.id);
      const preview = sectionText(idx, d, n, { shallow: true }).replace(/\s+/g, ' ').slice(0, 400);
      rows.push({ id: n.id, title: n.title, span: span(d, n), chars: n.chars, depth: depthOf.get(n.id), hasKids, stale: !!n.stale, preview });
    }
  }
  rows.sort((a, b) => b.depth - a.depth);
  if (opt.json) return console.log(JSON.stringify(rows, null, 2));
  if (!rows.length) return console.log('every node has a current summary');
  console.log(`${rows.length} node(s) to summarize, deepest first. Read each with "read <id>", then "summarize".`);
  for (const r of rows) {
    console.log(`\n${r.stale ? '!' : '?'} ${r.id}  ${r.title}  (${r.span}, ${r.chars} chars${r.hasKids ? ', has children' : ''})`);
    console.log(`  ${r.preview}${r.preview.length >= 400 ? ' ...' : ''}`);
  }
}

function cmdSummarize(pos, opt) {
  const idx = load(opt);
  let updates;
  if (opt.from) updates = JSON.parse(fs.readFileSync(opt.from, 'utf8'));
  else {
    if (pos.length < 2) die('summarize needs <id> <text> or --from FILE.json');
    updates = { [pos[0]]: pos.slice(1).join(' ') };
  }
  for (const [id, text] of Object.entries(updates)) {
    const { n } = getNode(idx, id);
    n.summary = String(text).replace(/\s+/g, ' ').trim();
    delete n.stale;
  }
  save(opt, idx);
  console.log(`updated ${Object.keys(updates).length} summary(ies)`);
}

function cmdRead(pos, opt) {
  if (!pos.length) die('read needs at least one node id');
  const idx = load(opt);
  const max = opt['max-chars'] ? Number(opt['max-chars']) : 20000;
  for (const id of pos) {
    const { n, d } = getNode(idx, id);
    let text = sectionText(idx, d, n, { shallow: !!opt.shallow });
    console.log(`=== ${n.id} | ${n.title} | ${d.path} ${span(d, n)}`);
    if (text.length > max) {
      const kids = d.nodes.filter((x) => x.parent === n.id).map((x) => x.id);
      text = text.slice(0, max) + `\n[truncated at ${max} of ${text.length} chars${kids.length ? `; read children instead: ${kids.join(' ')}` : ''}]`;
    }
    console.log(text);
    console.log('');
  }
}

// Pointers like "see Appendix G" or "refer to Note 12" are where similarity search
// fails: the target looks nothing like the query. Resolve them to node ids.
function cmdRefs(pos, opt) {
  if (pos.length !== 1) die('refs needs exactly one node id');
  const idx = load(opt);
  const { n, d } = getNode(idx, pos[0]);
  const text = sectionText(idx, d, n, { shallow: true });
  const found = new Map();
  const re = new RegExp(`\\b(${LABELS})\\s+([A-Z0-9IVXLC]+(?:[.-]\\d+)*)\\b`, 'gi');
  for (const m of text.matchAll(re)) found.set(`${m[1].toLowerCase()} ${m[2].toLowerCase()}`, m[0]);
  for (const m of text.matchAll(/§+\s*(\d+(?:\.\d+)*)/g)) found.set(`section ${m[1]}`, m[0]);
  for (const m of text.matchAll(/\]\(#([\w-]+)\)/g)) found.set(`#${m[1]}`, m[0]);

  const candidates = allNodes(idx).filter((x) => x.id !== n.id);

  const rows = [];
  for (const [key, raw] of found) {
    let hits;
    if (key.startsWith('#')) hits = candidates.filter((x) => slug(x.title) === key.slice(1));
    else {
      const [label, ref] = key.split(' ');
      const numbered = /^\d+(\.\d+)*$/.test(ref);
      hits = candidates.filter((x) => {
        const t = x.title.toLowerCase();
        if (t.startsWith(`${label} ${ref}`)) return /^[\s.:\-]|^$/.test(t.slice(label.length + ref.length + 1));
        return numbered && ['section', 'chapter', 'part'].includes(label) && new RegExp(`^${ref.replace(/\./g, '\\.')}\\.?\\s`).test(t);
      });
    }
    rows.push({
      ref: raw,
      local: hits.filter((h) => h.doc.id === d.id).map((h) => h.id),
      other: hits.filter((h) => h.doc.id !== d.id).map((h) => h.id),
    });
  }
  if (!rows.length) return console.log(`no cross-references found in ${n.id}`);
  for (const r of rows) {
    // A pointer almost always means the same document; other docs are listed, not merged in,
    // because templated documents (one report per year) share every section title.
    const target = r.local.length ? r.local.join(', ') : r.other.length ? `(not in this doc) other docs: ${r.other.join(', ')}` : '(unresolved: check the tree by hand)';
    const also = r.local.length && r.other.length ? `  [same title in other docs: ${r.other.join(', ')}]` : '';
    console.log(`${r.ref} -> ${target}${also}`);
  }
}

function cmdFind(pos, opt) {
  if (!pos.length) die('find needs some text');
  const q = pos.join(' ').toLowerCase();
  const hits = allNodes(load(opt)).filter((x) => x.title.toLowerCase().includes(q) || (x.summary ?? '').toLowerCase().includes(q));
  if (!hits.length) return console.log('no matches in titles or summaries');
  for (const h of hits) console.log(`${h.id}  ${h.title}  (${span(h.doc, h)})${h.summary ? ` :: ${h.summary}` : ''}`);
}

const { pos, opt } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();
const commands = { build: cmdBuild, show: cmdShow, todo: cmdTodo, summarize: cmdSummarize, read: cmdRead, refs: cmdRefs, find: cmdFind };
if (!cmd || opt.help || cmd === 'help') { process.stdout.write(USAGE); process.exit(0); }
if (!commands[cmd]) die(`unknown command "${cmd}"\n\n${USAGE}`);
commands[cmd](pos, opt);
