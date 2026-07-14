---
name: superpowers
description: A disciplined build workflow that forces the agent to plan before coding — brainstorm the approach, decompose the work into small atomic tasks, and drive each one with test-first development. Use for any non-trivial feature, refactor, or bug fix where jumping straight to code tends to produce sprawling, unverified changes.
user-invocable: true
trigger: Starting a non-trivial coding task (feature, refactor, multi-file change) and wanting structured, test-driven execution instead of a large unplanned edit.
---

# Superpowers — Plan, Decompose, Test-Drive

A workflow that trades speed-of-first-keystroke for correctness. The agent does not start editing until the work is understood and broken down.

## When to use

Any task large enough that a single unplanned edit would be risky: new features, cross-file refactors, non-obvious bug fixes. Skip it for one-line changes.

## The workflow

1. **Brainstorm first.** Restate the goal in one sentence. List the approaches worth considering, name the tradeoffs, and pick one. State the assumptions being made and the acceptance criteria ("done" means what, exactly).
2. **Decompose into atomic tasks.** Break the chosen approach into the smallest independently-verifiable steps. Each task should touch as few files as possible and have a clear pass/fail check. Order them so every step leaves the codebase working.
3. **Test-drive each task.** For each atomic task, in order:
   - Write or identify the test that proves the step works, and confirm it fails for the right reason.
   - Implement the minimum code to make it pass.
   - Run the test; refactor only once green.
   - Do not move to the next task until the current one is verified.
4. **Integrate and review.** After the last task, run the full test suite, re-read the diff end to end, and confirm every acceptance criterion is met.

## Rules

- No code before there is a plan and a decomposition.
- One atomic task in flight at a time — resist bundling unrelated changes.
- A task is not "done" because it was written; it is done when its check passes.
- If a task turns out bigger than expected, stop and split it further rather than pushing through.
- Keep the running plan visible so the user can see what is finished and what remains.

## Output

Begin with the one-line goal, the chosen approach, and the task list. As work proceeds, show which task is active and its verification result. End with the full-suite result and a diff summary.
