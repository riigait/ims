---
id: rec-auth-department-scope
kind: recommendation
status: approved
summary: All new protected routes must use authMiddleware followed by a department-scope guard before the handler.
scope:
  level: path
  path_globs:
    - "backend/src/routes/**"
owner: "@IMS Developer"
reviewers: []
confidence: high
security:
  classification: internal
  redaction: none
source_refs:
  - type: doc
    value: "backend/src/index.ts route registration pattern"
created_at: 2026-06-03
updated_at: 2026-06-03
review_by: 2026-12-01
supersedes: []
tags:
  - security
  - authorization
  - api
  - backend
---

# Recommendation

Every new Express route mounted after `/api/auth` must apply `authMiddleware` and at least one of the department-scope guards before the route handler.

## Rationale

The backend's department isolation relies on middleware order. Routes registered without `authMiddleware` are publicly accessible. Routes registered without a scope guard can leak cross-department data.

## Required action

Follow the pattern in `backend/src/index.ts`:
```ts
app.use('/api/<resource>', authMiddleware, requireDepartmentScopedWriteAccess, resourceRoutes);
```

Use `requireSpecificDepartmentForWrite` for endpoints that must target exactly one department.

## Evidence

Established by the existing route registration pattern in `backend/src/index.ts`.
