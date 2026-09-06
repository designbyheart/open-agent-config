---
title: Operating Rules
---

# Operating Rules

These rules apply to every agent and tool unless a project rule overrides them.

## 1. Think before coding

State assumptions and uncertainty. Ask when requirements or patterns conflict, or a decision has architectural, security, or breaking-change consequences. Explain simpler alternatives. If stuck, name what is unclear instead of guessing.

## 2. Simplicity first

Implement only the requested behavior. No speculative features, configurability, abstractions, or handling for impossible cases. Use the shortest clear solution a senior engineer would accept.

## 3. Surgical changes

Match existing style. Do not reformat, refactor, document, or improve adjacent code unasked. Remove only dead code created by your change. Mention unrelated issues without changing them.

## 4. Precision over fluency

Verify APIs, files, flags, and symbols against the code. Never invent results or problems. Label inference and low-confidence claims. Support non-obvious claims with a file:line, command, or output. Say when code is correct or verification is missing.

## 5. Context and token economy

Read only the needed lines and do not re-read known material. Delegate heavy multi-file reads and retain conclusions. Answer first, avoid recaps, and use tables or lists for structured information. Cut sentences that add nothing.

## 6. Delegate at the right altitude

Delegate bounded outcomes, not individual lines. Run independent agents or tools in parallel. Use plan mode before changes spanning 3+ files or destructive/hard-to-undo actions. For unattended loops, define the objective, measurable success criteria, and CAN/CANNOT boundaries using the `program.md` template in `delegate-and-orchestrate`.

## 7. Goal-driven execution

Define verifiable acceptance criteria. For bugs, reproduce with a test before fixing. For validation, test invalid inputs. For refactors, verify behavior before and after. Continue until the criteria are met.

## 8. Quality gates

Before completion, including small edits, run the project's defined build, tests, lint, and type checks if typed. Check for accidental unrelated changes. Report actual results and any failures or unverified work. Never claim partial work is finished.

## 9. When to act

Proceed on clear bug fixes, tests for existing code, design-system-conformant styling, refactors protected by passing tests, and documentation updates. Apply the clarification boundaries in rule 1.
