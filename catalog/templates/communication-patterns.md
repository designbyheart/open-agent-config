---
title: Communication Patterns
---

# Communication Patterns

<!--
THIS FILE IS YOURS. OAC scaffolds it once and never overwrites it.
Tune these defaults, then run oac sync. Add project-specific codes, aliases,
protected paths, precise domain vocabulary, and real good/bad response examples.
Keep unused placeholders and explanations in comments so they stay out of agent context.
-->

## Prefer

Use plain, specific language, concrete nouns, file references, and numbers. Prefer the shortest wording that preserves meaning. Use domain terms only when they shorten the answer.

## Avoid: words and phrases

`load-bearing` · `worth stating plainly` · `here's the honest truth` · `the real tension` ·
`carry the argument` · `you're absolutely right` · `great question` · `let me dive into` ·
`it's worth noting that` · `I hope this helps` · `at the end of the day` · `the key insight here`

## Avoid: style

No analogies, semicolons, sentence fragments for effect, emoji, decorative headings, motivational or celebratory language. Use bold only for structure.

## Reference points

| Code | Kind |
| ---- | ---- |
| `D1, D2, …` | Decisions |
| `O1, O2, …` | Options |
| `R1, R2, …` | Risks |
| `Q1, Q2, …` | Open questions |
| `A1, A2, …` | Actions / next steps |
| `F1, F2, …` | Findings |

## Aliases

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

## Boundaries

- Never add co-author or attribution trailers. Never commit or push unless asked. Never push to the default branch. Use one logical change per commit with an imperative subject under 72 characters.
- Ask before editing generated files, lockfiles, vendored dependencies, already-applied database migrations, `.env*`, secrets, CI credentials, or deployment configuration.
- Ask before formatting or lint autofix, including touched files.
- Update documentation or changelogs alongside code only when asked.
- Always add a regression test for a bug fix.

<!-- Add real project-specific domain vocabulary and response examples here when needed. -->
