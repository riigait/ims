# Inventory Management System (IMS)

A full-stack inventory management web app with multi-department isolation, per-unit asset tracking, multi-line stock movements, a 2D floor-plan editor, barcode scanning, and a unified CSV import/export workflow.

---

## What the app can do

### Authentication & roles
- **Three roles** — `superadmin`, `admin`, `staff`
- **Invite-code registration** — admins issue codes; new users sign up against them
- **Initial setup flow** — the first superadmin login forces a profile + password reset before any other access
- **Password change requests** — staff request password changes; admins approve or reject
- **Forced department context** — `DepartmentGuard` blocks pages until a department (or "All Departments") is selected

### Inventory data model (the "Trinity")
The system tracks inventory at three layers — keep all three in mind when reading the UI:

| Layer | Model | Purpose |
|-------|-------|---------|
| **Master catalog** | `Product` | SKU, name, category, unit, price, threshold, opening stock |
| **Transactions** | `StockMovement` + `StockMovementItem` | Every quantity change — multi-line, with from/to locations per item |
| **Per-unit registry** | `StockDetail` | Individual physical units — asset tag, serial, MAC, barcode, warranty, custodian, condition, status |

### Products
- SKU-based catalog with 31 measurement units (count, weight, volume, length, area, packaging)
- Category, location, supplier, unit price, low-stock threshold, lead-time days, expiry date, status (`active` / `discontinued` / `obsolete` / `on-backorder`), free-form notes
- Search by name, SKU, or location name
- Filter by category, location (including **Unassigned**), stock status, department, unit, date range

### Inventory items (per-unit tracking)
- Auto-generated `STK-` stock IDs and optional custom asset tags
- Identity fields: serial number, MAC ID, barcode, model number, brand, item type
- Lifecycle: condition (`new` / `good` / `fair` / `poor`) and 9 statuses (`active`, `deployed`, `borrowed`, `repair`, `returned`, `damaged`, `lost`, `disposed`, `sold`)
- Warranty expiry + notes, custodian, last-checked date and checker
- Search by stock ID, asset tag, product name, serial, MAC, model, or barcode

### Stock movements
- **12 movement types** — `stock_in`, `stock_out`, `adjustment`, `returned`, `damaged`, `transfer`, `opening_stock`, `deployment`, `repair`, `disposal`, `borrowed`, `lost`
- Auto-generated `MVT-` movement numbers
- **Multi-line movements** — one movement can move many `StockDetail` units, each with its own from/to location and reason
- Each line ties back to a specific `StockDetail`, keeping unit-level history intact

### Categories & locations
- **Categories** scoped per department (unique name within a department)
- **Hierarchical locations** — `Branch → Building → Floor → Room → Rack → Shelf` (free-form types, parent/child tree)
- Cascading delete on parent locations

### Floor plans
- Per-floor-plan canvas with width / height (in units)
- Plan stored as serialised JSON (objects, walls, racks, shelves, labels)
- Linkable to a location so the plan represents a real space
- Editor at `/floor-plans/:id/edit`

### Dashboard
- KPIs — totals for products, stock, inventory items, inventory value, low / out / negative stock, locations, **unassigned-location count**, floor plans
- Item-status breakdown — available, in use, for repair, lost
- Warranty-expiring-soon counter (next 30 days)
- Top categories and top locations (by item count)
- Department-scoped — each card respects the active department filter

### Barcode scanner
- Browser `BarcodeDetector` API (camera) with keyboard-input fallback
- Supports QR, Code 128, Code 39, EAN-13/8, UPC-A/E
- Scans either a product (by SKU/barcode) or a location, then deep-links to the matching record

### CSV import / export / corrector
Unified at `/import-pclsf` with three tabs:
- **Import** — auto-detects file type (Products / Categories / Locations / Floor Plans) from headers
- **Export** — per-type CSV, or one unified file containing all sections with `#IMS_SECTION,<type>` markers
- **Corrector** — re-uploads a previously exported file to repair / re-sync rows

### Departments & assignments
- Departments isolate Products, Categories, Locations, Movements, Floor Plans
- `AdminDepartment` and `StaffDepartment` join tables let users belong to multiple departments
- Department switcher in the top bar — superadmins see all, admins/staff see their assigned set, plus "All Departments" when applicable

