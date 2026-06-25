---
tags: [ims, csv, import-export]
---

# CSV Import / Export

## Import
- Staff-initiated imports go through the approval queue — see `importRequests.ts` and [[Approval Workflows]].
- Validate CSV shape/types at the route boundary before touching Prisma (per `.claude/rules/backend.md`).

## Export
- `exportRequests.ts` — export may be gated similarly to import if it covers sensitive cross-department data.

## Frontend helpers
- CSV parsing/building lives in `frontend/src/utils/` (csv helpers) — keep parsing logic there, not inline in page components.

## Tooling reference
- `scripts/csv-corrector/format.csv`, `scripts/csv-corrector/sample_inventory.csv` — tracked sample/format files (everything else `*.csv` is gitignored).

## Open questions
- [ ] Document exact CSV column schema expected per import type
- [ ] Confirm whether export requires approval or is admin-direct
