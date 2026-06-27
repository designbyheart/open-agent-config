# program.md — Agent task spec

Copy this into a task file before kicking off an autonomous or delegated run. Fill every section — an agent with no boundaries drifts, and a loop with no metric never knows when to stop.

## Objective

<the one outcome you want — e.g. "Cut p95 latency on the /search endpoint">

## Success metric

<how success is measured, objectively — e.g. "p95 < 200ms on the load test, all tests still green">

## CAN change

- <in-scope files, parameters, or approaches the agent is free to modify>

## CANNOT change

- <off-limits: public API shape, DB schema, dependencies, the test suite, …>

## Process

1. Establish the baseline; record the metric.
2. Make ONE change; measure.
3. Log the result and the keep/revert decision in an experiments log.
4. Repeat until the metric is met or <N> attempts are spent.
5. Stop and report: the best config, what was tried, and what's left for human judgment.
