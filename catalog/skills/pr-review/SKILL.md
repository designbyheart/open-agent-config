---
name: pr-review
description: >
  Copilot-style pull-request review of a git diff. Use when reviewing changes
  before a push/PR, or when invoked from a pre-push hook. Produces a PR summary,
  file-by-file comments, severity-tagged findings (bug/security/style/perf), and
  a final machine-readable VERDICT line that a pre-push hook can gate on. Checks the PR
  state first (skips merged, draft and already-decided PRs), can work through a whole
  review queue into a local tracker, and can publish the findings back to the PR as inline
  comments when asked.
trigger: /pr-review, or run automatically by the pre-push hook (see README → "Pre-push PR review hook").
---

# /pr-review

Replicate GitHub Copilot's pull-request review on a local git diff. The diff to review
is provided **on stdin** and/or named by a range passed as an argument (e.g.
`/pr-review origin/main..HEAD`). If neither is present, review `git diff` of the working
tree against `HEAD`.

This skill does not change the repository. Do not edit files, stage, commit, or push. Only
inspect and report. Publishing the review to GitHub is the one exception, and only when the
user asks for it (see "Posting the review to GitHub").

## Steps

1. **Check the PR state before anything else.** Only when a PR number or URL was given.

   ```bash
   gh pr view <pr> --json state,mergedAt,closedAt,isDraft,url,headRefOid,reviewDecision,latestReviews
   ```

   - **Skip** when any of these holds, checked before reading the diff:
     - **Merged**: `mergedAt` is set.
     - **Draft**: `isDraft` is true. No review, no approval, no comments; list it as skipped
       (draft).
     - **Approved**: `reviewDecision` is `APPROVED`, or any entry in `latestReviews` has state
       `APPROVED` (by me or anyone else).
     - **Changes requested**: `reviewDecision` is `CHANGES_REQUESTED`, or any entry in
       `latestReviews` has state `CHANGES_REQUESTED`.

     Report the skip as one short line and stop: `Skipped #<n>: <reason>.`, where the reason
     is one or two words (merged, draft, approved, changes requested, already reviewed). No
     link, no who or when, no description of the earlier review, no re-review offer, no
     follow-up questions.
   - **Closed, not merged**: say so, then ask whether to continue and whether anything should
     still be posted.
   - **Open, none of the above**: state it in one clause and carry on.
   - **Re-review on request**: review a PR skipped by these rules only when I explicitly ask to
     re-review it (for example "re-review #123" or "re-review the skipped PRs"). Then run the
     full review and name the state it was skipped for in the summary.

   There is no `merged` field on `gh pr view`; use `mergedAt`. Treat a PR description that
   the head commit contradicts as stale and say so: a listed blocker the head already fixed,
   or a CI run that was cancelled rather than failed.

   Also note, in one clause each when they apply: an existing approval that predates the
   current head (nobody has reviewed the newest commits), a merge-order dependency named in
   the description, and a conflict with the base branch (`git merge-tree` of the head
   against the base).

2. **Obtain the diff.**
   - If a PR number or URL was given, use `gh pr view` / `gh pr diff` for that PR.
   - Else if a diff was piped on stdin, review that.
   - Else if an argument range was given, run `git diff <range>` (and `git log --oneline <range>` for commit context).
   - Else run `git diff HEAD`.
   - If the diff is empty, output exactly `VERDICT: PASS` and stop.

3. **Understand the change** before judging it. Read enough surrounding context (open the
   touched files if needed) to avoid false positives. A finding you can't stand behind is noise.

4. **Check the change fits the codebase.** See how the project already solves the same
   problem: grep for similar calls and read sibling files for existing helpers, patterns,
   libraries and conventions. Flag a change that adds a second way of doing something the
   codebase already does, or brings in an approach with no precedent when an established
   one would work. `medium` when it duplicates or conflicts with an established approach,
   `low` when it only drifts in style.

5. **Check every added package.** For each dependency added to a manifest (`package.json`,
   `Podfile`, `build.gradle`, `Gemfile`, `go.mod`, `requirements.txt`, ...), confirm it is
   needed: the diff actually uses it, the codebase has no package or helper that already
   does the job, a few lines of code would not do instead, and it is maintained with a
   compatible license. Flag an unnecessary or duplicate package as `medium`.

6. **Walk the user flow as a QA tester.** Trace what a user does through the changed code:
   the happy path first, then the edge cases (empty data, slow or failed network, signed
   out, first launch, retry, back navigation, other platforms and locales). Check that
   flows touched indirectly through shared code, callers or state still work. Anchor each
   break to the diff line that causes it, with severity set by the impact on the user.

7. **Compare against the ticket** when the PR names one. Report it in three short bullet
   groups only, writing "none" for an empty group:
   - **Missing from ticket:** requirements the code does not address.
   - **Extra work:** changes outside the ticket's scope.
   - **Off-pattern:** approaches that don't follow the established architecture, rules or
     conventions.

