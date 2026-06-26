---
tags: [ims, backend, routes]
---

# Backend Routes Map

All in `backend/src/routes/`, registered in `backend/src/index.ts`.

## Core resources
- `products.ts`, `categories.ts`, `locations.ts`, `stockMovements.ts`, `stockDetails.ts`

## Approval workflows (see [[Approval Workflows]])
- `deleteRequests.ts` — staff-requested deletes, admin approves
- `editRequests.ts` — staff-requested edits, admin approves
- `importRequests.ts` — CSV import approval queue
- `passwordRequests.ts` — password reset approval
- `verifyRequests.ts` — generic verify/approve endpoint group
- `exportRequests.ts` — export approval (if gated)

## Org structure
- `departments.ts` / `adminDepartments.ts` / `staffDepartments.ts` — dept CRUD + assignment
- `users.ts`, `invites.ts` — user management, invite flow

## Floor plan + map
- `floorPlans.ts` — floor plan CRUD, ties to [[Object Design Rules]]
- `map.ts` — building/location map data

## Misc
- `dashboard.ts` — stock summaries, recent activity
- `notifications.ts` — bell notifications
- `auditLogs.ts` — audit trail (see `backend/src/utils/audit.ts`)
- `settings.ts` — app settings
- `auth.ts` — login, initial setup, `/me`

## Rule
New protected routes must use `authMiddleware` + appropriate department-scope guard. See [[Auth and Department Scoping]].
