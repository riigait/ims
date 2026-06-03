---
description: Run the IMS release verification checklist. Use for release prep, hotfix review, or final pre-merge verification of the staging branch.
---

## Inputs
- Branch name or PR number (defaults to current branch)

## Checklist

1. **Prisma schema** — confirm no breaking migration is uncommitted (`npx prisma migrate status`).
2. **Environment variables** — confirm `.env.example` has entries for all new `process.env` reads added in this release.
3. **Route guards** — confirm every new route in `backend/src/index.ts` has `authMiddleware` and a scope guard.
4. **Frontend API calls** — confirm no new raw `fetch` or standalone `axios.create` calls were introduced.
5. **Build** — run `npm run build` in both `frontend/` and `backend/`; confirm zero type errors.
6. **Secrets scan** — confirm no credentials or tokens appear in changed files.
7. **Changelog / PR description** — confirm the PR describes what changed and any manual steps needed.
8. **Rollback note** — if a migration was added, confirm there is a rollback plan or the migration is reversible.

## Output
Summarise: ready / blocked. List any checklist items that failed with the specific file or command output.
