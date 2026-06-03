---
id: rec-raw-fetch-cleanup
kind: cleanup
status: approved
summary: Several pages use raw fetch instead of services/api.ts; not currently blocking but should be migrated for consistency and future safety.
scope:
  level: path
  path_globs:
    - "frontend/src/pages/AdminAssignment.tsx"
    - "frontend/src/pages/AdminUsers.tsx"
    - "frontend/src/pages/Requests.tsx"
    - "frontend/src/components/DepartmentGuard.tsx"
owner: "@IMS Developer"
reviewers: []
confidence: high
security:
  classification: internal
  redaction: none
source_refs:
  - type: review
    value: "Release checklist audit 2026-06-03 (staging branch)"
created_at: 2026-06-03
updated_at: 2026-06-03
review_by: 2026-09-01
supersedes: []
tags:
  - frontend
  - api
  - cleanup
---

# Known raw fetch violations

The following files use raw `fetch` instead of the shared axios instance from `services/api.ts`, violating the frontend rule in `.claude/rules/frontend.md`.

## Files and call counts

| File | Raw fetch calls | Notes |
|------|----------------|-------|
| `frontend/src/pages/AdminAssignment.tsx` | 5 | Superadmin dept-assignment ops |
| `frontend/src/pages/AdminUsers.tsx` | 6 | Superadmin user/invite management |
| `frontend/src/pages/Requests.tsx` | 1 | Blob download — legitimate edge case |
| `frontend/src/components/DepartmentGuard.tsx` | 2 | Auth check before context is ready |

## Why not currently blocking

All endpoints called by these pages (`/api/users`, `/api/invites`, `/api/departments`, `/api/admin-departments`, `/api/staff-departments`, export download) are mounted with `authMiddleware` only — none require `requireDepartmentScopedWriteAccess`. The missing `X-Department-Id` header does not cause errors today.

`Register.tsx` also uses raw fetch but is intentionally unauthenticated (registration flow) — not a violation.

## Required cleanup

Migrate each call to `services/api.ts`. For the blob download in `Requests.tsx`, use `api.get(url, { responseType: 'blob' })` instead of raw fetch.

Do not add `X-Department-Id` manually; the interceptor handles it automatically once migrated.
