# Architecture Map

---

## Directory Structure

```
ims/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma         # DB schema (single source of truth)
│   │   └── migrations/           # Prisma migration history
│   └── src/
│       ├── app.ts                # Express app setup (middleware, routes)
│       ├── index.ts              # Entry point — starts the server
│       ├── middleware/
│       │   ├── auth.ts           # JWT verification + department-scope guards
│       │   ├── rateLimiter.ts    # Rate limiting for auth/invite endpoints
│       │   └── requestLogger.ts  # Structured JSON request logging
│       ├── routes/               # One file per resource group
│       └── utils/
│           ├── prisma.ts         # Shared Prisma singleton
│           ├── audit.ts          # Audit-log helpers
│           └── idGenerator.ts    # Custom ID generation
├── frontend/
│   └── src/
│       ├── App.tsx               # Route definitions
│       ├── main.tsx              # Vite entry
│       ├── pages/                # Route-level components
│       ├── components/           # Reusable UI components
│       ├── services/
│       │   └── api.ts            # Axios instance + interceptors
│       ├── types/                # Shared TypeScript interfaces
│       ├── contexts/             # ThemeContext, BellContext
│       └── utils/                # Pure helpers (csv, validation, etc.)
├── scripts/                      # Dev utility scripts
├── .github/                      # CI workflows and issue templates
├── docker-compose.yml            # Local dev Docker setup
├── docker-compose.prod.yml       # Production Docker (pre-built images)
└── .env.example                  # All env vars with section comments
```

## Key File Locations

- **Configuration**: `backend/prisma/schema.prisma`, `.env.example`, `docker-compose.yml`
- **Main entry**: `backend/src/index.ts` (server), `frontend/src/main.tsx` (Vite)
- **Auth guard**: `backend/src/middleware/auth.ts`
- **API client**: `frontend/src/services/api.ts`
- **Tests**: `backend/src/__tests__/`

---

**Last Updated**: 2026-06-07
