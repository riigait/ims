# IMS — Architecture summary

## Folder structure

```
ims/
├── frontend/
│   └── src/
│       ├── pages/          # one file per page/route
│       ├── components/     # shared components (NotificationBell, Sidebar, etc.)
│       ├── services/
│       │   └── api.ts      # all API calls (axios); single source of truth
│       └── context/        # React context (auth, theme)
├── backend/
│   └── src/
│       ├── routes/         # Express routers, one per resource
│       ├── middleware/      # auth, role checks
│       └── prisma/
│           └── schema.prisma
└── .claude/                # Claude memory (this folder)
```

## Key models (Prisma)

| Model | Key fields |
|---|---|
| Product | id, name, categoryId, locationId, departmentId, unit, supplier, quantity |
| StockDetail | id, productId, quantity, locationId, lastCheckedDate, checkedBy |
| StockMovement | id, productId, type, quantity, status (pending/committed/cancelled), notes |
| Location | id, name, floorPlanId, departmentId |
| FloorPlan | id, name, departmentId, objects (JSON) |
| User | id, name, email, role, departmentId |
| Notification | id, userId, type, message, read, snoozedUntil |

## API base

All API calls go to `/api/*` proxied to `http://localhost:3001`.

## Auth flow

1. Login → POST `/api/auth/login` → JWT returned
2. JWT stored in localStorage; sent as `Authorization: Bearer <token>` on every request
3. Backend middleware decodes JWT → attaches `req.userId`, `req.role`, `req.departmentId`

## Important patterns

- Department scoping: staff see only their department's data; admins see all
- Bulk verify: `POST /api/stock-details/bulk-verify` with `{ ids: string[] }`
- Navigation state: `navigate('/products/bulk-add', { state: { locationId } })` passes data between pages
- Snooze: stored in `localStorage` as `ims_notif_snooze_${userId}` (object of `id → expiry timestamp`)
