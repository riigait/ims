---
id: rec-stock-movement-status
kind: recommendation
status: approved
summary: StockMovement status values are pending/committed/cancelled; display labels use unconfirmed/confirmed to avoid git confusion.
scope:
  level: path
  path_globs:
    - "frontend/src/pages/StockMovements.tsx"
    - "backend/src/routes/stockMovements.ts"
owner: "@developer"
reviewers: []
confidence: high
security:
  classification: internal
  redaction: none
source_refs:
  - type: issue
    value: "rename-committed-display-label-2026"
created_at: 2026-06-03
updated_at: 2026-06-03
review_by: 2026-12-01
supersedes: []
tags:
  - stock-movements
  - status
  - naming
---

# Recommendation

The `StockMovement.status` DB values remain `pending`, `committed`, `cancelled` (no migration needed).

Display labels in the UI use:
- `pending` → **Unconfirmed**
- `committed` → **Confirmed**

## Rationale

"Committed" was confused with git commits by developers. Renaming display labels avoids the confusion without requiring a database migration.

## Confirm action

Admin can confirm a pending movement via "Confirm Movement" button in the drawer.
API call: `PATCH /api/stock-movements/:id` with `{ status: 'committed' }`.
