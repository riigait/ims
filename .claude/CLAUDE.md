# IMS — Project memory

## App overview

IMS (Inventory Management System) is an internal web app for managing physical inventory across departments, locations, and warehouses.

**Key features:**

- Products — catalog with categories, units, suppliers, stock levels
- Inventory Items (StockDetail) — per-product/location entries with audit trail (`lastCheckedDate`, `checkedBy`)
- Stock Movements — incoming/outgoing stock; statuses: `pending` (unconfirmed), `committed` (confirmed), `cancelled`
- Locations — physical storage linked to floor plans
- Floor Plans — visual department layouts
- Notifications — bell alerts for low stock / unverified items; per-user snooze 7 days (localStorage key: `ims_notif_snooze_${userId}`)
- Bulk Add Products — batch creation with default location/category; accepts navigation state `{ locationId }`
- User Management — admin manages users, roles, invite codes, password reset requests
- Requests — import requests and password reset requests with approval workflow

**User roles:**

- `admin` — full access; can confirm stock movements, manage users, approve requests
- `staff` — department-scoped; sees only their department's data

**Tech stack:**

- Frontend: React 18 + TypeScript + Vite + TailwindCSS (port 5173)
- Backend: Node.js + Express + Prisma + PostgreSQL (port 3001)
- Auth: JWT in localStorage; role + departmentId in token

---

## Architecture

**Folder structure:**

```text
ims/
├── frontend/src/
│   ├── pages/          # one file per route
│   ├── components/     # shared (NotificationBell, Sidebar, Pagination…)
│   ├── services/api.ts # ALL API calls — single source of truth
│   └── context/        # React context (auth, theme)
├── backend/src/
│   ├── routes/         # Express routers, one per resource
│   ├── middleware/      # auth, role checks
│   └── prisma/schema.prisma
└── .claude/            # Claude memory (this folder)
```

**Key Prisma models:**

- `Product` — id, name, categoryId, locationId, departmentId, unit, supplier, quantity
- `StockDetail` — id, productId, quantity, locationId, lastCheckedDate, checkedBy
- `StockMovement` — id, productId, type, quantity, status, notes
- `Location` — id, name, floorPlanId, departmentId
- `User` — id, name, email, role, departmentId

**Auth flow:** POST `/api/auth/login` → JWT → `Authorization: Bearer <token>` on every request → middleware sets `req.userId`, `req.role`, `req.departmentId`

**Important patterns:**

- Department scoping: staff filtered by `req.departmentIds` / `req.departmentId`; admins see all
- Bulk verify: `POST /api/stock-details/bulk-verify` with `{ ids: string[] }`
- Navigation state between pages: `navigate('/products/bulk-add', { state: { locationId } })`
- Table alignment standard: text/names = left, numbers = right, status/badges/actions = center
- Header columns must use same flex+grid+spacer structure as data rows (accounts for ChevronRight icon width)
- Stock movement display labels: `pending` → "Unconfirmed", `committed` → "Confirmed" (DB values unchanged)

---

## Rules

Full rules live in `.claude/rules/`:

- `core.md` — always-on project rules
- `frontend.md` — loaded when editing `frontend/src/**`
- `backend.md` — loaded when editing `backend/src/**`

## Recommendations

Approved decisions live in `.claude/context/recommendations/`.

## Skills

Reusable workflows live in `.claude/skills/`.