8. **Review like Copilot would.** For each meaningful issue produce a comment anchored to a
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
- Plain everyday English, in the user's voice. No em dashes, and no en dashes or spaced
  hyphens in their place: rewrite the sentence.
- **No people's names or @mentions** in anything posted to the PR. Refer to roles instead
  ("the ticket owner", "the API owner").

Print Markdown in this exact shape:

```
## PR Review: #<number> <PR title>
<PR url>

**Summary:** <1-2 sentences: what the change does and overall risk.>

**Ticket:** Missing: <...|none>. Extra: <...|none>. Off-pattern: <...|none>.
(Omit the Ticket line when the PR names no ticket.)

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

## Posting the review to GitHub

Only when the user asks for it. The report above is the default; publishing is a separate,
explicit request.

- **One review, one-line body.** The body is a single line, e.g. "Looks good, with a few
  suggestions for improvements." Nothing else: no summary, no counts, no restating the
  findings. The inline comments already say it at the right place.
- **Findings go inline**, anchored to their code line, in the same issue-then-suggestion
  shape as the report.
- **Post `medium` and above by default.** Drop `low` findings unless the user asks for them
  (for example "post all medium and lows"); then post every finding in the report.
- **`event: APPROVE` when the verdict is PASS.** If a `high` finding survived, do not
  approve: submit with `event: COMMENT` and say why in the one-line body.
- If the number of findings the user names does not match what the review produced, ask
  which set before posting.

- **Re-check the PR right before posting.** Approval can come long after the review, and the
  PR can move in between. Run the checks silently: do not tell me they were run or what they
  found when everything is fine. Report only when posting does not happen, in one short line
  (e.g. "Not posted: already merged." or "Not posted: head moved to <sha>.").
  Note the `headRefOid` you reviewed in step 1, then immediately
  before the post call run:

  ```bash
  gh pr view <pr> --json state,mergedAt,headRefOid,reviewDecision
  ```

  - **Merged or closed**: do not post. Say "Not posted: already merged." (or closed) and stop.
  - **`headRefOid` differs from the reviewed commit**: do not post. Say "Not posted: head moved
    to <sha>.", review the new commits, and post only after the user confirms on the new head.
  - **Already `APPROVED` or `CHANGES_REQUESTED` by someone else**: say so and ask first.
  - Otherwise post, with `commit_id` set to the reviewed sha. Never use `gh pr review
    --approve`: it approves whatever the head is at that moment.

```bash
gh api repos/<org>/<repo>/pulls/<pr>/reviews --input review.json   # commit_id = reviewed sha
```

`review.json` holds `commit_id`, `event`, the one-line `body`, and a `comments` array of
`{path, line, side: "RIGHT", body}`. Every `line` must fall inside a diff hunk or the whole
call is rejected, so confirm each one against the diff first. If the call still fails with
`422 Line could not be resolved`, move that comment to the nearest added line of the same
code in the hunk (count new-file lines from the `@@ -a,b +c,d @@` header, skipping `-` lines),
update the saved report to the new line, and post again. A review can be submitted on a
closed PR, but confirm with the user before doing it.

A submitted review cannot be deleted, only dismissed (needs maintainer rights), so never
post on a PR the rules above say to skip.

If `gh` fails with `connection reset by peer` against a local proxy address, run it with
`HTTPS_PROXY`/`HTTP_PROXY` (and lowercase variants) unset.

## Review queue (several PRs)

When asked to review every PR waiting on me (for example a
`user-review-requested:@me` search):

1. **List** with `gh pr list --search "is:pr is:open user-review-requested:@me" --json
   number,title,author,isDraft,headRefOid,additions,deletions,changedFiles,reviewDecision`.
2. **Filter**: keep open, non-draft PRs that I have not reviewed. `latestReviews` misses
   comment-only reviews, so check `gh api repos/<org>/<repo>/pulls/<n>/reviews` and
   `.../comments` for my login. Here, approvals or change requests by other people do not
   skip a PR. List the skipped ones as `Skipped #<n>: <reason>.`, one line each, nothing more.
3. **Review one by one**, one read-only subagent per PR in parallel (start more as slots
   free). Each one runs the full steps above, posts nothing, and writes its result to
   `<docs>/pr-reviews-<YYYY-MM-DD>/<number>.md`: header (author, size, CI, reviewed sha),
   one-line summary, existing reviews, suggested action (APPROVE / COMMENT / SKIP), the
   one-line body, and a findings table `Sev | File:line | Issue | Suggestion`.
   `<docs>` is the user's docs folder from their global instructions, never the repo.
4. **Tracker**: `<docs>/pr-reviews-<YYYY-MM-DD>.md`, grouped in batches of 10, one table row
   per PR with a `[ ]` checkbox, PR link, title, suggested action and key point.
5. **Post only when asked**, per "Posting the review to GitHub", then tick the posted rows.

## After posting

On success, reply with one line: `Posted on #<n>: <APPROVE|COMMENT>, <k> comments.` Nothing
about the pre-post checks, the payload or the API call. On failure, one line saying it was not
posted and why.
