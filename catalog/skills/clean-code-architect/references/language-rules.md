# Language-Specific Rules

## TypeScript / JavaScript

### Naming
- `camelCase`: variables, functions, methods
- `PascalCase`: classes, interfaces, types, components, enums
- `SCREAMING_SNAKE_CASE`: constants
- `kebab-case`: file names, CSS classes

### Files
- `.tsx` for React components
- `.ts` for non-JSX TypeScript
- One component per file
- Index files for public exports

### Specific Rules
- Prefer `const` over `let`, avoid `var`
- Use `interface` for object shapes, `type` for unions/intersections
- Explicit return types on public functions
- No `any` — use `unknown` if type is truly unknown

## Swift

### Naming
- `camelCase`: variables, functions, parameters
- `PascalCase`: types, protocols, enums, cases
- `kCamelCase` or `SCREAMING_SNAKE`: static constants

### Files
- One type per file (generally)
- File name matches primary type name
- Extensions in separate files: `String+Extensions.swift`

### Specific Rules
- Prefer `struct` over `class` when no inheritance needed
- Use `guard` for early exits
- Avoid force unwrapping (`!`) — use `if let` or `guard let`
- Protocol-oriented over class inheritance

## Python

### Naming (PEP 8)
- `snake_case`: variables, functions, methods, modules
- `PascalCase`: classes
- `SCREAMING_SNAKE_CASE`: constants
- `_single_leading_underscore`: internal/private

### Files
- `snake_case.py` for modules
- `__init__.py` for packages
- One class per file (generally)

### Specific Rules
- Type hints for function signatures
- Docstrings for public functions/classes
- Max line length: 88 (black) or 79 (PEP 8)
- Imports: stdlib, third-party, local (separated by blank lines)

## CSS / SCSS

### Naming
- `kebab-case`: class names
- BEM convention: `block__element--modifier`
- CSS variables: `--color-primary`

### Files
- `kebab-case.css` / `kebab-case.scss`
- Partials prefixed: `_variables.scss`

### Specific Rules
- Avoid deep nesting (max 3 levels)
- Mobile-first media queries
- Group related properties
- Use CSS variables for theming

## Go

### Naming
- `camelCase`: unexported (private)
- `PascalCase`: exported (public)
- Short names for local scope: `i`, `r` for reader
- Acronyms stay caps: `HTTPServer`, `userID`

### Files
- `snake_case.go`
- `*_test.go` for tests
- One package per directory

### Specific Rules
- Accept interfaces, return structs
- Errors are values — check them
- Short variable declarations (`:=`) in functions
- Explicit error handling over panics

## Kotlin

### Naming
- `camelCase`: variables, functions
- `PascalCase`: classes, interfaces, objects
- `SCREAMING_SNAKE_CASE`: constants

### Files
- `PascalCase.kt` matching main class
- One class per file (generally)

### Specific Rules
- Prefer `val` over `var`
- Use data classes for DTOs
- Null safety: avoid `!!`, use `?.` and `?:`
- Extension functions for utilities

## Ruby

### Naming
- `snake_case`: variables, methods
- `PascalCase`: classes, modules
- `SCREAMING_SNAKE_CASE`: constants
- `predicate_methods?`: return boolean

### Files
- `snake_case.rb`
- One class per file
- File name matches class name (underscored)

### Specific Rules
- Two-space indentation
- Implicit returns (last expression)
- Guard clauses for early returns
- Prefer symbols over strings for keys

## Common Lint Configurations

### ESLint (TypeScript/JavaScript)
Look for: `.eslintrc`, `.eslintrc.js`, `.eslintrc.json`, `eslint.config.js`

### Prettier
Look for: `.prettierrc`, `prettier.config.js`

### SwiftLint (Swift)
Look for: `.swiftlint.yml`

### Pylint / Flake8 / Black (Python)
Look for: `pyproject.toml`, `setup.cfg`, `.flake8`, `.pylintrc`

### RuboCop (Ruby)
Look for: `.rubocop.yml`

### golangci-lint (Go)
Look for: `.golangci.yml`

Always defer to project-specific lint configuration when present.
