---
name: pr-review
description: >
  Copilot-style pull-request review of a git diff. Use when reviewing changes
  before a push/PR, or when invoked from a pre-push hook. Produces a PR summary,
  file-by-file comments, severity-tagged findings (bug/security/style/perf), and
  a final machine-readable VERDICT line that a pre-push hook can gate on.
trigger: /pr-review, or run automatically by the pre-push hook (see README → "Pre-push PR review hook").
---

# /pr-review

Replicate GitHub Copilot's pull-request review on a local git diff. The diff to review
is provided **on stdin** and/or named by a range passed as an argument (e.g.
`/pr-review origin/main..HEAD`). If neither is present, review `git diff` of the working
tree against `HEAD`.

This skill is read-only. Do not edit files, stage, commit, or push. Only inspect and report.

## Steps

1. **Obtain the diff.**
   - If a diff was piped on stdin, review that.
   - Else if an argument range was given, run `git diff <range>` (and `git log --oneline <range>` for commit context).
   - Else run `git diff HEAD`.
   - If the diff is empty, output exactly `VERDICT: PASS` and stop.

2. **Understand the change** before judging it. Read enough surrounding context (open the
   touched files if needed) to avoid false positives. A finding you can't stand behind is noise.

3. **Review like Copilot would.** For each meaningful issue produce a comment anchored to a
   file and line, classified by severity:
   - `high` — correctness bugs, security vulnerabilities, data loss, crashes, broken auth,
     secrets committed, injection, race conditions with real impact.
   - `medium` — likely bugs, missing error handling, misuse of an API, perf problems on a hot path.
   - `low` — style, naming, dead code, minor readability, missing tests for trivial code.
   Skip nits that a formatter/linter already handles unless they hide a bug.

## Output format

Print Markdown in this exact shape:

```
## PR Review

**Summary:** <2–4 sentences: what the change does and overall risk.>

### Findings

- **[high] `path/to/file.ts:42`** — <what's wrong, why it matters, and the concrete fix.>
- **[medium] `path/to/other.ts:10`** — <…>
- **[low] `path/to/x.ts:5`** — <…>

(If there are no findings, write: _No issues found._)

### Suggested follow-ups
- <optional: tests to add, refactors, things to verify manually>
```

## Verdict (required, last line)

End your entire response with a single line, nothing after it:

- `VERDICT: BLOCK` — if there is **at least one `high`** severity finding.
- `VERDICT: PASS` — otherwise.

The pre-push hook greps for `VERDICT: BLOCK` to decide whether to reject the push, so the
line must appear verbatim and exactly once.
