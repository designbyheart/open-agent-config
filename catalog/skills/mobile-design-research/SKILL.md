---
name: mobile-design-research
description: Research proven mobile UI patterns on Mobbin before designing or changing any mobile app interface. Use this skill whenever the task involves designing, redesigning, prototyping, mocking up, or improving screens, flows, or components for a mobile app (iOS or Android) — onboarding, checkout, feeds, settings, paywalls, navigation, empty states, anything. Trigger even when the user doesn't say "research" — the research step is mandatory before design work begins, including requests like "build a login screen", "improve this app's UX", "redesign the profile page", or "make a mobile prototype".
trigger: Any mobile app design work — new screens, redesigns, prototypes, or incremental UI changes for iOS/Android.
---

# Mobile Design Research (Mobbin-first)

Before any mobile design work — new screens, redesigns, prototypes, or incremental changes — research how popular, well-designed apps already solve the same problem using the Mobbin MCP. Mobbin is a library of real production screens and flows from top apps; designing without checking it means reinventing patterns that companies have already spent millions refining and users have already learned. The goal is not to copy, but to ground every design decision in patterns users already understand.

## Step 0: Check Mobbin MCP availability

Check whether Mobbin MCP tools are available (tool names contain `mobbin`; use ToolSearch if tools are deferred). If the MCP is not connected, tell the user to add it and pause the research step until it's available:

```
claude mcp add mobbin --scope user --transport http https://api.mobbin.com/mcp
```

If the user declines or the MCP can't be connected, say so explicitly, then proceed using well-known platform conventions (Apple HIG, Material Design) as the fallback reference — but note in the deliverable that Mobbin research was skipped.

## Step 1: Identify the pattern category

Before searching, name precisely what is being designed. Break the request into its UI pattern categories — e.g. onboarding flow, sign up / login, paywall, checkout, feed, search, filters, profile, settings, empty state, tab bar navigation, bottom sheet, data visualization. A vague search returns vague inspiration; a precise pattern name returns directly comparable examples.

Also note the app's domain (fintech, health, social, travel...) — patterns from the same domain carry the most signal because they reflect the same user expectations and constraints.

## Step 2: Search Mobbin

Query the Mobbin MCP for each pattern category identified. Prioritize:

1. Apps in the same domain as the user's app
2. Widely-used apps known for design quality (the patterns users have already learned)
3. Recent examples over old ones — mobile conventions shift fast

Aim for 3–5 strong examples per pattern. If the first query returns weak matches, reformulate — search by flow name, by app name, and by UI element until the examples are genuinely comparable.

## Step 3: Analyze the examples

For each example, extract what matters, not what's superficial:

- **Structure**: screen hierarchy, layout grid, where the primary action sits
- **Navigation**: how users enter and leave the flow, back behavior, tab vs modal vs push
- **Hierarchy**: what's emphasized first, type scale, use of color for priority
- **Interaction**: gestures, progressive disclosure, input methods, error and loading states
- **Platform conventions**: what iOS/Android idioms the examples respect (and where they deliberately deviate, and why that works for them)

Look for **convergence**: when 4 of 5 top apps solve something the same way, that's a learned user expectation — deviate only with a strong reason. When examples diverge, that's a genuine design decision to make deliberately.

## Step 4: Summarize findings before designing

Write a short research summary — a few sentences to a compact section, proportional to the task — covering: which apps/flows were reviewed, the convergent patterns to adopt, any patterns to deliberately avoid and why, and the open decisions where examples diverged. Share this with the user (or include it at the top of the deliverable) so the reasoning is visible.

Do not start producing the design before this summary exists. It is the contract between the research and the design.

## Step 5: Design, citing the research

Now do the design work. As decisions are made, tie the significant ones back to the research ("primary CTA pinned above the keyboard — the pattern in 4/5 checkout flows reviewed"). If the user pushes back on a choice, the research gives both of you something concrete to argue against instead of taste vs taste.

## Scope notes

- This applies to changes as well as greenfield work — a "small tweak" to a checkout flow deserves a quick look at how top apps handle that exact element. Scale the research depth to the change: a full flow gets the whole protocol; a single component gets a fast targeted search.
- Web/desktop-only design work does not require this skill, but responsive designs with a significant mobile experience do.
- Combine freely with other design skills (prototyping, critique, design systems) — this skill governs the research step that comes first, not the production step.
