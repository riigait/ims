# IMS Project memory entry point

@context/app-overview.md
@context/architecture.md

## Project rules

Global rules live in `.claude/rules/core.md`.
Component-specific rules live in `.claude/rules/`.

## Recommendation system

Reviewed recommendations live in `.claude/context/recommendations/`.
Use approved recommendations when relevant to the task.
If a recommendation seems stale, mention it and check `review_by`.

## Editing policy

Do not create or modify approved recommendation entries without a linked PR, issue, or review note.