### Delete requests
- Staff cannot hard-delete — they file a `DeleteRequest` (product / category / location / floor plan)
- Admins/superadmins approve or reject from `/delete-requests`
- Original entity name and reason are captured for the audit trail

### Audit log
- Backend writes audit records on key actions (CREATE / UPDATE / DELETE, stock movements, login, etc.) with user, entity, JSON change snapshot, IP address
- Exposed via `GET /api/audit-logs` for admins/superadmins

### Superadmin danger zone
- `/admin/settings` — destructive "Delete operational data" action with typed confirmation + 5-second countdown
- Wipes products, categories, locations, movements, stock details, floor plans, requests, invites, audit logs
- **Preserves** users, departments, and department assignments

---

## Tech stack

**Frontend**
- React 18 + TypeScript, Vite
- React Router 6, Zustand, Axios
- Tailwind CSS (dark mode supported via `ThemeContext`)
- Lucide icons
- HTML5 Canvas (floor-plan editor), browser `BarcodeDetector` (scanner)

**Backend**
- Node.js + Express + TypeScript
- Prisma ORM
- **PostgreSQL** (required — schema uses `provider = "postgresql"`)
- JWT auth (`jsonwebtoken`), bcryptjs password hashing
- `csv-parse` + `json2csv` for CSV pipelines

---

## Project layout

```
ims/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── pages/             # 21 route pages (Dashboard, Products, ImportPCLSF, Scanner, ...)
│   │   ├── components/        # Layout, floor-plan canvas, drawers, guards
│   │   ├── services/api.ts    # Axios API clients
│   │   ├── contexts/          # ThemeContext
│   │   ├── types/             # Inventory and filter types
│   │   ├── utils/             # filterHelpers, csv, ids, validation
│   │   └── App.tsx            # Routes + role guards
│   └── vite.config.ts
│
├── backend/                   # Express API
│   ├── src/
│   │   ├── routes/            # 17 route modules
│   │   ├── middleware/        # auth (JWT + role/department resolution)
│   │   ├── utils/             # prisma client, audit logger
│   │   └── index.ts
│   └── prisma/schema.prisma   # All models
│
├── scripts/dev-start.js       # Concurrent frontend + backend launcher
├── start-ims.bat / stop-ims.bat
└── ims-control.ps1            # PowerShell control script
```

---

## Routes

### Public
`/login`, `/register`, `/initial-setup`

### Authenticated + department-scoped
`/dashboard`, `/products`, `/categories`, `/locations`, `/inventory-items`, `/stock-movements`, `/floor-plans`, `/floor-plans/:id/edit`, `/import-pclsf`, `/scanner`

### Authenticated (any role)
`/change-password`

### Admin / superadmin
`/admin/users`, `/admin/departments`, `/admin/assignment`, `/delete-requests`, `/password-requests`

### Superadmin only
`/admin/settings`

---

## API

All `/api/*` routes except `/api/auth/*` and `/api/invites` require `Authorization: Bearer <JWT>`.

| Mount | File | Purpose |
|-------|------|---------|
| `/api/auth` | `auth.ts` | login, register, me, initial setup |
| `/api/invites` | `invites.ts` | create / list invite codes |
| `/api/products` | `products.ts` | CRUD + CSV import/export + opening-stock helpers |
| `/api/categories` | `categories.ts` | CRUD + CSV |
| `/api/locations` | `locations.ts` | hierarchical CRUD + CSV |
| `/api/stock-movements` | `stockMovements.ts` | list + create multi-line movements |
| `/api/stock-details` | `stockDetails.ts` | per-unit inventory CRUD |
| `/api/floor-plans` | `floorPlans.ts` | CRUD + CSV |
| `/api/dashboard` | `dashboard.ts` | KPIs + recent movements |
| `/api/audit-logs` | `auditLogs.ts` | list audit entries |
| `/api/users` | `users.ts` | admin user management |
| `/api/departments` | `departments.ts` | department CRUD |
| `/api/admin-departments` | `adminDepartments.ts` | admin↔department links |
| `/api/staff-departments` | `staffDepartments.ts` | staff↔department links |
| `/api/delete-requests` | `deleteRequests.ts` | approve / reject deletes |
| `/api/password-requests` | `passwordRequests.ts` | approve / reject password changes |
| `/api/settings` | `settings.ts` | superadmin danger-zone actions |

