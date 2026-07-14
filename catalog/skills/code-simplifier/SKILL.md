---
name: code-simplifier
description: Reduce complexity in existing (often AI-generated) code without changing its behavior — strip redundancy, flatten needless indirection, and cut technical debt. Use after code works but reads as bloated, over-abstracted, or repetitive.
user-invocable: true
trigger: A working but bloated, repetitive, or over-abstracted piece of code that should be simplified without changing what it does.
---

# Code Simplifier

Make working code smaller and clearer while keeping its behavior identical. This is a refactor, not a rewrite — behavior in, same behavior out.

## Preconditions

There must be a way to prove behavior is unchanged: an existing test suite, or tests you add first to pin current behavior. Never simplify untested code without characterization tests.

## What to remove

- **Redundancy** — duplicated blocks, copy-pasted branches, repeated literals that want a constant.
- **Dead weight** — unused variables, imports, parameters, and unreachable branches.
- **Needless indirection** — one-line wrappers that add nothing, premature abstractions used once, layers that only forward calls.
- **Over-defensive noise** — checks for conditions that cannot occur, redundant null guards behind guarantees already established.
- **Convoluted control flow** — deep nesting that flattens with early returns; boolean gymnastics that a guard clause replaces.

## Method

1. Confirm tests exist and pass (or add them first).
2. Make one simplification at a time.
3. Run tests after each — a green run is the license to keep the change.
4. Stop when further cuts would hurt clarity or remove real safety.

## Rules

- Behavior must not change. If a simplification alters output or timing, revert it.
- Do not "simplify" by deleting error handling that guards real failure modes.
- Prefer readable over clever — the goal is code the next person understands fast, not the fewest characters.
- Report what was removed and why, with the before/after size.
