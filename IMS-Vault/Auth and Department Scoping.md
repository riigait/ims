---
tags: [ims, backend, auth, security]
---

# Auth and Department Scoping

Source: `backend/src/middleware/auth.ts`

## Roles
| Role | `req.departmentId` behavior |
|---|---|
| superadmin | always `undefined` — sees all departments, but **view/report only** for write-scoped pages (`requireDepartmentScopedWriteAccess` returns 403 on POST/PUT/PATCH/DELETE) |
| admin | single dept → `departmentId` set; multiple depts + no header → `departmentIds[]` (all-assigned mode) |
| staff | same pattern as admin, scoped to `staffDepartments` |

## Request flow
1. `authMiddleware` verifies JWT (Bearer header or cookie), loads user + dept assignments.
2. Reads `X-Department-Id` header (set by frontend axios interceptor):
   - specific dept ID → validated against assigned depts, 403 if not assigned
   - `'all-departments'` → `req.departmentIds` = all assigned (no single `departmentId`)
   - absent + exactly 1 assigned dept → auto-selects that dept
   - absent + multiple assigned → falls into all-departments mode
3. `canAccessDepartment(req, deptId, allowUnassigned?)` — central check; superadmin always true.

## Write guards
- `requireSpecificDepartmentForWrite` — blocks writes when in all-departments mode (must pick one dept first).
- `requireDepartmentScopedWriteAccess` — wraps above + hard-blocks superadmin writes entirely.
- Order is fixed: `authMiddleware` → department-scope guard → route handler. Don't reorder.

## Gotcha
`NO_DEPARTMENT_ACCESS_ID = '__no_department_access__'` sentinel — used when a user has zero dept assignments, so `departmentIds` is never an empty array (avoids accidental "all rows" Prisma queries).

## Related
- [[Backend Routes Map]]
- [[Frontend API Rules]]
- Governed by `rec-auth-department-scope.md` in `.claude/context/recommendations/` (review_by 2026-12-01)
