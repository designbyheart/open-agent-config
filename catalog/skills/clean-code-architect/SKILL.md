---
name: clean-code-architect
description: Analyze, plan, and refactor codebases following clean architecture, SOLID, DRY, atomic design, and domain-driven principles. Use when asked to review code quality, refactor code, reorganize project structure, enforce coding standards, or improve code architecture. Triggers on requests like "review my code", "refactor this", "organize my project", "improve code quality", "apply clean architecture".
trigger: Reviewing code quality, refactoring, reorganizing project structure, or enforcing clean-architecture / SOLID / DRY / atomic-design / DDD standards.
---

# Clean Code Architect

## Workflow Overview

1. **Discover** — Scan project structure, detect languages, find lint configs
2. **Analyze** — Review code against standards, identify violations
3. **Plan** — Generate refactor plan, save to `REFACTOR_PLAN.md`
4. **Execute** — On user confirmation, apply changes incrementally
5. **Verify** — Run linters, confirm improvements

## Step 1: Discover

Scan project root:
```bash
find . -type f \( -name "*.json" -o -name "*.yaml" -o -name "*.yml" -o -name ".*rc" -o -name "*.config.*" \) | grep -E "(eslint|prettier|swiftlint|tslint|stylelint|rubocop|pylint|flake8)" | head -20
```

Identify:
- Languages/frameworks in use
- Existing lint configurations
- Current folder structure
- Entry points and dependencies

## Step 2: Analyze

Review code against standards. See `references/standards.md` for complete rules.

**Quick reference — Flag these violations:**

| Category | Threshold |
|----------|-----------|
| File length | >200 lines |
| Function/method length | >30 lines |
| Cyclomatic complexity | >10 |
| Nesting depth | >3 levels |
| Parameters | >4 per function |

**Dependency direction (must not violate):**
```
atoms → (nothing)
molecules → atoms
organisms → molecules, atoms
templates → organisms, molecules, atoms
pages → templates, organisms, molecules, atoms

utilities → (nothing, pure functions)
validators → utilities
services → validators, utilities, domain models
domain → services, validators, utilities
features → domain, services, validators, utilities
```

**Code smells to flag:**
- God classes (>300 lines or >10 public methods)
- Magic numbers/strings
- Deep nesting (>3 levels)
- Duplicate code blocks (>10 similar lines)
- Circular dependencies
- Mixed concerns in single file
- Missing error handling
- Hardcoded configurations

## Step 3: Plan

Generate `REFACTOR_PLAN.md` in project root:

```markdown
# Refactor Plan
Generated: {timestamp}

## Summary
- Files analyzed: {count}
- Violations found: {count}
- Estimated changes: {count}

## Priority Order
1. Critical (breaking architecture rules)
2. High (code smells, violations)
3. Medium (organization, naming)
4. Low (style, formatting)

## Changes

### {priority}. {description}
- **File:** `{relative/path/to/file.ext}`
- **Line(s):** {start}-{end}
- **Issue:** {description}
- **Action:** {what to do}
- **Status:** [ ] Pending

---
```

Present plan summary to user. Wait for confirmation before proceeding.

## Step 4: Execute

On confirmation:
1. Create backup branch or note original state
2. Apply changes in priority order
3. Update `REFACTOR_PLAN.md` status after each change
4. Commit logical units together

**Refactoring patterns:**

| Issue | Action |
|-------|--------|
| Long file | Extract into multiple files by responsibility |
| Long function | Extract helper functions |
| God class | Split by single responsibility |
| Deep nesting | Early returns, extract methods |
| Duplicate code | Extract to utility/helper |
| Mixed concerns | Separate into appropriate layers |
| Wrong dependency | Move to correct layer or inject |

## Step 5: Verify

After changes:
1. Run project linters if available
2. Check dependency directions
3. Verify file/function sizes
4. Update `REFACTOR_PLAN.md` with completion status

## Folder Structure Reference

See `references/folder-structures.md` for language-specific templates.

**General pattern:**
```
src/
├── core/                 # Shared kernel
│   ├── utilities/        # Pure helper functions
│   ├── validators/       # Validation logic
│   └── constants/        # App-wide constants
├── services/             # Business logic services
├── domain/               # Domain models, entities
├── features/             # Feature modules (DDD)
│   └── {feature}/
│       ├── components/   # Feature-specific UI
│       ├── hooks/        # Feature-specific hooks
│       ├── services/     # Feature-specific services
│       └── types/        # Feature-specific types
└── ui/                   # Atomic design components
    ├── atoms/
    ├── molecules/
    ├── organisms/
    └── templates/
```

## Naming Conventions

Default: `camelCase` for code, `kebab-case` for CSS/filenames.

Always defer to:
1. Project's existing lint rules
2. Language conventions (see `references/language-rules.md`)
3. Framework conventions
