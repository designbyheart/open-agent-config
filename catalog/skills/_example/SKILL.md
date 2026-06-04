---
name: _example
description: Sample skill showing the catalog skill format. Copy this folder to create a real one.
trigger: Never triggers — this is a template. Replace with real trigger conditions.
---

# Example Skill

This is a placeholder so the catalog structure is clear. To add a real skill:

1. Copy this folder to `catalog/skills/<your-skill-name>/`.
2. Edit the frontmatter: `name`, `description`, `trigger`.
3. Write the skill instructions in the body below.
4. Add any supporting files alongside `SKILL.md` — the whole folder is copied
   into a project's `.claude/skills/<name>/` when selected.

## What a skill contains

A skill is a self-contained playbook the agent loads on demand. Keep the body
focused: when to use it, the steps to follow, and any commands or references.
