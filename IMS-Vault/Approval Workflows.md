---
tags: [ims, workflows, approval]
---

# Approval Workflows

IMS gates several staff actions behind admin approval instead of direct writes.

## Pattern
1. Staff submits request (delete/edit/import/password-reset) → row created in `*Request` table, status `pending`.
2. Notification fires to relevant admin(s) (see notifications bell).
3. Admin reviews via approval UI → approve/reject.
4. On approve: original action applied (e.g. delete/edit actually executed); on reject: request marked closed, no mutation.

## Request types
| Type | Route file | Triggers |
|---|---|---|
| Delete | `deleteRequests.ts` | Staff tries to delete a record |
| Edit | `editRequests.ts` | Staff tries to edit a record |
| Import | `importRequests.ts` | Staff uploads CSV for bulk import |
| Password reset | `passwordRequests.ts` | User requests password reset |

## Why this exists
Staff role = "read + request workflow" (see app-overview.md). Direct mutation is admin/superadmin only for sensitive ops; staff requests funnel through admin review instead of being blocked outright.

## Audit trail
Approved/rejected actions should log through `backend/src/utils/audit.ts` — check before adding a new request type without audit logging.

## Related
- [[Backend Routes Map]]
- [[Auth and Department Scoping]]
