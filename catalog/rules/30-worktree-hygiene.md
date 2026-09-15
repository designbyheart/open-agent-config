---
title: Worktree Hygiene
---

# Worktree Hygiene

Git worktrees are invisible. Nothing in a normal workflow shows what exists, so they
accumulate until someone opens every folder by hand. These rules keep them findable.

## 1. One `wt/` folder, outside the repository

Worktrees live in a single `wt/` folder at the root of the project domain, never inside a
git repository and never in a tool's private directory such as `.claude/worktrees/`.

- A domain holding several repositories gets one shared folder beside them: `<domain>/wt/`.
- A standalone repository, where `wt/` cannot sit inside, gets a sibling: `<repo>-wt/`.

Do not scatter worktrees as siblings of the repository inside a shared workspace. A folder
named after its branch is still invisible to anyone reading the workspace.

## 2. Name by ticket or feature

Use the ticket id when one exists, otherwise a feature slug. In a domain with several
repositories, prefix the repository. The name must say what the worktree is for without
anyone entering it.

## 3. Report at both ends of a session

At the start of a session, and again when wrapping up, list the active worktrees without
being asked: path, branch, uncommitted file count, and whether the branch holds commits the
repository's current branch does not. A project with no worktrees gets one line saying so.
Silence cannot be distinguished from not having looked.

## 4. Verify a branch is not already merged before merging it

A finished branch keeps all its files while falling behind, so the merge presents as a large
deletion and the conflicts are requests to re-decide settled questions. File presence and
`git cherry` both mislead. Ancestry is definitive:

```bash
git merge-base --is-ancestor <merge-commit> <current-branch>   # merged if it exits 0
gh pr view <n> --json state,mergedAt,mergeCommit               # finds the merge commit
```

Treat a conflict count in the tens as evidence the branch is stale rather than pending. Real
in-flight work conflicts in a handful of places.

## 5. Uncommitted files are the only unrecoverable thing

Deleting a branch leaves its commits in the reflog; deleting a worktree with uncommitted
changes destroys them. Check every worktree for uncommitted and untracked files before
removal, and rescue anything that exists nowhere else. Record each branch SHA in the session
output before deleting, so recovery needs no archaeology.
