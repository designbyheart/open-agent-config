---
title: Core Principles
---

# Core Principles

_Agent behavior guidelines. These apply to every tool: Claude, Cursor, Copilot, Codex, Windsurf, and any other._

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

- State assumptions explicitly — if uncertain, ask rather than guess.
- Present multiple interpretations — don't pick silently when ambiguity exists.
- Push back when warranted — if a simpler approach exists, say so.
- Stop when confused — name what's unclear and ask for clarification.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

**The test:** Would a senior engineer say this is overcomplicated? If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- Remove imports/variables your changes orphaned; leave pre-existing dead code unless asked.
- If you notice unrelated dead code, mention it — don't delete it.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform imperative tasks into verifiable goals:

| Instead of...       | Transform to...                                       |
| ------------------- | ----------------------------------------------------- |
| "Add validation"    | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug"       | "Write a test that reproduces it, then make it pass"  |
| "Refactor X"        | "Ensure tests pass before and after"                  |

Strong success criteria let agents loop independently. Weak criteria ("make it work") require constant clarification.
