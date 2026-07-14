---
name: agent-memory
description: Keep the project's agent-instruction file current as the codebase evolves — the file an assistant reads for project context (CLAUDE.md, AGENTS.md, .cursor rules, Copilot instructions). Generalized from "Claude.md management" so it maintains whichever memory file the project uses. Use when structure, conventions, or commands drift out of sync with what the agent is told.
user-invocable: true
trigger: The project's agent-instruction/memory file is missing, stale, or out of sync with the actual structure, commands, or conventions the code now uses.
---

# Agent Memory Maintenance

Keep the file that gives an AI assistant its project context accurate. When it drifts from reality, the agent makes wrong assumptions. This skill maintains that file — whatever it's called in this project (`CLAUDE.md`, `AGENTS.md`, `.cursor/rules/*`, `.github/copilot-instructions.md`).

## What belongs in the memory file

- **Project shape** — what this repo is, the main entry points, the high-level layout.
- **Commands that matter** — build, test, lint, run, deploy. The exact invocations.
- **Conventions** — naming, structure, error handling, testing style the codebase actually follows.
- **Constraints & gotchas** — things that will bite an agent that doesn't know them (a generated file not to edit, an unusual toolchain, an env requirement).

Keep it tight. This is a briefing, not documentation — every line should change how the agent behaves.

## When to update

- New top-level area, package, or service added.
- Build/test/run commands change.
- A convention is established or changed.
- The agent repeatedly gets something wrong that a line here would fix.

## Method

1. Read the current memory file (or create one from the template the project's tooling expects).
2. Compare each claim against the real repo — do the commands still work, does the structure still match?
3. Update stale entries; add newly-important context; delete what no longer applies.
4. Keep it concise and skimmable — prune as readily as you add.
5. If the project generates this file from a canonical source (as this catalog does), edit the source and re-run the generator rather than hand-editing the output.

## Rules

- Accuracy over completeness — a wrong line is worse than a missing one.
- Don't let it bloat into a wiki; it's the high-signal briefing the agent reads every time.
- Respect managed/generated regions — edit the source of truth, not inside a generated block.
