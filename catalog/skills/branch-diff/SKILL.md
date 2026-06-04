---
name: branch-diff
description: Inspect current-branch changes from merge-base to HEAD using explicit git commands, then review file-by-file.
---

# branch-diff

Use this skill when the user asks to inspect changes on the current branch.

## Primary objective

1. Identify the branch and diff base.
2. Collect available context and scope likely-relevant files first.
3. Measure diff size (files and line count) before parsing full patch text.
4. Review patch summary/full patch only when scope is safe or user-approved.
5. Drill into high-signal files and call out risks.

## Execution workflow

### 1) Establish branch and base commit

Run:

```bash
CURRENT_BRANCH="$(git branch --show-current)"
BASE_BRANCH="$(
  if ref=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null); then
    echo "${ref#origin/}"
  elif git show-ref --verify --quiet refs/remotes/origin/main; then
    echo main
  elif git show-ref --verify --quiet refs/remotes/origin/master; then
    echo master
  else
    git rev-parse --abbrev-ref HEAD
  fi
)"
BASE_COMMIT="$(git merge-base "$BASE_BRANCH" HEAD)"
```

### 2) Capture inspection context and initial scope

Run:

```bash
git diff --name-only "$BASE_COMMIT" HEAD
```

If empty, report no branch-local changes and stop.

Then extract context from the user request and current task (bug area, module, component, ticket, test failure, or known touched paths).

If meaningful context exists, narrow the initial file set before deep parsing:

```bash
git diff --name-only "$BASE_COMMIT" HEAD | rg "<context-pattern>"
```

If context is weak or missing, ask a concise clarifying question before broad inspection.

### 3) Measure patch size before parsing full diff

Run:

```bash
git diff --shortstat "$BASE_COMMIT" HEAD
git diff --numstat "$BASE_COMMIT" HEAD
```

Compute total changed lines from `--numstat` (`added + deleted`), and file count from:

```bash
git diff --name-only "$BASE_COMMIT" HEAD | wc -l
```

Large-diff gate (default):

- `>= 800` total changed lines, or
- `>= 25` changed files

If either threshold is hit, do not parse the full `git diff` output yet. First ask the user whether to:

- continue with full parsing, or
- keep filtering to high-signal files using available context.

### 4) Review patch summary and full patch

Run:

```bash
git diff --stat "$BASE_COMMIT" HEAD
git diff "$BASE_COMMIT" HEAD
```

For large diffs, prefer scoped review first:

```bash
git diff "$BASE_COMMIT" HEAD -- <path>
```

Expand scope only when enough context is available or the user confirms broader parsing.

### 5) File-by-file deep inspection

For each changed file (or user-selected subset), run:

```bash
git diff "$BASE_COMMIT" HEAD -- <path>
```

Focus review on:

- behavioral regressions
- risky API/threading/ownership changes
- missing or impacted tests

## Optional aliases for convenience

These are optional sugar on top of the explicit workflow above:

```bash
git config --global alias.default-branch '!f() { if ref=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null); then echo "${ref#origin/}"; elif git show-ref --verify --quiet refs/remotes/origin/main; then echo main; elif git show-ref --verify --quiet refs/remotes/origin/master; then echo master; else git rev-parse --abbrev-ref HEAD; fi; }; f'
git config --global alias.diffm '!git diff $(git merge-base $(git default-branch) HEAD)'
git config --global alias.diffml '!git diff $(git merge-base $(git default-branch) HEAD) --name-only'
```

## Reporting template

- Branch: `<branch>`
- Base branch: `<base-branch>`
- Base commit: `<merge-base SHA>`
- Context used for filtering: `<bug/module/test/path hints>`
- Changed files: `<count + scoped list>`
- Patch size: `<insertions/deletions/files>`
- Large-diff gate hit: `<yes/no + threshold reason>`
- High-risk files: `<paths>`
- Findings: `<bugs/regressions/test gaps>`
