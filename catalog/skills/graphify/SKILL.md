---
name: graphify
description: Use Graphify to turn a repository into a queryable knowledge graph — code, docs, PDFs — and traverse it instead of grepping. Covers install, graph build, query/path/explain, the MCP tools, and how to treat EXTRACTED versus INFERRED edges.
user-invocable: true
trigger: Facing an unfamiliar or large codebase and asking impact, connection, or "what talks to what" questions — where grep returns hundreds of hits and none of the structure.
---

# Graphify — Query the Codebase Instead of Grepping It

[Graphify](https://github.com/Graphify-Labs/graphify) parses a repository with tree-sitter
and builds a knowledge graph of code, documentation, and other assets. It is not a vector
index: no embeddings, no similarity scores, just a graph you traverse. Parsing is local and
deterministic, so it runs on private code without sending anything anywhere.

Use it when the question is about **structure** — what connects to what, what breaks if this
changes, where a concept actually lives. Keep using grep for literal string hunts.

## Setup

```bash
uv tool install graphifyy      # note the double y: the PyPI package is graphifyy
graphify install               # registers the /graphify command with your AI assistant
```

Then, in the repo:

```
/graphify .
```

The build produces three artifacts:

| File | What it is |
| --- | --- |
| `graph.json` | the queryable graph itself |
| `GRAPH_REPORT.md` | key concepts and suggested questions — read this first |
| `graph.html` | interactive force-directed visualisation |

Add all three to `.gitignore` unless the team has decided to commit a snapshot. They are
build output, they go stale, and a stale graph read as current is worse than no graph.

## Querying

```bash
graphify query "what connects the billing service to the notification queue?"
graphify path "CheckoutController" "PaymentGateway"
graphify explain "SubscriptionState"
```

Over MCP, the same graph is exposed as `query_graph`, `get_node`, `get_neighbors`,
`shortest_path`, plus PR-oriented operations. Prefer the MCP tools when the assistant has
them — the answers come back structured rather than as text to re-parse.

## Method

1. **Build once, at the start of the work.** `/graphify .` on the repo root.
2. **Read `GRAPH_REPORT.md` before asking anything.** It names the concepts the graph found
   and suggests questions worth asking. It is the cheapest orientation available.
3. **Ask structural questions.** Impact analysis before a refactor, tracing a request across
   service boundaries, finding every consumer of a type, locating where a domain concept is
   actually implemented rather than merely mentioned.
4. **Verify before editing.** A graph answer tells you where to look. Confirm the specifics in
   the source — see `codebase-map` — before changing a signature or deleting anything.
5. **Rebuild after structural change.** The graph is a snapshot of the commit it was built
   from. After a merge or a large refactor it is describing a repo that no longer exists.

## EXTRACTED versus INFERRED

Every edge is tagged with its provenance, and this distinction is the reason to trust the
tool at all:

- **EXTRACTED** — explicit in the source. An import, a call, a declared relation. Treat as
  fact.
- **INFERRED** — resolved by Graphify across a boundary it could not read directly. Treat as
  a hypothesis. Confirm it in source before acting on it, and say it was inferred when you
  report it.

Never present an inferred edge as an established dependency. If a refactoring plan rests on
one, verify it first.

## Rules

- Graph answers are a map, not the territory. Nothing gets edited on the strength of a graph
  query alone.
- Report the provenance tag whenever you cite an edge to a human.
- Do not commit `graph.json`, `graph.html`, or `GRAPH_REPORT.md` without a deliberate decision
  to do so, and a plan for keeping them fresh.
- Note the commit the graph was built from when you use it in a written analysis.
- Where the graph and the code disagree, the code wins and the graph gets rebuilt.

## Pairs with

- `codebase-map` — the graph finds the place; symbol resolution confirms the exact signature
  before you touch it.
- `codebase-index` — the graph shows structure; the index records intent and business rules
  the graph cannot see.
