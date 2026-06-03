---
description: Run the IMS release verification checklist. Use for staging-to-main merges, hotfix releases, or final pre-deploy review.
---

## Inputs

- Branch or PR number to review

## Checklist

1. Confirm all feature work is committed to staging.
2. Check for any pending Prisma migrations that need to run.
3. Confirm `.env.example` is up to date with any new env vars.
4. Confirm no secrets are hardcoded in changed files.
5. Summarize any breaking changes or manual steps needed after deploy.
6. Confirm frontend builds without errors (`npm run build` in `/frontend`).
7. List any open issues or known bugs that should be noted in the release.
