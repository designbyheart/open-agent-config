---
name: naming-review
description: Flag vague, uninformative identifier names (functions, variables, hooks, props) and suggest descriptive replacements. Catches empty prefixes like handle*/do*/process*, ambiguous single verbs, and boolean-shaped names used for actions. One line per finding.
trigger: User says "review names", "these names are vague", "is this name clear", "suggest a better name", or "/naming-review". Also proactively when reviewing a diff that introduces poorly named symbols.
---

Review code for names that don't tell the reader what the thing is or does.
A good name is documentation; a vague one forces the reader to open the body.
One line per finding: where it is, why it's vague, what to rename it to.

## What to flag

- **Empty prefix carrying no information.** `handle`, `do`, `run`, `perform`,
  `process`, `manage`, `execute` + a generic word. `handleVerify` →
  `verifyOtpCode`. The prefix says "this is a function"; the name should say
  *what it does*. Keep `handle*`/`on*` ONLY where a real convention wants it
  (see "Leave alone" below).
- **Ambiguous single verb — verb without an object.** `verify` (verify what?),
  `update`, `submit`, `load`, `check` standing alone. Add the object:
  `verifyOtpCode`, `submitVerification`, `loadMemberProfile`.
- **Shape/type mismatch.** A name shaped like a boolean (`is*`, `has*`,
  `should*`, `can*`) that is actually an action/handler, or vice-versa.
  `isVerified` for a function that *performs* verification is wrong — it reads
  as state. Booleans get `is/has/should`; actions get a verb.
- **Grab-bag nouns.** `data`, `info`, `item`, `obj`, `temp`, `result`, `value`,
  `stuff`, `thing`, `params2`, `x` when a domain word exists. `response` for the
  parsed body → `memberProfile`.
- **Lies / staleness.** Name claims something the code no longer does
  (`getUser` that also writes, `emailList` that holds phones). Rename to match
  reality, or fix the code.
- **Misleading abbreviations & noise words.** `usr`, `calc`, `mgr`, `Helper`,
  `Util`, `Manager`, `Service` suffixes that add nothing. Name the role.

## Leave alone (don't churn)

- **Public API / prop names with an established convention.** React callback
  props (`onVerify`, `onResendPress`), lifecycle names, framework contracts.
  Renaming these ripples across consumers for no real gain — flag the internal
  binding instead. (e.g. keep the exported `onVerify` prop; rename the internal
  `handleVerify` callback it points to.)
- **Sibling-consistent handlers.** If the file already uses `handleXPress`
  throughout, match it rather than introducing a lone different style — but note
  when the *whole* convention is worth upgrading.
- **Loop/index throwaways** (`i`, `j`), well-known idioms (`cb`, `ctx`, `id`),
  and math where single letters are the norm.

## Format

`<file>:L<line>: <current> — <why vague>. → <suggested>`

Group by file. If a rename crosses a module boundary (exported symbol used
elsewhere), say so and list the call sites, and default to renaming only the
internal binding unless the user asks for the full rename.

## Examples

```
hooks/useVerificationScreen.ts:L167: handleVerify — `handle` prefix carries no
  info; single verb doesn't say what's verified. → verifyOtpCode
  (keep exported prop `onVerify`; only the internal callback changes)
services/api/user.ts:L20: data — grab-bag noun for a parsed profile. → memberProfile
utils/date.ts:L4: doStuff — verb+noun say nothing. → formatDepartureTime
components/Foo.tsx:L12: isSubmit — boolean shape but it's the submit handler.
  → submitForm (or, if it's really a flag, isSubmitting)
```

## Suggesting, not enforcing

Offer the better name; the final choice is the author's. When a name is a
genuine judgement call (two equally clear options), present both briefly rather
than picking for them. Don't rename across public boundaries without flagging
the blast radius first.
