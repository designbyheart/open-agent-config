---
name: codebase-index
description: Build and maintain a repo-local knowledge index — architecture map, domain glossary, business rules, decisions, and gotchas — that agents read before editing, so answers come from recorded facts instead of inference.
user-invocable: true
trigger: Starting work in a repo whose rules live in people's heads, onboarding an agent or a person, or noticing the same question being re-derived from source every time.
---

# Codebase Index — Write Down What the Code Cannot Say

Source code states what happens. It rarely states why, which cases were deliberate, or what
a term means to the business. Agents re-derive that from scratch every session, expensively
and often wrongly. This skill puts that knowledge in the repo, next to the code, versioned
with it.

This is not `codebase-map`. That skill resolves symbols live before an edit. This one
maintains durable written knowledge that survives the session.

## What the index is

A small set of files the agent reads before doing anything else. Suggested layout, adjust to
the repo's conventions:

```
docs/index/
  INDEX.md          entry point: what this system is, where things live, what to read when
  glossary.md       domain terms, each defined once, with the code that owns it
  business-rules.md the rules the business cares about, each pointing at its enforcement site
  decisions/        one file per decision: context, options, choice, consequences
  gotchas.md        traps that have already cost someone a day
```

`INDEX.md` is a router, not an encyclopedia. Its job is to send the reader to the right file
in under thirty seconds.

## Method

1. **Harvest.** Business rules hide in predictable places: validation, pricing and billing,
   permission checks, state transitions, retry and timeout policy, feature flags, cron
   schedules, and any branch containing a magic number or a date.
2. **Write one entry per rule.** State the rule in business language, then cite the file and
   function that enforces it. If two places enforce it differently, that is a bug — record it
   as one.
3. **Define the vocabulary.** Every domain term that appears in more than one module gets a
   glossary entry naming the module that owns it. Where the code and the business use
   different words for the same thing, record both and mark the code's spelling as canonical.
4. **Record decisions when they are made, not later.** Context, options considered, choice,
   consequences. Four short paragraphs beat a template nobody fills in.
5. **Stamp and verify.** Every entry carries the commit SHA it was verified against. Re-check
   entries when you touch the code they describe.
6. **Prune.** A stale index is worse than none, because it is trusted. An entry that no longer
   matches the code is deleted or corrected in the same change, never left "for later".

## Rules

- Never restate what the code says plainly. If a reader can see it in five seconds, it does
  not belong here. Record intent, constraint, history, and vocabulary.
- Every business rule cites its enforcement site. A rule with no citation is folklore.
- A rule the code does not actually enforce is recorded as a gap, explicitly labelled, not
  written as though it were true.
- The index is updated in the same pull request as the change that invalidates it. A separate
  "docs later" task is how indexes die.
- Keep it small. If `INDEX.md` exceeds a screen or two, split by subsystem rather than letting
  it sprawl.
- Written by whoever changed the code, reviewed like code.

## Using it for precision

At the start of work in a repo that has an index:

1. Read `INDEX.md` first, then only the sections it routes you to.
2. Treat glossary terms as binding — use the codebase's word, not a synonym.
3. Before implementing anything touching money, permissions, or state transitions, check
   `business-rules.md`. If the change contradicts a recorded rule, stop and raise it rather
   than silently overriding it.
4. When you learn something the index does not contain and would have saved you time, add it
   before you finish. That is the maintenance loop.

## Anti-patterns

- A README rewrite disguised as an index.
- Rules stated with no citation, so nobody can tell if they are still true.
- An index generated once at onboarding and never touched again.
- Decisions recorded as outcomes only, with the rejected options and their reasons omitted —
  which guarantees the same debate next quarter.
