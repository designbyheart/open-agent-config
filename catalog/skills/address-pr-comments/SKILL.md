---
name: address-pr-comments
description: Use when handling pull-request feedback with GitHub CLI. Fetch all PR discussion comments and inline review comments for the PR connected to the current branch or an explicit PR reference, classify each comment as actionable vs question-only, propose two handling options for each actionable comment, and collect one decision per comment through an interactive options prompt (A/B plus a custom free-text choice). If the current branch is the base branch (`main`/`master`) and no explicit PR is provided, stop without taking action.
---

# Address PR Comments

## Overview

Resolve PR feedback in a controlled, auditable loop: gather comments, classify each item, get explicit user decisions per actionable comment, then implement changes only after all decisions are locked.

## Workflow

1. Check interactive decision capability first.
   - This skill needs an interactive options prompt (e.g. the agent's question box / plan-mode prompt / an A-B-Other selector). If none is available in the current mode, stop and ask the user to switch to a mode that supports interactive choices, then rerun.
2. Collect feedback for the current branch PR:
```bash
python3 scripts/collect_pr_feedback.py --out-dir tmp/pr-feedback
```
   - If you are on the base branch or need a different target, pass an explicit PR (and repo if needed):
```bash
python3 scripts/collect_pr_feedback.py --out-dir tmp/pr-feedback --pr <number> --repo <owner/repo>
```
3. Read `tmp/pr-feedback/summary.json` first.
   - If `status` is `skipped_main_or_master`, stop immediately and report no action.
   - If you need to review from the base branch, rerun step 2 with `--pr`.
4. Read `tmp/pr-feedback/comments.json` and process every comment.
   - Do not silently skip comments.
5. Classify each comment:
   - `question_only`: asks for explanation/clarification and does not request a concrete change.
   - `valid_actionable`: identifies a real issue or explicitly requests a change.
   - `not_valid`: incorrect or already addressed (state concrete evidence).
6. For each `valid_actionable` comment, prepare exactly two implementation approaches:
   - Option A: smallest safe fix.
   - Option B: alternative design or broader cleanup.
   - Keep each option concrete (files, behavior, tradeoff).
7. Ask decisions per actionable comment, one prompt at a time, using the interactive options prompt.
   - Required options:
     - `Option A (Recommended)`: the minimal safe fix.
     - `Option B`: the alternative approach.
     - Custom instructions via the free-text / `Other` field.
   - Do not batch all comments into one plain-text answer request.
8. Apply changes only after all actionable comments have a decision.
   - Follow the selected option exactly.
   - For a custom answer, follow the user's text as authoritative for that comment.
9. Run the relevant tests/lint for touched components (per the repo's `AGENTS.md`).
10. Report mapping from `comment_key -> chosen option -> actual change`.

## Required Inputs And Tools

- `gh` CLI authenticated for the target repo.
- Optional: a `gh` review extension for richer raw output. If unavailable,
  `scripts/collect_pr_feedback.py` still collects normalized comments via `gh api`.

## Output Files

`scripts/collect_pr_feedback.py` writes:

- `tmp/pr-feedback/summary.json`: branch/PR metadata, counts, and any optional helper-command error.
- `tmp/pr-feedback/comments.json`: normalized merged comments list used for triage.
- `tmp/pr-feedback/raw/`: raw API payloads for audit/debug.

Comment schema and decision rubric live in `references/comment_schema.md`.
