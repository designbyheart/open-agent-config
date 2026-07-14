---
name: context-verification
description: Look up current, version-correct documentation for a library or API before writing code against it, instead of relying on possibly-stale training memory. Generalized from the Context7 skill so it applies to any live-docs source (a docs MCP, official docs, or the installed package's own types).
user-invocable: true
trigger: About to use a third-party library, framework, or API — especially one that changes often or where the exact current signature matters — and wanting version-correct usage rather than remembered patterns.
---

# Context Verification — Check the Docs Before You Code

Training memory of a fast-moving library is a liability: APIs get renamed, deprecated, and restructured. Before writing non-trivial code against an external library or API, confirm the current, version-correct usage.

## When to use

- Using a library whose API surface changes often.
- The exact signature, option name, or import path matters and getting it wrong is costly.
- You're reaching for a pattern from memory and aren't certain it's still current.

The source can be a documentation-lookup MCP (e.g. Context7-style), the official docs, or — often the most reliable — the type definitions of the *installed* version in the project.

## Method

1. **Pin the version.** Check what version the project actually depends on (lockfile / manifest). Docs for the wrong major version are worse than none.
2. **Look up the specific thing.** Resolve the real signature, options, and import path for the API you're about to use — don't reconstruct it from memory.
3. **Prefer installed-source truth.** When available, the package's own types/signatures in `node_modules` (or the language equivalent) beat any external doc, because they match the exact installed version.
4. **Verify, then write.** Only after the current usage is confirmed do you write the code. Match the version's idioms.

## Rules

- Don't invent option names, method names, or import paths — confirm them.
- Doc version must match the dependency version in the project.
- If the current API can't be confirmed, say so and flag the code as unverified rather than presenting a guess as fact.
- Prefer the installed package's own definitions as the highest-trust source.
