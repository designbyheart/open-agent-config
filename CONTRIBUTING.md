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

## Releasing

Packages go to the **GitHub Packages** npm registry, published by
`.github/workflows/release.yml` using the workflow's own `GITHUB_TOKEN`. There is no
npmjs account, no stored credential, and no manual first publish — package visibility
just follows the repository's.

A release is one tag:

```sh
# package.json is already at the version you want — the pre-push guard sees to it
git tag v0.1.3
git push origin v0.1.3
```

The workflow runs the suite, refuses a tag that disagrees with `package.json`,
publishes `@designbyheart/open-agent-config`, and opens the GitHub release.

Consumers need two lines of `~/.npmrc` before installing, because GitHub Packages
requires authentication even for public packages:

```
@designbyheart:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=<a GitHub PAT with read:packages>
```

Anyone upgrading from before the rename must `npm uninstall -g open-agent-config` first:
the bin is still `oac`, so npm fails with `EEXIST` otherwise. `oac update` says so when an
install fails.

Without that `.npmrc`, `npm i -g @designbyheart/open-agent-config` fails and `oac update`
falls back to installing from the git repo — which is why the README still documents
`npm i -g github:designbyheart/open-agent-config` as the zero-setup route.
