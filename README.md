# orby-agent-config (`oac`)

Configure **any** AI coding agent or editor for a project from **one** canonical rules
source. Pick the tools your teammates actually use — Claude Code, Cursor, GitHub
Copilot / VS Code, Codex, Windsurf, and more — and `oac` generates the right config
file for each (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*.mdc`,
`.github/copilot-instructions.md`, `.windsurfrules`) plus copies the skills you choose
into place. Same rules in, same behavior out — regardless of which tool a developer opens.

Cross-platform (Windows / macOS / Linux). Each project gets its **own** self-contained
config, so nested repos inside a workspace can each have a different setup.

---

## How it works

```
orby-agent-config/            ← this repo: the master catalog + the CLI
  catalog/
    rules/                    ← canonical source of truth (markdown fragments)
      00-operating-rules.md   ← numbered engineering ruleset (precision, token economy, delegation)
      20-voice-and-tone.md    ← delivery & persona
      stacks/                 ← optional stack-specific rules
    skills/<name>/SKILL.md    ← master skills catalog
    targets.json              ← supported agents/editors
  src/  bin/                  ← the CLI

your-project/                 ← anywhere on disk
  orby-agent.config.json      ← per-project manifest (what was selected)
  AGENTS.md  CLAUDE.md  …      ← generated config, one per selected tool
  .claude/skills/<name>/       ← skills copied in (Claude)
```

You edit rules **once** in `catalog/rules/`. Each project's generated files are
assembled from those fragments and wrapped in a managed block
(`<!-- oac:start --> … <!-- oac:end -->`) so re-running keeps your hand edits outside
the block and only refreshes what `oac` owns.

---

## Install & run

Requires **Node.js ≥ 18**. This package is **not published to npm** — it's installed
directly from the internal GitHub repo, so any developer with access to
`OrbyJets/orby-agent-config` can use it with their existing GitHub auth.

**Run without installing** (always latest `main`):

```bash
# SSH (recommended for the private repo — uses your GitHub SSH key)
npx git+ssh://git@github.com/OrbyJets/orby-agent-config.git init

# or HTTPS (uses your git credential helper / token)
npx github:OrbyJets/orby-agent-config init
```

**Install the `oac` command globally:**

```bash
# SSH
npm install -g git+ssh://git@github.com/OrbyJets/orby-agent-config.git
# or HTTPS
npm install -g github:OrbyJets/orby-agent-config

oac init        # now available everywhere
```

Pin to a tag or branch by appending `#<ref>`, e.g.
`npm install -g github:OrbyJets/orby-agent-config#v0.1.0`. Update later with the same
install command. To uninstall: `npm uninstall -g orby-agent-config`.

**Working inside a clone of this repo** (for editing the catalog/CLI):

```bash
npm install && npm link    # then: oac init   (re-run npm link per Node version if you use nvm)
node bin/cli.js init       # or run directly without linking
```

> Access: because the repo is private, developers must be members of the `OrbyJets` org
> (or have a token with `repo` scope). SSH is the smoothest for most setups.

---

## Quick start

```bash
cd ~/work/your-project
oac init            # interactive: pick agents/editors, stacks, skills
# …edit catalog rules later, then in each project:
oac sync            # regenerate config from the updated catalog
oac doctor          # verify the project's config is intact and current
```

Non-interactive (CI / scripted):

```bash
oac init --yes --targets=claude,cursor,codex --stacks=nextjs --skills=my-skill
```

### Adding skills to a repo that already has its own agent config

Use `--skills-only` to install skills + write the manifest **without** touching existing
`AGENTS.md` / `CLAUDE.md` / `CURSOR.md` / `.cursorrules` / etc. Skills land in
`.claude/skills/`; no rule files are generated or modified.

```bash
oac init --yes --skills-only --skills=commit-pr,review-pr --dir=~/work/existing-repo
```

---

## Pre-push PR review hook

Get a **Copilot-style PR review on every `git push`**, before the code leaves your machine.
A git `pre-push` hook runs the [`pr-review`](catalog/skills/pr-review/SKILL.md) skill against
the diff being pushed (headless Claude Code), prints a summary + severity-tagged findings,
and **blocks the push only when a high-severity bug or security issue is found**.

**Requires:** the [`claude`](https://docs.claude.com/en/docs/claude-code) CLI on your `PATH`.
If it's missing, the hook prints a notice and lets the push through (never blocks you).

### 1. Install the skill into your repo

```bash
oac add-skill pr-review          # → .claude/skills/pr-review/   (run inside the repo)
```

The hook calls `claude -p "/pr-review"`, which loads this skill from `.claude/skills/`.

### 2. Install the hook

The hook ships as **two files** in [`hooks/`](hooks/):

- `pr-review-run` — the shared review body (reads the pre-push stdin, runs the review, gates on the verdict). One source of truth.
- `pre-push` — a thin **global wrapper** that delegates to a repo-local hook first, then runs `pr-review-run`.

**This repo only** (recommended — try it before rolling out). No wrapper needed; install the
body directly as the repo's hook:

```bash
# from the orby-agent-config clone:
cp hooks/pr-review-run ~/work/your-repo/.git/hooks/pre-push
chmod +x ~/work/your-repo/.git/hooks/pre-push
```

**All your repos at once** (global) — git's `core.hooksPath` makes every repo use the wrapper,
which delegates to a repo-local `.git/hooks/pre-push` first so existing per-repo hooks keep
working:

```bash
mkdir -p ~/.config/git/hooks
cp hooks/pre-push hooks/pr-review-run ~/.config/git/hooks/
chmod +x ~/.config/git/hooks/pre-push ~/.config/git/hooks/pr-review-run
git config --global core.hooksPath ~/.config/git/hooks
```

**Husky repos** — git points `core.hooksPath` at `.husky/`, so the global wrapper above is
bypassed. Call the body directly from `.husky/pre-push` instead (assuming `pr-review-run` is on
your `PATH` or installed at `~/.config/git/hooks/`):

```sh
# .husky/pre-push
exec ~/.config/git/hooks/pr-review-run "$@"
```

### 3. Use it

```bash
git push                      # review runs automatically
git push --no-verify          # skip all hooks
SKIP_PR_REVIEW=1 git push     # skip just this review
claude -p "/pr-review origin/main..HEAD"   # run the review by hand, anytime
```

### Tuning

- **Change the gate** — by default only `VERDICT: BLOCK` (a `high`-severity finding) rejects
  the push. Edit the `grep '^VERDICT: BLOCK'` line in `hooks/pre-push`, or adjust the severity
  rules in `catalog/skills/pr-review/SKILL.md`.
- **Large diffs** are capped at 4000 lines and the review times out after 180s — both fail
  *open* (push allowed) so a slow review never traps you.

---

## Cheat sheet

| Command | What it does |
| --- | --- |
| `oac init` | Interactive setup — pick agents/editors, stacks, skills; writes all config + the manifest |
| `oac sync` | Regenerate every managed config file from the current catalog + manifest |
| `oac list` | Show all targets, skills, and stacks |
| `oac list targets` / `list skills` / `list stacks` | Show just one category |
| `oac add-skill <name>` | Add a catalog skill to this project |
| `oac remove-skill <name>` | Remove a skill (and its installed folder) |
| `oac doctor` | Verify config: missing files, broken managed blocks, stale catalog |
| `oac --help` | Full usage |
| `oac --version` | Print version |

### Options

| Flag | Meaning |
| --- | --- |
| `--dir=<path>` | Operate on another directory (default: current) |
| `--targets=a,b` | Agents/editors: `claude`, `codex`, `cursor`, `copilot`, `windsurf` |
| `--stacks=a,b` | Stack rule fragments (see `oac list stacks`) |
| `--skills=a,b` | Skills to install |
| `--yes`, `-y` | Non-interactive; use defaults / flag values |

---

## Targets and the files they get

| Target | Reads | `oac` writes |
| --- | --- | --- |
| Claude Code | `CLAUDE.md`, `.claude/skills/` | `CLAUDE.md` + copies selected skills |
| Codex / universal | `AGENTS.md` | `AGENTS.md` |
| Devin | `AGENTS.md` | `AGENTS.md` (shared/deduped with Codex) |
| Cursor | `.cursor/rules/*.mdc` | `.cursor/rules/oac.mdc` (with frontmatter) |
| GitHub Copilot / VS Code | `.github/copilot-instructions.md` | same |
| Windsurf | `.windsurfrules` | same |
| Ollama | — (launches a harness) | `.oac/ollama/LAUNCH.md` + `.sh`/`.ps1` launchers |

> **Skills note:** only Claude has a native skills mechanism, so skills are physically
> copied into `.claude/skills/` and loaded on demand (Claude's config just lists them).
> Every other tool reads a single instruction file, so the **full text of each selected
> skill is inlined** into that file (`AGENTS.md`, `.cursor/rules/oac.mdc`,
> `.github/copilot-instructions.md`, `.windsurfrules`) — the guidance reaches the tool
> instead of pointing at files it can't open. A skill's **bundled markdown** (its
> `references/`, `examples/`, …) is inlined too, under headings that match the paths the
> playbook cites, so router-style skills stay portable. Only **non-text** extras
> (scripts, assets, binaries) can't be inlined — skills that ship them say so, and those
> files travel only with a Claude Code install.

### Ollama models

Ollama is different from the others: it doesn't read a rules file. Instead,
`ollama launch <app> --model <tag>` starts an existing harness (Claude Code, Codex,
OpenCode, OpenClaw, Hermes, Codex App) with an Ollama model as the engine — and that
harness reads the `CLAUDE.md` / `AGENTS.md` that `oac` already generated.

Select the **Ollama** target and provide your model tags (defaults:
`kimi-k2.6:cloud`, `gemma4:cloud`, `minimax3:cloud`). `oac` writes:

- `.oac/ollama/LAUNCH.md` — a table of every `ollama launch` command for this project.
- `.oac/ollama/<app>--<model>.sh` and `.ps1` — one runnable launcher per app × model,
  each `cd`-ing to the project root so the rules files are picked up.

```bash
oac init --yes --targets=claude,codex,ollama \
  --ollama-models="kimi-k2.6:cloud,qwen3-coder:480b-cloud"

# then, from the project root:
./.oac/ollama/claude--kimi-k2.6-cloud.sh        # macOS / Linux
.\.oac\ollama\claude--kimi-k2.6-cloud.ps1       # Windows (PowerShell)
```

### Windows support

Fully cross-platform. The CLI uses only Node's `fs`/`path` (no shell, no symlinks),
and every Ollama launcher ships as both `.sh` (macOS/Linux) and `.ps1` (Windows
PowerShell 5.1+/7). Line endings are preserved per-file, and the executable bit is set
where the OS supports it (a no-op on Windows). Run via `npx github:OrbyJets/orby-agent-config`
(or the SSH form) on any OS.

---

## Adding rules and skills

- **Rules:** add or edit markdown in `catalog/rules/`. Files are included in filename
  order — prefix with numbers (`00-`, `10-`) to control sequence. Add stack-specific
  rules under `catalog/rules/stacks/<id>.md` with a `label:` frontmatter field.
- **Skills:** copy `catalog/skills/_example/` to `catalog/skills/<your-skill>/`, edit the
  `SKILL.md` frontmatter (`name`, `description`, `trigger`) and body. The whole folder is
  copied into a project when the skill is selected — including any `scripts/`,
  `references/`, `assets/`, `templates/`, or `agents/` subfolders.

  The Tobii skill format is supported directly: drop a skill folder that contains both
  `SKILL.md` and a `skill.json` (`name`, `version`, `description`, `tags`, `entrypoint`)
  and `oac` reads its metadata from `skill.json`, falling back to the `SKILL.md`
  frontmatter (folded YAML `description: >` blocks included).

- **Importing skills** with `oac import-skill` instead of copying by hand:

  ```bash
  oac import-skill ~/Downloads/some-skill                 # a single skill folder
  oac import-skill ./skills-repo --all                    # every skill under a folder
  oac import-skill https://github.com/org/skills.git --all --from=skills
  oac import-skill <src> --name=my-id --force             # rename / overwrite
  ```

  It validates that each source has a `SKILL.md`, copies the whole folder (subdirs
  included) into `catalog/skills/`, and warns when it spots project-specific terms
  (e.g. a hard-coded company name or build tool) you may want to genericize first.

After editing the catalog, run `oac sync` in each project to roll out the change.

See [`docs/CHEATSHEET.md`](docs/CHEATSHEET.md) for the condensed command reference.
