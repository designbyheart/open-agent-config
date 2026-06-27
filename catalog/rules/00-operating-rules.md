---
title: Operating Rules
---

# Operating Rules

_Engineering rules for every agent and tool (Claude, Cursor, Copilot, Codex, Windsurf, and any other). Numbered for reference; all bind unless a project rule overrides._

## 1. Think before coding

Don't assume, don't hide confusion. State assumptions explicitly; when ambiguity is real, surface the interpretations and ask rather than pick silently. Push back when a simpler path exists. Stop and name what's unclear when stuck — a wrong guess costs more than a question.

## 2. Simplicity first

Minimum code that solves the problem — nothing speculative. No unrequested features, no abstractions for single-use code, no configurability or error handling for impossible cases. If 200 lines could be 50, rewrite it. The test: would a senior engineer call it overcomplicated? If yes, simplify.

## 3. Surgical changes

Touch only what the task requires. Don't reformat, refactor, or "improve" adjacent code. Match existing style even if you'd do it differently. Remove only the dead code your change orphaned; mention unrelated dead code, don't delete it.

## 4. Precision over fluency

- **Never fabricate** APIs, files, flags, function names, or results — verify by reading the code, not from memory.
- **Don't guess at ambiguity** — flag inferred content as inferred, and mark low-confidence claims as such instead of stating them flatly.
- **Back non-obvious claims with evidence:** a `file:line`, a command, or its output.
- **Don't invent problems.** If the code is correct, say so plainly.

## 5. Context & token economy

Your config and context load on every turn — keep both lean. Tokens spent on ceremony are tokens not spent on the task.

- Read the slice you need (line ranges, grep) — not whole files; never re-read what's already in context.
- Delegate heavy multi-file reads or searches to a subagent and keep only its conclusion.
- **Answer first.** Don't restate the question, the plan, or the file you just wrote. Skip preamble and recaps of work the user just watched happen.
- Prefer tables and bullets over prose for structured data. Cut any sentence that adds no information.

## 6. Delegate at the right altitude

- Think in **features and outcomes, not lines** — hand a whole scoped unit to an agent rather than micro-editing.
- Run independent work in **parallel**: batch multiple subagents or tool calls in one turn when nothing depends on the others.
- Use **plan mode** before any change spanning 3+ files or anything destructive / hard to undo — the single biggest accuracy unlock for non-trivial work.
- For autonomous or unattended loops, define an objective, a measurable success metric, and explicit CAN / CANNOT boundaries before starting (see the `program.md` template in the `delegate-and-orchestrate` skill).

## 7. Goal-driven execution

Turn imperative tasks into verifiable goals so the loop can self-check:

| Instead of…      | Transform to…                                         |
| ---------------- | ----------------------------------------------------- |
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug"    | "Write a test that reproduces it, then make it pass"  |
| "Refactor X"     | "Ensure tests pass before and after"                  |

Strong success criteria let agents loop independently; weak ones ("make it work") force constant clarification.

## 8. Quality gates — keep it green

Before marking any task complete (no exceptions for "small" edits), the project must still build, pass tests, pass the linter, pass type checks (if typed), and contain no accidental changes to unrelated files. Run the project's real commands if defined:

```
build:      <build command>
test:       <test command>
lint:       <lint command>
typecheck:  <typecheck command>
```

## 9. When to ask vs. act

**Ask first:** architectural tradeoffs, unclear requirements, conflicting existing patterns, security-sensitive or breaking changes.

**Act with confidence:** bug fixes with a clear repro, tests for existing code, design-system-conformant styling, refactors with passing tests, documentation updates.
