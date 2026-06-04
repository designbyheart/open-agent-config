# Comment Schema And Decision Rules

## `comments.json` schema

Each item has:

- `comment_key`: stable identifier (`issue:<id>`, `inline:<id>`, `review:<id>`)
- `source`: `issue_comment`, `inline_review_comment`, or `review_body_comment`
- `author`
- `body`
- `url`
- `created_at`
- `path` and `line` (for inline comments when available)
- `question_candidate`: heuristic pre-flag for likely question text

## Classification rubric

Use one label per comment:

- `question_only`: asks for clarification or rationale and does not require a code change.
- `valid_actionable`: requests a concrete change or identifies a valid defect/regression/risk.
- `not_valid`: incorrect claim, already fixed, or no longer relevant; always provide evidence.

## Option generation rules for `valid_actionable`

Generate exactly:

- `Option A`: smallest correct fix.
- `Option B`: alternative approach (broader cleanup, different implementation, or explicit tradeoff).

For each option, include:

- touched files/components
- behavior change
- risk/tradeoff
- tests to run

## User decision workflow

Ask one question per actionable comment using an interactive options prompt:

- Option 1 label: `Option A (Recommended)`
- Option 2 label: `Option B`
- Free-text / `Other` option: user-entered custom instructions for that comment

Question text should include the `comment_key`, comment summary, and A/B tradeoff. Do not apply changes until all `valid_actionable` comments have a decision.
