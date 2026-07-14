---
name: code-review
description: On-demand structured review of a code change (diff, branch, or pull request) for correctness, security, performance, and maintainability. Produces severity-tagged findings and a ready-to-paste PR description. Use before merging or when asked to check code quality.
user-invocable: true
trigger: Reviewing a diff, branch, or PR before merge — wanting a structured, severity-ranked list of issues rather than a vague impression.
---

# Code Review

Review a set of changes the way a careful senior engineer would: find real problems, rank them by severity, and say what to do about each.

Note: this overlaps with pull-request-gating skills in this catalog (e.g. `pr-review`). Use this one for interactive, on-demand review; use the gating skill for the automated pre-push hook.

## Scope

Review only the change under discussion (the diff / the branch against its base), plus the immediate context needed to judge it. Do not audit the whole repository.

## What to check

- **Correctness** — logic errors, off-by-one, wrong conditionals, unhandled cases, broken invariants, race conditions.
- **Security** — injection, unsafe input handling, secrets in code, auth/authorization gaps, unsafe deserialization, missing validation.
- **Performance** — N+1 queries, needless allocations in hot paths, blocking calls on the wrong thread, accidental O(n²).
- **Error handling** — swallowed errors, missing failure paths, unclear messages.
- **Maintainability** — naming, dead code, duplication, tests missing for new behavior, public-interface changes.

## Output

For each finding:

| Severity | Location | Issue | Fix |
|----------|----------|-------|-----|
| high / medium / low | file:line | what's wrong and why it matters | the concrete change |

- **high** = bug or security hole that should block merge.
- **medium** = should fix, not a blocker.
- **low** = style / nit.

End with a **verdict** (block / approve-with-changes / approve) and a short **PR description** summarizing what changed and why, suitable to paste into the pull request.

## Rules

- Every finding names a concrete failure or a concrete fix — no "consider maybe reviewing this."
- Rank by severity; do not bury a high-severity bug under nits.
- If the change is clean, say so plainly rather than inventing issues.
