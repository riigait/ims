# IMS project memory

@context/app-overview.md
@context/architecture.md

## Project rules
- Global rules: `.claude/rules/core.md`
- Backend-specific rules: `.claude/rules/backend.md` (auto-loaded on `backend/src/**`)
- Frontend-specific rules: `.claude/rules/frontend.md` (auto-loaded on `frontend/src/**`)

## Recommendation system
- Approved entries live in `.claude/context/recommendations/`
- Use them when relevant; flag any that look stale and check `review_by`.
- Do not create or modify entries without a linked PR, issue, or review note.

## Skills
- Release checklist: `.claude/skills/release-check/SKILL.md`

## Design knowledge vault
- `IMS-Vault/` — Obsidian vault, design rules/decisions for floor-plan + isometric rendering.
- Before editing `FloorPlanEditor.tsx` or `Building2D.tsx` rendering logic, check `IMS-Vault/Object Design Rules.md`, `IMS-Vault/Isometric Depth Sorting.md`, `IMS-Vault/Entrance Style Logic.md`.
- Log fixed/open bugs in `IMS-Vault/Bug Tracker.md`.
