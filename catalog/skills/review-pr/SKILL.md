---
name: review-pr
description: >
  Review a GitHub pull request locally, classify findings by severity,
  present them to the user, and upload selected review comments back to
  the PR using gh CLI. Use this when asked to review a PR, inspect a PR
  locally before commenting, or leave structured review feedback on GitHub.
---

# Review PR

Review the PR locally first. Do not post comments until the user has seen the findings and chosen which ones to publish.

## Inputs needed

Ask for these if missing:
- **PR reference**: number or full GitHub URL
- **Review scope**: full PR or selected files/areas
- **Publishing mode**: summary only, inline comments, or both

## Severity levels

Use exactly these levels:
- **blocker**: must be fixed before merge; correctness, security, data loss, build break, or obvious regression
- **high**: serious risk likely to cause bugs or operational issues
- **medium**: meaningful issue, design gap, or missing test that should be addressed soon
- **low**: minor concern, maintainability issue, or optional improvement

Only report real findings. If there are no findings, say so explicitly.

## Local review workflow

1. **Inspect the current repo state first**
   - Run `git status --short`.
   - If the worktree is dirty, do not disturb it. Prefer a temporary review branch or worktree.

2. **Resolve PR metadata**
   - Use `gh pr view <pr> --json number,title,body,baseRefName,headRefName,headRepositoryOwner,headRepository,author,url,files,commits`.
   - Capture PR number, base branch, head branch, repo owner/name, and changed files.

3. **Get the PR locally without disturbing user work**
   - If the current worktree is clean and the user is already on the PR branch, reuse it.
   - Otherwise prefer a temporary local review branch:
   ```bash
   git fetch origin pull/<pr-number>/head:pr-review-<pr-number>
   ```
   - If isolation is safer, create a temporary worktree:
   ```bash
   git worktree add /tmp/pr-review-<pr-number> pr-review-<pr-number>
   ```
   - Never discard existing local changes.

4. **Review the diff**
   - Compute merge base against the PR base branch.
   - Start with:
   ```bash
   git diff --name-only <merge-base>...HEAD
   git diff --shortstat <merge-base>...HEAD
   git diff --stat <merge-base>...HEAD
   ```
   - Then inspect high-signal files with:
   ```bash
   git diff <merge-base>...HEAD -- <path>
   ```
   - Focus on bugs, regressions, risky API/threading changes, security issues, and missing tests.

5. **Build findings**
   For each finding record:
   - severity
   - file/path
   - line or diff hunk if known
   - concise title
   - explanation
   - suggested fix or question

6. **Present findings to the user before publishing**
   Group by severity, highest first.
   Use a compact structure:
   - `blocker` / `high` / `medium` / `low`
   - path + short title
   - 1-3 sentence rationale
   - whether it should be posted inline or in the review summary

7. **Get explicit user selection**
   Ask which findings to publish:
   - all findings
   - selected finding numbers
   - summary only
   - do not publish

8. **Publish selected comments with gh**
   - Prefer inline comments when you have a confident file + diff location.
   - Prefer a review summary for cross-cutting findings or uncertain anchors.
   - Summary review:
   ```bash
   gh pr review <pr-number> --comment --body-file <summary-file>
   ```
   - Inline review comment:
   ```bash
   gh api \
     repos/<owner>/<repo>/pulls/<pr-number>/comments \
     --method POST \
     -f body='<comment body>' \
     -f commit_id='<head sha>' \
     -f path='<path>' \
     -F line=<line>
   ```
   - Only upload findings the user selected.

9. **Report back**
   Tell the user:
   - what was reviewed
   - how many findings were found per severity
   - which findings were uploaded
   - links or confirmation for posted review comments

## Rules

- Do not post review comments before showing findings to the user.
- Do not invent severity; low-confidence issues should be framed as questions or left out.
- Prefer no finding over noisy findings.
- If exact inline anchoring is uncertain, use a review summary comment instead of guessing.
- If no actionable issues are found, report no findings and do not publish anything unless the user explicitly wants a summary comment.
