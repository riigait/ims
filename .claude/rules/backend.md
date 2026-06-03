---
paths:
  - "backend/src/**/*.ts"
---

# Backend rules

- All routes go in `backend/src/routes/`; register them in `backend/src/index.ts`.
- Use the shared `prisma` singleton from `backend/src/utils/prisma.ts`; never create a second instance.
- Validate request input at the route boundary before touching Prisma.
- Preserve the standard Express error-response shape used across existing routes.
- Prefer additive schema migrations; flag any breaking Prisma schema change before writing it.
- Auth middleware order: `authMiddleware` → department-scope guard → route handler.
- `JWT_SECRET` must come from `process.env`; never hard-code or log it.
