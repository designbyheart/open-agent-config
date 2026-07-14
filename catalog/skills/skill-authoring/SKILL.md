---
name: skill-authoring
description: Author a new reusable agent skill or rule set from a described task — draft the instructions, define trigger conditions, test them, and package the folder. Generalized from "skill creator" to be tool-neutral so the output works as a skill (Claude), an AGENTS.md fragment, a Cursor rule, or a Copilot instruction.
user-invocable: true
trigger: Turning a repeated task or workflow into a reusable, self-contained playbook that an agent loads on demand.
---

# Skill Authoring

Turn a described task into a clean, reusable playbook that any agent can load. A good skill is self-contained, has a clear trigger, and tells the agent exactly what to do — not what a tool happens to be called.

## When to use

The user does the same kind of task repeatedly, or wants to codify a workflow so it runs consistently. The output is a skill folder that can be copied into a project and, in this catalog, inlined into non-Claude config files.

## Anatomy of a skill

A skill is a folder with a `SKILL.md`:

```
<skill-name>/
  SKILL.md            # frontmatter + the playbook body
  references/  ...     # optional supporting markdown (inlined for portable targets)
  scripts/  assets/    # optional non-text extras (travel only with a native-skill install)
```

Frontmatter fields:
- `name` — kebab-case, matches the folder.
- `description` — what it does and when to use it, written so a router can match it. One or two sentences.
- `trigger` — the concrete situation that should invoke it.
- `user-invocable: true` — if the user should be able to call it by name.

## Method

1. **Extract the task.** Get the user to describe the job once, concretely. Identify inputs, the steps, the output, and what "done" looks like.
2. **Draft the body.** Write the steps as instructions to the agent: when to use it, the procedure, the rules, the output format. Keep it focused — a skill is a playbook, not documentation.
3. **Write the trigger and description** so the skill fires at the right time and not otherwise.
4. **Test it.** Run the skill against a real example. Does it trigger when expected? Does following it produce the intended result? Tighten wording where it drifts.
5. **Keep it portable.** Address "the agent," not any specific product. Put any long reference material in `references/` as markdown so it inlines cleanly. Only use `scripts/`/binary assets when text can't do the job, and say so in the body.

## Rules

- One skill, one job. If it sprawls, split it.
- The description carries the routing weight — invest in it.
- Prefer plain, tool-agnostic language so the skill survives being inlined into `AGENTS.md`, a Cursor rule, or a Copilot instruction file.
