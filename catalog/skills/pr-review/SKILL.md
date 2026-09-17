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
   - If a PR number or URL was given, use `gh pr view` / `gh pr diff` for that PR.
   - Else if a diff was piped on stdin, review that.
   - Else if an argument range was given, run `git diff <range>` (and `git log --oneline <range>` for commit context).
   - Else run `git diff HEAD`.
   - If the diff is empty, output exactly `VERDICT: PASS` and stop.

2. **Understand the change** before judging it. Read enough surrounding context (open the
   touched files if needed) to avoid false positives. A finding you can't stand behind is noise.

3. **Review like Copilot would.** For each meaningful issue produce a comment anchored to a
   file and line, classified by severity:
   - `high`: correctness bugs, security vulnerabilities, data loss, crashes, broken auth,
     secrets committed, injection, race conditions with real impact.
   - `medium`: likely bugs, missing error handling, misuse of an API, perf problems on a hot path.
   - `low`: style, naming, dead code, minor readability, missing tests for trivial code.
   Skip nits that a formatter/linter already handles unless they hide a bug.

## Output format

Keep the whole report as minimal as possible. State each fact once, no restated context,
no hedging.

Rules:

- **Always name the review target in the heading**, so the report is identifiable without
  scrolling back: the PR number and title when reviewing a PR, otherwise the range or
  "working tree". Put the PR link on the next line.
- **Every finding is two parts only: the issue, then the suggestion.** The issue is what is
  wrong with this code change. The suggestion is the change being asked for, phrased as a
  request ("Could we...", "Would it be worth..."), never as an order. No separate why clause,
  no what/why/how, no evidence grading. If the reason is not obvious from the issue line,
  fold it into that one line.
- **Only comment on the code in the diff.** No follow-up section, no suggested tests to add
  later, no refactor ideas, no things to verify manually, no praise for what the change got
  right. If it is not an issue with this diff, it does not go in the report.
- **Repeat the PR url at the end**, on the line directly above the verdict, so it can be
  grabbed without scrolling back up. Nothing else goes between the findings and the verdict.
- Plain everyday English, in the user's voice. No em dashes.

Print Markdown in this exact shape:

```
## PR Review: #<number> <PR title>
<PR url>

**Summary:** <1-2 sentences: what the change does and overall risk.>

### Findings

- **[high]** `path/to/file.ts:42`
  <the issue with this code, one line.>
  <the change being asked for, one line, as a suggestion.>
- **[medium]** `path/to/other.ts:10`
  ...
- **[low]** `path/to/x.ts:5`
  ...

(If there are no findings, write: _No issues found._)

<PR url>
```

## Verdict (required, last line)

End your entire response with the PR url, then a single verdict line with nothing after it:

- `VERDICT: BLOCK` if there is **at least one `high`** severity finding.
- `VERDICT: PASS` otherwise.

The pre-push hook greps for `VERDICT: BLOCK` to decide whether to reject the push, so the
line must appear verbatim and exactly once.
