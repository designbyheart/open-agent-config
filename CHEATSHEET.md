# `oac` cheat sheet

## Commands

```
oac init                 Interactive setup (agents/editors, stacks, skills) → writes config + manifest
oac sync                 Regenerate all managed config files from the catalog + manifest
oac list                 List targets, skills, and stacks
oac list targets         List supported agents/editors
oac list skills          List catalog skills
oac list stacks          List stack rule fragments
oac import-skill <src>   Import a skill into the catalog from a local path or git URL
oac add-skill <name>     Install a catalog skill into this project
oac remove-skill <name>  Remove a skill (and its installed folder)
oac doctor               Verify project config: missing files, broken blocks, stale catalog
oac keys                 Print this project's aliases, reference codes, skills and commands
oac --help               Usage
oac --version            Version
```

## Options

```
--dir=<path>          Target directory (default: current directory)
--targets=a,b         claude, codex, devin, cursor, copilot, windsurf, ollama
--stacks=a,b          Stack fragments (see: oac list stacks)
--skills=a,b          Skills to install
--ollama-models=a,b   Model tags for the ollama target (e.g. kimi-k2.6:cloud)
--skills-only         Install skills + manifest only; never write/modify rule files
--yes, -y             Non-interactive (use defaults / flags)
```

## Common flows

```bash
# First-time setup in a project
oac init

# Scripted setup (no prompts)
oac init --yes --targets=claude,cursor,codex --stacks=nextjs

# After editing catalog/rules/* in this repo, roll out to a project
cd ~/work/some-project && oac sync

# Check a project is healthy / up to date
oac doctor

# Configure a project elsewhere without cd-ing
oac sync --dir=~/work/other-project
```

## Per-project files

```
agent.config.json            manifest (selected targets/skills/stacks/ollama, source hash)
AGENTS.md                         universal (Codex, Devin, AGENTS.md-aware tools)
CLAUDE.md                         Claude Code
.claude/skills/<name>/            installed skills (Claude)
.cursor/rules/oac.mdc             Cursor
.github/copilot-instructions.md   Copilot / VS Code
.windsurfrules                    Windsurf
.oac/ollama/LAUNCH.md             Ollama launch cheat sheet (commands table)
.oac/ollama/<app>--<model>.sh     Ollama launcher (macOS/Linux, executable)
.oac/ollama/<app>--<model>.ps1    Ollama launcher (Windows PowerShell)
```

## Ollama

```bash
# Configure Ollama harness launchers
oac init --yes --targets=claude,codex,ollama --ollama-models="kimi-k2.6:cloud,gemma4:cloud"

# Launch a harness with an Ollama model (run from project root)
ollama launch claude --model kimi-k2.6:cloud
./.oac/ollama/claude--kimi-k2.6-cloud.sh        # macOS / Linux
.\.oac\ollama\claude--kimi-k2.6-cloud.ps1       # Windows
```

Generated content lives between `<!-- oac:start -->` and `<!-- oac:end -->`.
Edit freely **outside** the markers; `oac sync` only rewrites what's inside.

## Communication patterns (per project)

```bash
# Scaffolded on init; yours to edit, never overwritten
$EDITOR .oac/communication-patterns.md
oac sync                    # push the edits into every generated config

oac keys                    # print the reference card (any terminal / tmux pane)
/keys                       # same card, inside a Claude Code session

oac init --yes --no-patterns   # skip the scaffold
```

Holds the project-tunable half: banned phrases, house style, reference-point codes
(`D1` decisions, `R1` risks, `F1` findings), aliases (`scr`, `eli`, `focus`, `ref`),
boundaries (commit policy, off-limits paths), domain vocabulary, and example
responses. `oac doctor` flags it when edited but not synced.
