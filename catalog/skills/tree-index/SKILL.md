---
name: tree-index
description: Vectorless retrieval for long structured documents (specs, contracts, filings, manuals, RFCs). Parse each document into a table-of-contents tree where every node has a title, a line or page range and a short summary, then answer by reasoning over the tree, reading whole sections and following cross-references, instead of embedding chunks and taking top-k by similarity.
user-invocable: true
trigger: Answering questions from long documents that have real structure (headings, numbered sections, appendices), especially when several documents share one template (one report per year, one contract per client) or when answers sit behind pointers like "see Appendix G".
---

# Tree Index: Retrieve by Where the Answer Should Be

Similarity search asks which text looks like the question. On long structured documents
that's the wrong question, and it fails two ways:

1. **Same template, different numbers.** Five yearly reports share every section. A question
   about FY2022 debt lands as close to the FY2025 debt section as to the FY2022 one, and the
   answer comes from the wrong year with nothing flagging it.
2. **Pointers.** A section says "see Appendix G". The appendix table looks nothing like the
   query, so it never reaches the top-k. The pointer gets retrieved, the answer doesn't.

This skill does what an analyst does with a 10-K: open the table of contents, go to the
section that should hold the answer, follow the note to the appendix. You (the agent) are
the reasoning step. No embedding model, no vector store, no chunking, so a table is never
split in half.

The method follows PageIndex and the "RAG vs. Vectorless RAG" write-up by Avi Chawla
(Daily Dose of Data Science). This skill is an independent, dependency-free implementation.

## When to use it, and when not

Use it for: specs, RFCs, contracts, policies, regulatory filings, manuals, long design docs,
books. Anything with headings you would navigate by hand.

Don't use it for: piles of short unrelated text (tickets, chat logs, notes). There's no
table of contents to reason over. `build` warns when a long document has no detectable
structure; take the hint and use search or a vector index instead.

Know the cost before you pick it. Every question costs reasoning over the tree plus reading
full sections, and building summaries costs a pass over every node. It buys accuracy on
structured documents, not cheapness. For a high-volume endpoint where a metadata filter
(fiscal year, client id) fixes the mixup, a filtered vector search is the cheaper answer.

## Tooling

`scripts/tree-index.mjs` is a zero-dependency Node script (Node 20+). PDFs need
`pdftotext` (poppler-utils). Run it from the project root; the index lives in
`.tree-index/tree.json`.

| Command | What it does |
| --- | --- |
| `build <file\|dir>... [--out DIR]` | Parse `.md`, `.txt`, `.pdf` into a tree. Keeps existing summaries; marks them stale when their section changed. |
| `show [--depth N] [--doc SLUG]` | Print the tree with ids, ranges and summaries. This is what you reason over. |
| `todo [--json]` | Nodes missing a summary or holding a stale one, deepest first, with a preview. |
| `summarize <id> <text>` / `summarize --from map.json` | Write summaries. |
| `read <id>... [--shallow] [--max-chars N]` | Full section text under a citation header (path plus line or page range). |
| `refs <id>` | Cross-references in a section ("see Appendix G", "Note 12", "§ 4.2", `#anchor`) resolved to node ids, same document first. |
| `find <text>` | Literal match over titles and summaries, for when you already know the name. |

Node ids look like `fy2022:3.1`: the document slug, then the position in the tree. They are
positional, not the document's own numbering, so always cite the title and range too.

Add `.tree-index/` to `.gitignore` unless the team decides to commit the index.

## Building the index

1. **Parse.** `node <skill>/scripts/tree-index.mjs build docs/` (any mix of files and
   directories). Markdown uses real headings and ignores fenced code. Text and PDFs use
   layout heuristics: numbered sections, labelled divisions (Part, Chapter, Appendix, Annex,
   Schedule, Exhibit, Note) and short all-caps lines. Skim `show` once. If the tree is wrong
   (a PDF with odd layout, a `.docx`), convert to markdown first (`pandoc`, `pdftotext`),
   fix the headings by hand, and rebuild. A bad tree makes every later answer worse.
2. **Summarize, leaves first.** Run `todo`. For each node: `read <id> --shallow`, then write
   one or two sentences saying what the section *contains*, not what it's about. Name the
   specifics a question would hinge on: the period, the entity, the figures it holds, and
   any pointer out ("totals here, breakdown in Appendix G"). Parents summarize their
   children's summaries plus their own body. Batch with `summarize --from map.json`.
   Use the cheapest capable model for this pass if you can delegate it.
3. **Version it.** The index records the commit and a hash per section. After the source
   changes, rebuild: unchanged summaries are kept, changed sections are marked `!` stale.
   Clear `todo` before trusting the index again. A stale summary is a silent wrong answer.

## Answering a question

1. **Orient.** `show` (use `--depth 2` on huge trees, then expand the branch you need).
   Read the question for constraints that pick a branch: which document, which year, which
   party, which version.
2. **Select.** Pick the few nodes most likely to hold the answer, reasoning from titles and
   summaries. Say why each was picked. Include the node a summary points to, not just the
   node whose title matches.
3. **Read.** `read <ids>` for full sections. Never answer from a summary alone; summaries
   route, sections answer.
4. **Follow pointers.** `refs <id>` on every section you read. If it points somewhere you
   haven't read and the answer could live there, read it.
5. **Check sufficiency.** Does the evidence fully answer the question, for the right
   document? If not, go back to the tree and open more nodes. Stop after a few rounds and
   say what's missing rather than guessing.
6. **Answer with citations.** Every claim cites document, section title and range, e.g.
   `fy2022.md, Appendix G Debt Schedule, L25-30` or `report.pdf p.12`. If the tree had two
   documents with the same section, say which one you used.

In a conversation, carry the documents you've already narrowed to into follow-ups. "What
about liabilities?" after a question on assets means the same report.

## Rules

- The tree routes; the source text answers. Nothing is stated on the strength of a summary.
- Every answer cites the section and range it came from.
- Templated documents are disambiguated explicitly. Name the document or period you read.
- A summary that's stale (`!`) is treated as missing until rewritten.
- If the tree and the source disagree, the source wins and the tree gets rebuilt.

## Pairs with

- `codebase-index` keeps durable written knowledge about a repo. `tree-index` is how you
  read long documents, including that index once it grows past a few files.
- `graphify` traverses code structure. `tree-index` traverses document structure.
