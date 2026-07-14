---
name: feature-dev
description: End-to-end agentic workflow for building a feature from scratch — a fixed five-stage pipeline of explore, architect, implement, test, and review. Use when asked to build a whole feature (not a small edit) and you want the agent to run the full lifecycle rather than jumping straight to code.
user-invocable: true
trigger: A request to build a complete new feature end-to-end, where exploration, design, implementation, testing, and review should all happen in sequence.
---

# Feature Dev — Five-Stage Feature Pipeline

Build a feature by moving through five explicit stages in order. Each stage has an output the next stage consumes; do not skip ahead.

## Stage 1 — Explore

Map the terrain before touching it. Find the files, modules, and existing patterns the feature will interact with. Identify the conventions already in use (naming, error handling, testing style) so the new code fits in. Note constraints: public interfaces that must not break, data shapes, auth boundaries. Output: a short brief of what exists and what the feature must respect.

## Stage 2 — Architect

Design the change against the brief. Decide the shape: new modules vs. edits to existing ones, data flow, interfaces, and where the seams are. Call out the tradeoffs and pick a direction. Define acceptance criteria. Output: a concrete plan — files to add/change and the order to do them in.

## Stage 3 — Implement

Build to the plan, smallest coherent piece first, keeping the codebase working after each step. Follow the conventions found in Stage 1. Prefer many small, reviewable changes over one large one.

## Stage 4 — Test

Cover the feature with tests: the happy path, the edge cases named in the plan, and the failure modes. Run them. Fix what breaks. A feature without passing tests is not finished.

## Stage 5 — Review

Re-read the whole diff as a critic, not the author. Check correctness, security, error handling, and that every acceptance criterion is met. Produce a summary of what changed and why, and a PR-ready description.

## Rules

- Each stage's output must exist before the next begins.
- Respect existing conventions over personal preference.
- If Stage 1 or 2 reveals the request is ambiguous or bigger than stated, surface it before implementing.
- Leave the tree green at every step.
