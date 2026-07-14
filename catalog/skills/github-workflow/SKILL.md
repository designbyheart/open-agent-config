---
name: github-workflow
description: Disciplined git and pull-request practice — branch correctly, make focused commits, open well-described PRs, and keep repository operations safe. Generalized from the GitHub MCP so it applies whatever tool drives git (CLI, MCP connector, or IDE).
user-invocable: true
trigger: Committing, branching, or opening a pull request — wanting clean, reviewable history and safe repo operations rather than ad-hoc commits to the default branch.
---

# GitHub Workflow

Move changes into a repository the way a disciplined team does: on a branch, in focused commits, behind a clear pull request. This describes the *practice*; the underlying driver can be the `git` CLI, a GitHub MCP connector, or an IDE integration.

## Branching

- Never commit directly to the default branch (`main`/`master`). Create a topic branch first.
- Name it for the work: `feature/…`, `fix/…`, `chore/…`.
- Branch from an up-to-date base.

## Commits

- One logical change per commit. Don't mix a refactor with a feature.
- Write imperative subjects ("Add retry to upload", not "added retries"). Explain *why* in the body when it isn't obvious.
- Never commit secrets, credentials, or large generated artifacts. Check the diff before staging.

## Pull requests

- Open the PR against the correct base branch with a description that covers: what changed, why, how it was tested, and anything a reviewer should scrutinize.
- Keep PRs small enough to review in one sitting. Split when they grow.
- Link related issues; call out breaking changes explicitly.

## Safety

- Confirm the current branch and remote before any push.
- Prefer non-destructive operations. Treat force-push, history rewrites, and branch deletion as require-confirmation actions, especially on shared branches.
- Read the status and diff before committing — know exactly what is going out.

## Rules

- Default branch is protected in practice even when it isn't in config.
- A change reaches the remote through a branch and a PR, not a direct push.
- When an operation is irreversible, state what will happen and confirm before doing it.