`GET /api/health` returns `{ status: 'ok' }` (unauthenticated).

---

## Quick start

### Prerequisites
- Node.js 18+ and npm 9+
- **PostgreSQL 14+** running locally (or a reachable instance)

### Setup
```bash
# Install dependencies for both apps
npm install

# Configure the backend
cp backend/.env.example backend/.env
# Edit backend/.env:
#   DATABASE_URL=postgresql://<user>:<pass>@localhost:5432/ims
#   JWT_SECRET=<at least 32 random chars>

# Run migrations + generate client
cd backend
npx prisma migrate dev
cd ..

# Start frontend + backend together
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:3001`

### Useful scripts (root `package.json`)
```bash
npm run dev               # both apps via scripts/dev-start.js
npm run frontend:dev      # Vite only
npm run backend:dev       # Express only (ts-node + nodemon)
npm run frontend:build    # production build (tsc + vite build)
npm run backend:build     # tsc compile
npm run backend:db:migrate
npm run backend:db:studio # Prisma Studio
npm run control           # PowerShell control script (Windows)
```

### Windows helpers
- `start-ims.bat` — launches both servers
- `stop-ims.bat` — kills both
- `ims-control.ps1` — PowerShell front-end for the same

---

## First-time login

On first boot the backend ensures a default superadmin exists:

| Field | Value |
|-------|-------|
| Email | `admin@ims.local` |
| Password | `changeme123` |

Logging in with that account triggers `/initial-setup` — set your real name, email, and a new password before anything else is reachable.

After setup:
1. Create departments at `/admin/departments`
2. Generate invite codes at `/admin/users`
3. Assign roles + departments at `/admin/assignment`
4. Build the location tree at `/locations`
5. Add products at `/products` (or bulk-import via `/import-pclsf`)

---

## Configuration

`backend/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/ims
JWT_SECRET=replace-with-32-plus-random-chars
PORT=3001
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
NODE_ENV=development
```

The frontend has no required env vars — it proxies `/api` to `http://localhost:3001` via `vite.config.ts`.

---

## Role / access matrix

| Capability | Superadmin | Admin | Staff |
|------------|:---------:|:-----:|:-----:|
| View all departments | ✓ | per-assignment | per-assignment |
| Manage users | ✓ | ✓ | – |
| Manage departments | ✓ | – | – |
| Assign staff / admins to departments | ✓ | ✓ | – |
| Approve delete & password requests | ✓ | ✓ | – |
| Hard-delete inventory entities | ✓ | ✓ | – (files request) |
| Create / edit products, items, movements | ✓ | ✓ | ✓ (own dept) |
| Floor-plan editor | ✓ | ✓ | ✓ (own dept) |
| CSV import / export / corrector | ✓ | ✓ | ✓ (own dept) |
| Audit log | ✓ | ✓ | – |
| Superadmin settings (danger zone) | ✓ | – | – |

---

## Security notes

- JWT auth with bcrypt-hashed passwords (10 salt rounds)
- Department-scoped queries enforced in middleware (`req.departmentId` / `req.departmentIds`)
- Soft-delete pattern via `DeleteRequest` for staff
- Audit log captures user, entity, JSON change snapshot, IP
- **Never commit `backend/.env`** — use `backend/.env.example`
- Change `admin@ims.local` / `changeme123` immediately on first login
- Use HTTPS in production; rotate `JWT_SECRET` periodically

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Can't reach database server` | PostgreSQL not running, or `DATABASE_URL` is wrong |
| Port 3001 / 5173 already in use | `stop-ims.bat`, or kill the offending process |
| Login redirects to `/initial-setup` repeatedly | The default superadmin hasn't finished setup — complete the form |
| CORS errors | Add the frontend origin to `ALLOWED_ORIGINS` in `backend/.env` |
| Scanner shows "camera not supported" | Browser lacks `BarcodeDetector` — use keyboard mode or Chrome/Edge |
| CSV import says "Unknown type" | Header row doesn't match a known schema — re-export the template |

---

## License

MIT
