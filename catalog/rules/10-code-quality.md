---
title: Code Quality Gates
---

# Code Quality Gates

**Every change must keep the project green. No exceptions for "small" edits.**

Before marking any task complete, the build, tests, and linter must pass:

- [ ] Code compiles / builds without errors.
- [ ] Tests pass.
- [ ] Linter passes.
- [ ] Type checks pass (if the project is typed).
- [ ] No accidental changes to unrelated files.
- [ ] Dead code introduced by your changes is removed.

If a project defines these commands, run them before finishing. Replace the
placeholders below with the project's real commands during setup:

```
build:      <build command>
test:       <test command>
lint:       <lint command>
typecheck:  <typecheck command>
```

## When to Ask vs. Act

**Ask first:** architectural decisions with tradeoffs, unclear requirements,
conflicting existing patterns, security-sensitive changes, breaking API changes.

**Act with confidence:** bug fixes with a clear repro, adding tests to existing
code, styling changes that follow the design system, refactors with passing
tests, documentation updates.
