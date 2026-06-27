---
name: delegate-and-orchestrate
description: Use when a task is big enough to split across agents, run in parallel, or hand off as a scoped autonomous loop instead of editing line-by-line. Covers feature-level delegation, parallel subagents, plan-mode gating, and writing a program.md boundary spec for unattended runs.
trigger: A multi-file feature, a research/exploration sweep, a batch of independent edits, or an overnight/autonomous run with a measurable metric. Skip for single small edits. Related — agentic-engineering-workflow, spec-driven-development.
---

# Delegate & Orchestrate

Stop typing code; start commanding tokens. On a non-trivial task your job is to scope it, hand it to agents, and review — not to write every line. Throughput is measured in how much agent output you can review per hour, not in keystrokes.

## When to use

- The work spans 3+ files or several independent units.
- It splits into pieces that don't depend on each other.
- It's a heavy read/search that would otherwise bloat the main context.
- It's an autonomous loop with an objective metric (optimize, sweep, batch-fix).

Skip it for one-off small edits — a direct prompt is cheaper than the orchestration overhead.

## Pick the altitude

Delegate **features and outcomes, not lines**. "Build this endpoint with tests" is one agent's job; "write this for-loop" is not worth the handoff. If a unit is too big to review in one sitting, split it into PR-sized chunks first.

## Parallelize independent work

- **Fan out:** spawn one subagent per independent unit (feature, file group, research question) and launch them in a single batch.
- **Isolate contexts:** each agent returns a conclusion, not its scratch work — only the summary lands in your context, keeping it lean.
- **A common split:** implementation · research/exploration · planning · review. Review one agent's output while the others are still running, and keep every agent fed with a clear, well-scoped task.

## Gate risky work with plan mode

Before any change spanning 3+ files or anything destructive, get a numbered plan and approve it before execution. This is the single biggest accuracy unlock for non-trivial work.

## Autonomous loops need boundaries

For any run you won't babysit, write a `program.md` first (see `templates/program.md`): objective, measurable success metric, what the agent CAN change, what it CANNOT, and the loop process. Without a metric and hard boundaries an autonomous loop drifts. It works only for **objectively measurable** goals (loss, pass rate, latency, build-green) — subjective quality (writing, UX, design) still needs a human in the loop.

The `program.md` itself is worth iterating: when a run underperforms, refine the instructions and rerun. Tightening the spec is the new tuning knob.
