---
id: rec-api-axios-only
kind: recommendation
status: approved
summary: All frontend API calls must go through the shared axios instance in services/api.ts; never use raw fetch or a second axios instance.
scope:
  level: path
  path_globs:
    - "frontend/src/**"
owner: "@IMS Developer"
reviewers: []
confidence: high
security:
  classification: internal
  redaction: none
source_refs:
  - type: doc
    value: "frontend/src/services/api.ts"
created_at: 2026-06-03
updated_at: 2026-06-03
review_by: 2026-12-01
supersedes: []
tags:
  - frontend
  - api
  - auth
---

# Recommendation

All HTTP calls from the React frontend must use the shared axios instance exported from `frontend/src/services/api.ts`.

## Rationale

The shared instance automatically injects the `Authorization: Bearer <token>` header and the `X-Department-Id` header via interceptors. Bypassing it produces unauthenticated requests or requests missing the department scope, causing 401/403 errors at the backend.

## Required action

Import and use the default export from `services/api.ts`. Do not create a new `axios.create()` call in page or component files.

## Evidence

Interceptor logic at lines 12–27 of `frontend/src/services/api.ts`.
