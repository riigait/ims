---
tags: [ims, frontend, api]
---

# Frontend API Rules

Governed by approved recommendation entries in `.claude/context/recommendations/` — don't edit those without a linked PR/issue/review note. This note links to them, doesn't duplicate authority.

## Rule: axios-only
Source: `rec-api-axios-only.md` (review_by 2026-12-01)
- All HTTP calls must use the shared axios instance from `frontend/src/services/api.ts`.
- Never `axios.create()` a second instance, never raw `fetch` (except documented exceptions below).
- Shared instance auto-injects `Authorization: Bearer <token>` and `X-Department-Id` via interceptors.

## Known violations (tracked cleanup)
Source: `rec-raw-fetch-cleanup.md` (review_by 2026-09-01)

| File | Raw fetch calls | Status |
|---|---|---|
| `AdminAssignment.tsx` | 5 | not blocking — no dept-scope guard on those endpoints |
| `AdminUsers.tsx` | 6 | not blocking |
| `Requests.tsx` | 1 | legitimate (blob download), migrate to `api.get(url, { responseType: 'blob' })` |
| `DepartmentGuard.tsx` | 2 | not blocking — auth check before context ready |

`Register.tsx` raw fetch is intentional (unauthenticated registration flow) — not a violation.

## Related
- [[Auth and Department Scoping]]
