---
name: commit-pr
description: >
  Quick shortcut: create a branch, commit the current changes, push, and open a
  Pull Request. Triggered by saying "commit-pr" or asking to ship/submit changes.
---

# Commit & Create PR

Quick-ship workflow for any repo in this workspace. Run each step without asking unless
something is ambiguous. Follow the repo's `AGENTS.md` / `CLAUDE.md` conventions.

## Workflow

1. **Inspect** — `git status` and `git diff --stat` to understand the changeset.
2. **Determine the base branch** — don't assume `main`:
   ```bash
   BASE_BRANCH="$(
     if ref=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null); then echo "${ref#origin/}";
     elif git show-ref --verify --quiet refs/remotes/origin/main; then echo main;
     elif git show-ref --verify --quiet refs/remotes/origin/master; then echo master;
     else git rev-parse --abbrev-ref HEAD; fi)"
   ```
3. **Branch** — If currently on the base branch, create a feature branch
   `feature/<short-desc>` (derive `<short-desc>` from the changes). If the team uses a
   different convention (e.g. `<type>/<scope>` or `p/<user>/<desc>`), match the existing
   branches. If already on a feature branch, stay on it.
4. **Verify before committing** — run the repo's quality gates if defined (build, test,
   lint, type-check per `AGENTS.md`). Don't ship a red build.
5. **Stage** — `git add` the changed files (prefer explicit paths over `git add .`).
6. **Commit** — Conventional Commit format: `type(scope): summary` in imperative mood,
   ≤72-char title (types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`).
   Add a body paragraph for non-trivial changes.
7. **Push** — **Pause and ask for approval** before `git push -u origin <branch>`.
8. **PR** — `gh pr create --base "$BASE_BRANCH" --title "<title>" --body "<body>"`. Body:
   - **What** — 1-2 sentence summary.
   - **Why** — Motivation or linked issue.
   - **Changes** — Bullet list of key files/areas.
   - **Testing** — What was verified (build/test/lint) or what's pending.
   If `gh` is unavailable, derive the compare URL from the remote:
   `git remote get-url origin` → print `<repo-web-url>/compare/<BASE_BRANCH>...<branch>?expand=1`.
9. **Report** — Print branch name, commit SHA, and PR URL.

## Rules
- Never force-push.
- Never commit secrets — scan `git diff` first.
- Always get user approval before pushing.
