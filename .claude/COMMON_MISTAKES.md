# Common Mistakes

**⚠️ CRITICAL - Read at session start**

---

## Top 5 Critical Mistakes

### 1. Missing `X-Department-Id` header on new API calls

**Symptom**: 403 or "Department not found" on write endpoints that were just added.
**Check**: `backend/src/middleware/auth.ts` — `requireDepartmentScopedWriteAccess` reads this header.
**Fix**: All non-auth frontend requests must include the header. The axios interceptor in `frontend/src/services/api.ts` adds it automatically — make sure new calls go through that instance, not raw `fetch`.

### 2. Prisma schema change without running migration

**Symptom**: Runtime error like `column X does not exist` or Prisma type errors after a schema edit.
**Check**: `backend/prisma/migrations/` — is there a new migration folder for your change?
**Fix**: `cd backend && npx prisma migrate dev --name describe-your-change`

### 3. JWT_SECRET mismatch between root `.env` and `backend/.env`

**Symptom**: All logins return 401 immediately after restarting the backend.
**Check**: Both files must have the same `JWT_SECRET` value.
**Fix**: Copy the value from one file to the other — they must be identical.

### 4. New protected route missing `authMiddleware`

**Symptom**: Route is accessible without login, or `req.userId` is undefined.
**Check**: Every route file in `backend/src/routes/` that handles protected data must import and apply `authMiddleware`.
**Fix**: Add `router.use(authMiddleware)` at the top of the route file, or apply it per-route.

### 5. Instantiating Prisma outside `utils/prisma.ts`

**Symptom**: Multiple DB connections; hot-reload creates connection leaks in dev.
**Check**: `grep -r "new PrismaClient" backend/src/` — should only appear in `utils/prisma.ts`.
**Fix**: Import the singleton: `import prisma from '../utils/prisma'`

---

**Last Updated**: 2026-06-07
