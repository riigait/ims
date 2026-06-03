# Architecture summary

## Repository layout
```
ims/
├── backend/
│   └── src/
│       ├── index.ts          # Express app entry; registers all routes
│       ├── middleware/
│       │   └── auth.ts       # JWT verification + department-scope guards
│       ├── routes/           # One file per resource group
│       └── utils/
│           ├── prisma.ts     # Shared Prisma singleton
│           ├── audit.ts      # Audit-log helpers
│           └── idGenerator.ts
└── frontend/
    └── src/
        ├── App.tsx
        ├── main.tsx
        ├── pages/            # Route-level components
        ├── components/       # Reusable UI
        ├── services/
        │   └── api.ts        # Axios instance + interceptors
        ├── types/            # Shared TypeScript interfaces
        ├── contexts/         # ThemeContext, BellContext
        └── utils/            # Pure helpers (csv, validation, etc.)
```

## Runtime stack
| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Backend | Node.js, Express, TypeScript |
| ORM | Prisma |
| Auth | JWT (Bearer token in `Authorization` header) |
| Dev ports | Frontend: 5173 · Backend: 3001 |

## Key boundaries
- Frontend only calls backend via the axios instance in `services/api.ts`.
- Backend never reads `.env` values at the route layer — only through `process.env` in middleware/utils.
- Prisma client is a singleton; never instantiated outside `utils/prisma.ts`.
- Department isolation is enforced server-side by `requireDepartmentScopedWriteAccess` middleware; the frontend header is untrusted input.

## Auth flow
1. Login → `POST /api/auth/login` → returns JWT.
2. Token stored in `localStorage`; injected as `Authorization: Bearer <token>` by axios interceptor.
3. `X-Department-Id` header added to all non-auth requests by the same interceptor.
4. `authMiddleware` verifies JWT and attaches `userId`, `userRole`, `departmentId` to `req`.
