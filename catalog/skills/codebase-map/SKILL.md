---
name: codebase-map
description: Ground code changes in real symbol information instead of guessing — resolve types, definitions, references, and call sites before editing, so changes match what actually exists. Generalized from the TypeScript LSP skill to be language-neutral (any language server or symbol index).
user-invocable: true
trigger: Editing an unfamiliar codebase or a symbol used in many places — wanting to verify types, definitions, and references before changing them rather than guessing and hallucinating APIs.
---

# Codebase Map — Know the Symbols Before You Edit

The most common source of broken AI edits is guessing: inventing a method that doesn't exist, changing a signature without updating callers, assuming a type. This skill makes the agent consult real symbol information first. It's framed for TypeScript's language server but applies to any language with an LSP or symbol index (Python, Go, Rust, Java, …).

## The principle

Before changing or calling a symbol, establish what it actually is:

- **Definition** — where is it defined, and what is its real signature/type?
- **References** — everywhere it's used. Changing it means updating all of them.
- **Types** — the actual types flowing in and out, not the assumed ones.
- **Imports/exports** — what's actually exported from a module before importing it.

## Method

1. **Resolve before you write.** For any symbol you're about to use or change, look up its definition and type. If a symbol you "remember" can't be found, it probably doesn't exist — stop and check.
2. **Find all references before changing a signature.** A parameter added, a return type changed, a function renamed — enumerate every call site and update them in the same change.
3. **Follow the types across boundaries.** When editing across modules, confirm the exported shape matches what the consumer expects.
4. **Prefer the tool's answer over memory.** Use the language server / symbol search as the source of truth; treat recollection as a hypothesis to verify.

## Rules

- Never call an API you haven't confirmed exists in this codebase or its declared dependencies.
- A signature change is incomplete until every reference compiles against it.
- When the type says one thing and the assumption says another, the type wins.
- If no language server is available, fall back to a project-wide symbol search before editing — the discipline holds even when the tooling is weaker.
