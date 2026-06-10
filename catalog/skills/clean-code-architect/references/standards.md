# Coding Standards Reference

## SOLID Principles

### S — Single Responsibility
Each class/module/function does one thing. Split when you see "and" in descriptions.

**Violation signs:**
- Class handles UI + business logic + data access
- Function both validates and transforms data
- Module mixes configuration with implementation

### O — Open/Closed
Open for extension, closed for modification. Use abstractions.

**Violation signs:**
- Adding features requires modifying existing code
- Switch statements that grow with new types
- Direct class dependencies instead of interfaces

### L — Liskov Substitution
Subtypes must be substitutable for base types.

**Violation signs:**
- Overridden methods that throw "not implemented"
- Type checks before calling methods
- Subclass breaks parent's contract

### I — Interface Segregation
Many specific interfaces over one general-purpose interface.

**Violation signs:**
- Implementing classes leave methods empty
- Interfaces with 10+ methods
- Clients depend on methods they don't use

### D — Dependency Inversion
Depend on abstractions, not concretions. Inject dependencies.

**Violation signs:**
- Direct instantiation of dependencies (`new Service()`)
- Import of concrete implementations in business logic
- Hard-coded configuration values

## DRY Principle

"Don't Repeat Yourself" — Every piece of knowledge has single, unambiguous representation.

**Extract when:**
- Same logic appears 3+ times
- Same structure with different values
- Copy-paste with minor modifications

**Extract to:**
- Utility function (pure logic)
- Helper class (stateful operations)
- Configuration (values/constants)
- Template/component (UI patterns)

## Clean Code Rules

### Functions
- Do one thing
- Max 30 lines (prefer 10-15)
- Max 4 parameters (prefer 2-3)
- No side effects unless explicit
- Descriptive names (verb + noun)

### Classes
- Max 200-300 lines
- Max 10 public methods
- Single responsibility
- Cohesive — methods use most instance variables
- Name = noun describing responsibility

### Naming
- Reveal intent: `getUserById` not `get`
- Avoid abbreviations: `customerAddress` not `custAddr`
- Consistent vocabulary: don't mix `fetch`/`get`/`retrieve`
- Searchable: no single-letter variables (except loops)

### Comments
- Code should be self-documenting
- Comments explain "why", not "what"
- Delete commented-out code
- Keep doc comments updated

### Error Handling
- Prefer exceptions over error codes
- Don't return null — use Optional/Result types
- Fail fast — validate at boundaries
- Log with context

## Atomic Design (UI)

### Atoms
Smallest UI units: buttons, inputs, labels, icons.
- No business logic
- Accept only styling/content props
- No imports from molecules/organisms

### Molecules
Groups of atoms: form fields, search bars, cards.
- Combine atoms for specific purpose
- May have minimal internal state
- No imports from organisms

### Organisms
Complex UI sections: headers, forms, lists with items.
- Combine molecules and atoms
- May connect to state/services
- Self-contained features

### Templates
Page layouts without real content.
- Define structure and positioning
- Use organisms as placeholders
- No business data

### Pages
Templates with real data.
- Connect to data sources
- Handle routing parameters
- Compose full user experience

## Domain-Driven Design

### Feature Modules
Organize by business domain, not technical layer.

```
features/
├── authentication/
│   ├── components/
│   ├── services/
│   ├── hooks/
│   └── types/
├── checkout/
│   ├── components/
│   ├── services/
│   ├── hooks/
│   └── types/
```

### Shared vs Feature Code
**Shared (core/):**
- Used by 3+ features
- Domain-agnostic utilities
- Base classes/protocols

**Feature-specific:**
- Used by 1-2 features
- Domain logic
- Feature UI components

### Boundaries
Features should:
- Not import from other features directly
- Communicate through shared services/events
- Define clear public API (index exports)
