# Contributing

Thanks for taking a look. This project has a small surface area, so contributions
are straightforward.

## Getting set up

```bash
git clone https://github.com/designbyheart/open-agent-config.git
cd open-agent-config
npm install
npm test
node bin/cli.js --help
```

Node 18 or newer. No build step — the CLI runs from source.

## Where things live

| Path | What it is |
| --- | --- |
| `catalog/rules/` | The canonical rules, as markdown fragments. Filename order is include order. |
| `catalog/rules/stacks/` | Optional per-stack fragments, selected with `--stacks`. |
| `catalog/skills/<id>/` | One folder per skill, each with a `SKILL.md`. |
| `catalog/targets.json` | The editors and agents the CLI knows about. |
| `src/targets/` | One renderer per target — where a target's output format is decided. |
| `src/managed.js` | The managed-block logic. Treat changes here as high risk. |
| `test/` | `node --test` suites. |

## Adding a rule or a skill

Rules are markdown. Add a file to `catalog/rules/`, prefix it with a number to place
it in the sequence, and run `oac sync` in a project to see the result.

Skills need a `SKILL.md` with `name`, `description`, and `trigger` frontmatter. Copy
`catalog/skills/_example/` as a starting point. The whole folder is copied on install,
so bundled `references/`, `scripts/`, and `assets/` come along.

Keep skills generic. Anything naming a specific company, internal tool, or private
repository belongs in your own fork, not here.

## Adding a target

1. Add an entry to `catalog/targets.json`.
2. Add a renderer in `src/targets/` and register it in `src/targets/registry.js`.
3. Add a test asserting the artifact path and that its managed block round-trips.

## Before opening a PR

- `npm test` passes.
- New behaviour has a test. Anything touching `src/managed.js` or `src/manifest.js`
  needs one, since both write to files a user may have hand edited.
- No generated output committed — `AGENTS.md`, `CLAUDE.md`, `.cursor/`, and friends
  are ignored on purpose. The catalog is the source of truth.
