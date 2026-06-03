---
id: rec-table-alignment
kind: recommendation
status: approved
summary: All tables use left for text/names, right for numbers, center for status/badges/actions.
scope:
  level: path
  path_globs:
    - "frontend/src/pages/**"
owner: "@developer"
reviewers: []
confidence: high
security:
  classification: internal
  redaction: none
source_refs:
  - type: issue
    value: "table-alignment-standard-2026"
created_at: 2026-06-03
updated_at: 2026-06-03
review_by: 2026-12-01
supersedes: []
tags:
  - ui
  - tables
  - alignment
---

# Recommendation

All data tables in the app must follow this alignment standard:

- **Text / names** → `text-left`
- **Numbers** → `text-right`
- **Status badges, action buttons** → `text-center` + `flex justify-center`

## Header alignment

Table headers must mirror the data row grid structure exactly. For rows that include a `ChevronRight` icon, add a `w-4 flex-shrink-0` spacer div at the end of the header inner grid to prevent column misalignment.

## Evidence

Applied across all pages: Products, InventoryItems, StockMovements, Locations, FloorPlans, AdminUsers, PasswordRequests, Requests.
