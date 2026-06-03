---
paths:
  - "backend/src/**/*.ts"
---

# Backend rules

- Stack: Node.js + Express + Prisma ORM + PostgreSQL.
- All routes use `AuthRequest` (extends Express `Request`) for `req.userId` and `req.departmentId`.
- Department-scoped queries: filter by `req.departmentIds` (array) or `req.departmentId` (single).
- New routes must be registered in the appropriate router file and mounted in `app.ts`.
- Validate request input at the route boundary before touching the database.
- Use `prisma.$transaction` for multi-step writes that must be atomic.
- Do not expose raw Prisma errors to the client — wrap in a clean error envelope.
