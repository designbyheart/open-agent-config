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
      00-core-principles.md
      10-code-quality.md
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

Requires **Node.js ≥ 18**. No global install needed:

```bash
npx orby-agent-config init
```

Or install the command (`oac`) globally / link during development:

```bash
npm install -g orby-agent-config      # then: oac init
# or, working in this repo:
npm install && npm link               # then: oac init
node bin/cli.js init                  # without linking
```

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
> copied into `.claude/skills/`. For other tools the same skills are listed as
> reference playbooks inside their instruction file.

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
where the OS supports it (a no-op on Windows). Run via `npx orby-agent-config` on any OS.

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
