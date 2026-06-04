---
name: spec-driven-development
description: >
  Generate a Product Requirements Document (PRD) for a new software module or
  project, then drive implementation from the spec. Use this when asked to design
  a new module, create a PRD, write a technical spec, or do spec-driven
  development. Also use when the user wants to plan a new library, service, or
  component before coding.
---

# Spec-Driven Development

## Overview

This skill drives a structured workflow: **spec first, then code**. You generate a PRD, get it approved, then implement against it — committing the PRD, action plan, and work log to version control throughout.

## Agent Operating Contract

1. **State assumptions explicitly** — never silently assume requirements.
2. **Ask clarifying questions when uncertain** — prefer asking over guessing.
3. **Produce acceptance criteria** — every requirement must be verifiable.
4. **Run verification or stop** — build and test before declaring done.
5. **Summarize changes and risks** — after each major step.

## Phase 1: Gather Inputs

Ask the user for:
- **High-level description**: problem statement, context, goals
- **Tech stack constraints**: languages, build system, package manager, allowed libraries
- **Non-functional requirements**: performance, security, portability, etc.
- **Open questions**: anything they want clarified upfront

If any of these are missing or vague, ask clarifying questions before proceeding.

## Phase 2: Generate PRD

Create a PRD using this structure. Adapt sections as needed — skip irrelevant ones, expand critical ones.

### PRD Structure

```
# PRD: <Module Name>

## 0. Objective
Clear problem statement, goals, and what success looks like.
Include measurable acceptance criteria.

## 1. Scope
- **In scope**: what this module covers
- **Out of scope**: explicit boundaries

## 2. Environment & Build
Language, build system, package manager, dependencies, test frameworks.
For a monorepo, name the affected package(s)/workspace(s).

## 3. Architecture
High-level modules and their relationships.
Include diagrams in Mermaid format where helpful.
IMPORTANT: Avoid using '(' and ')' in Mermaid text fields — they cause
parse errors. Use square brackets or quotes instead.

## 4. Public API
Example API surface: function signatures, type/struct definitions,
file locations. Concrete enough for a coding agent to scaffold.

## 5. Interfaces
Internal interfaces and abstractions between components.

## 6. Data / State
Persisted schema, formats, registries, or configuration files.

## 7. Concurrency & Thread Safety
How multiple threads/processes/requests interact. Locking strategy,
ownership, async patterns.

## 8. Core Flows
Key workflows described step-by-step:
activation, validation, data processing, error recovery, etc.

## 9. Security & Privacy
Encryption, data handling, privacy/GDPR concerns, credential management.

## 10. Logging & Errors
Logging strategy, error codes/types, error propagation model.

## 11. Example Usage
Sample code snippet showing library/module usage from a consumer's
perspective.

## 12. Testing
- Unit tests: per-function/class coverage
- Integration tests: cross-module workflows
- Concurrency tests: race conditions, deadlocks
- Edge/fuzz tests: input validation robustness

## 13. Tooling
CLI utilities, developer tools, or harnesses that wrap the module's
functionality for easier testing and debugging.

## 14. Deliverables
Concrete list: code, docs, tests, build/config files.

## 15. Open Questions
Clarifications required from stakeholders. Do NOT proceed on these
until answered.
```

### PRD quality checklist
- Is it concrete enough that a coding agent could generate starter code, build config, and scaffolding?
- Does every requirement have an acceptance criterion?
- Are diagrams in Mermaid format (no parentheses in text fields)?
- Are open questions clearly separated from decided requirements?

## Phase 3: Review & Approve

1. Present the PRD to the user.
2. Ask for explicit approval before proceeding to implementation.
3. Address all feedback and open questions first.
4. Commit the PRD to version control: `docs/specs/<module-name>/PRD.md` (or user-specified location).

## Phase 4: Action Plan

After PRD approval, create an action plan:

```
# Action Plan: <Module Name>

## Phases
1. Scaffold: files, modules, build config
2. Core implementation: internal logic
3. Public API: external interface
4. Tests: unit, integration, edge cases
5. Tooling: CLI, developer harnesses
6. Documentation: README/CONTEXT, API docs
7. Final verification: full build + test + lint

## Task breakdown
[ ] Task 1 — description
[ ] Task 2 — description
...
```

Commit the action plan alongside the PRD: `docs/specs/<module-name>/ACTION_PLAN.md`.

## Phase 5: Implement

Work through the action plan:
1. Mark tasks in-progress/completed as you go.
2. Maintain a **work log** committed to version control: `docs/specs/<module-name>/WORK_LOG.md`.
3. After each major step:
   - Summarize what changed and what files were touched.
   - Note any risks, deviations from the PRD, or new open questions.
   - Build and test before moving on.
4. If requirements change during implementation, update the PRD first.

### Work log format
```
# Work Log: <Module Name>

## <Date> — <Phase/Task>
### Changes
- file1: added X
- config: registered new target

### Verification
- `<build command>` — PASS
- `<test command>` — PASS

### Risks / Notes
- <any deviations or concerns>
```

## Version Control Discipline

**Always commit these files during work:**
- `PRD.md` — the spec (commit on creation and updates)
- `ACTION_PLAN.md` — the plan (commit on creation and updates)
- `WORK_LOG.md` — running log (commit after each major step)

This ensures any agent (or human) resuming work can understand current status.

## Project Notes

- Follow the repo's `AGENTS.md` / `CLAUDE.md` conventions and code style.
- Run the project's quality gates (build, test, lint, type-check) before declaring a phase done.
- In a monorepo, scope the spec and verification to the affected package(s)/workspace(s).
- Match the existing formatter and linter rather than introducing new ones.
