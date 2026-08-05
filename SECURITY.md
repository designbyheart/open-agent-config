# Security

## Reporting a vulnerability

Open a [private security advisory](https://github.com/designbyheart/open-agent-config/security/advisories/new),
or email designbyheart@gmail.com. Please do not open a public issue for a
vulnerability.

Expect an acknowledgement within a few days.

## What this tool does to your machine

Worth knowing before you run it:

- `oac init` and `oac sync` write files inside the target project directory only.
  Generated content is confined to a managed block, so hand edits outside that block
  survive a re-run.
- `oac import-skill <git-url>` runs `git clone` against the URL you pass. Only import
  from sources you trust — a skill is instructions handed to an AI agent with access
  to your codebase.
- The pre-push hook in `hooks/` invokes the `claude` CLI on your staged diff. It sends
  that diff to whatever backend your `claude` CLI is configured against.
- Nothing is transmitted anywhere by the CLI itself, and there is no telemetry.
