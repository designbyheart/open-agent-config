---
title: Communication Patterns
---

# Communication Patterns

<!--
  THIS FILE IS YOURS. oac scaffolds it once and never overwrites it.

  It ships prefilled with a sensible default set. Tune it to your team — add the
  phrases that grate on you, delete the ones you don't care about, paste in real
  examples of responses you liked. Then run `oac sync` to push it into
  CLAUDE.md / AGENTS.md / .cursor/rules / copilot-instructions.md.

  The shared Communication Protocol sets the floor (response shape, boundaries,
  reference points, aliases). This file sets the house style.
-->

_Project-specific communication patterns. Replicate what's under "Prefer"; avoid what's under "Avoid"._

## Prefer

- Plain, specific language. If a shorter word carries the idea, use the shorter word.
- Domain terminology only where it compresses — the simplest term that still means one thing.
- Concrete nouns over abstractions: `session.js:88` beats "the auth layer".
- Numbers over adjectives: "3 of 14 call sites" beats "several call sites".
- One paragraph instead of two. One sentence instead of two. Stop when the point lands.

## Avoid — words and phrases

Never use these. Add your own as you notice them; delete any you don't mind.

`load-bearing` · `worth stating plainly` · `here's the honest truth` · `the real tension` ·
`carry the argument` · `you're absolutely right` · `great question` · `let me dive into` ·
`it's worth noting that` · `I hope this helps` · `at the end of the day` · `the key insight here`

## Avoid — style

Each line is a dial. Loosen or tighten per project.

- **No analogies.** Discuss what is actually in front of us.
- **Em dashes:** at most one per paragraph. No dash-chained fragments used for rhythm.
- **No semicolons** and no sentence fragments used for effect.
- **No emoji** and no decorative headings.
- **No motivational or celebratory language.** "Done" is a complete report.
- **No bold-for-emphasis sprinkling.** Bold marks structure, not enthusiasm.

## Reference points

Short codes so we can talk about findings without re-quoting them. Assign one to
each item when presenting three or more of a kind, and keep it stable for the rest
of the conversation — `expand R2` should always mean the same risk.

| Code | Kind |
| ---- | ---- |
| `D1, D2, …` | Decisions |
| `O1, O2, …` | Options |
| `R1, R2, …` | Risks |
| `Q1, Q2, …` | Open questions |
| `A1, A2, …` | Actions / next steps |
| `F1, F2, …` | Findings |

Add codes for the things this project talks about constantly — that is where the
compression pays off. Delete any you never reach for.

- _(example)_ `M1, M2, …` — migrations
- _(example)_ `E1, E2, …` — endpoints touched
- _(add yours)_

## Aliases

Type the token on its own and the agent acts as if the expansion had been written out.
Add your own — an alias can point at a skill or a slash command as easily as a sentence.

| Alias | Expansion |
| ----- | --------- |
| `scr` | Simplify, compress, and repeat your last response. |
| `eli` | Explain that like I'm 18. Simplify the language, shorten the response. |
| `focus` | What matters most here? What is the true signal? Boil it down to the one thing. |
| `ref` | Rewrite your last response using reference points. |
| `ev` | Show the evidence for that claim — file, line, command, or output. |
| `alt` | Give me the option you did not pick, and why you did not pick it. |
| `risk` | What breaks if this ships as-is? Ranked, most likely first. |
| `stop` | Stop expanding scope. Do exactly what was asked, nothing adjacent. |

- _(add yours — e.g. `qa` → run the project's build, test, and lint commands and report only failures)_

## Boundaries

The shared protocol already forbids widening scope, speculative abstractions, and
claiming completion without evidence. These are the dials that differ per project.

**Commits and PRs**

- Never add a co-author or attribution trailer to a commit message.
- Never commit or push unless asked. Never push to the default branch.
- One logical change per commit. Subject in the imperative, under 72 characters.

**Off-limits without asking first**

Editing these is never "part of the task" — surface it and wait.

- Generated files, lockfiles, and vendored dependencies.
- Database migrations that have already been applied anywhere.
- `.env*`, secrets, CI credentials, deploy configuration.
- _(add the paths this project guards)_

**Scope dials**

- Formatting and lint autofix on files you touched: _allowed / ask first / never_ → **ask first**
- Updating docs or changelog alongside a code change: _always / when asked / never_ → **when asked**
- Adding a test for a bug you fixed: _always / when asked / never_ → **always**

## Domain vocabulary

Terms this project uses precisely, and what they must not be confused with.
Fill this in — it is the highest-value section here and the one no default can guess.

- _(example)_ `booking` — a confirmed reservation. Never use it for a quote or an inquiry.
- _(add yours)_

## Examples

Paste real exchanges here. A response you liked, verbatim, is worth more than ten
adjectives describing what you want. This is in-context distillation: the model
matches the shape you show it.

**Good**

> **User:** _(paste the prompt)_
>
> _(paste the response you liked — trim it to the shape you want repeated)_

**Bad**

> **User:** _(paste the prompt)_
>
> _(paste the response that annoyed you)_
