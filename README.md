# Inventory Management System (IMS)

Full-stack inventory app for multi-department teams. PostgreSQL-backed, with per-unit asset tracking, multi-line stock movements, an interactive 2D floor-plan editor, a browser barcode scanner, and a unified CSV import/export/corrector workflow.

---

## Screenshots

### Login
![Login screen](docs/screenshots/01-login.png)

### Dashboard
KPIs, stock health, category and location breakdowns, recent movements — all department-scoped.

![Dashboard — full inventory view](docs/screenshots/02-dashboard.png)
![Dashboard — department-filtered view](docs/screenshots/03-dashboard-alt.png)

### Categories
![Categories page](docs/screenshots/04-categories.png)

### Products
SKU catalog with filters (category, location including Unassigned, stock status, unit, date range), search across name / SKU / location.

![Products page](docs/screenshots/05-products.png)

### Locations
Hierarchical location tree (Branch → Building → Floor → Room → Rack → Shelf), per-department.

![Locations page](docs/screenshots/06-locations.png)

### Inventory items (per-unit tracking)
Asset tag, serial number, MAC ID, barcode, model, condition, status, custodian, warranty.

![Inventory Items list](docs/screenshots/07-inventory-items.png)
![Inventory Item detail drawer](docs/screenshots/08-inventory-item-detail.png)

### Stock movements
Multi-line movements — one operation can shift many `StockDetail` units, each with its own from/to location and reason. Twelve movement types.

![Stock Movements list](docs/screenshots/09-stock-movements.png)
![Stock Movement detail drawer](docs/screenshots/10-stock-movement-detail.png)

### Floor plans
Auto-generate a starter layout from the current locations, or build one by hand in the canvas editor.

![Floor Plans — Auto Generate prompt](docs/screenshots/11-floor-plans-auto-generate.png)
![Floor Plans — generated list with thumbnails](docs/screenshots/12-floor-plans-list.png)
![Floor Plan Editor — canvas](docs/screenshots/13-floor-plan-editor.png)
![Floor Plan Editor — object properties panel](docs/screenshots/14-floor-plan-editor-properties.png)

---

## What it does

### Auth and roles
- Three roles — **superadmin**, **admin**, **staff**
- **Invite-code registration** — admins create one-time codes; new users sign up against them
- **Forced initial setup** — the seeded `admin@ims.local` / `changeme123` superadmin must complete a profile + password reset before anything else is reachable
- **Password change requests** — staff can request a reset; admins approve/reject
- **Department guard** — every data page is blocked until a department (or "All Departments") is selected via the top-bar switcher (uses the `X-Department-Id` header)

### Inventory data model (the "trinity")
Three layers track inventory. Read everything in the UI through this lens:

| Layer | Model | What it stores |
|-------|-------|----------------|
| Master catalog | `Product` | SKU, name, category, unit, price, low-stock threshold, opening stock |
| Transactions | `StockMovement` + `StockMovementItem` | Every quantity change. Multi-line, with from/to locations per line item |
| Per-unit registry | `StockDetail` | Individual physical units — asset tag, serial, MAC, barcode, warranty, custodian, condition, status |

### Products
- SKU catalog with 31 measurement units (count / weight / volume / length / area / packaging)
- Category, location, supplier, unit price, low-stock threshold, lead-time days, expiry date, status (`active` / `discontinued` / `obsolete` / `on-backorder`), notes
- Search by name, SKU, or location name
- Filter by category, location (including **Unassigned**), stock status, department, unit, date range
- Location column on the table; the dashboard "Unassigned Location" card deep-links here with the filter pre-applied

### Inventory items (per-unit tracking)
- Auto `STK-` stock IDs + optional custom asset tags
- Identity: serial number, MAC ID, barcode, model number, brand, item type
- Lifecycle: condition (`new` / `good` / `fair` / `poor`) and 9 statuses (`active`, `deployed`, `borrowed`, `repair`, `returned`, `damaged`, `lost`, `disposed`, `sold`)
- Warranty expiry + notes, custodian, last-checked date and checker
- Search by stock ID, asset tag, product name, serial, MAC, model, or barcode

### Stock movements
- **12 movement types** — `stock_in`, `stock_out`, `adjustment`, `returned`, `damaged`, `transfer`, `opening_stock`, `deployment`, `repair`, `disposal`, `borrowed`, `lost`
- Auto `MVT-` movement numbers
- Multi-line: one movement can shift many `StockDetail` units, each with its own from/to location and reason
- Each line references the specific `StockDetail` so unit-level history stays intact

### Categories and locations
- Categories scoped per department (unique name within a department)
- Locations form a free-form hierarchy: `Branch → Building → Floor → Room → Rack → Shelf`. Children cascade-delete with parents

### Floor plans
- Per-plan canvas with width / height in units
- Plan stored as serialised JSON (walls, racks, shelves, labels, etc.)
- Editor at `/floor-plans/:id/edit`; thumbnails on the list page
- Linkable to a real location so the plan represents an actual space

### Dashboard
- KPIs — products, total stock, inventory items, inventory value, low / out / negative / good stock, total locations, **unassigned-location count**, floor plans
- Item-status breakdown — available, in use, for repair, lost
- Warranty expiring in the next 30 days
- Top categories and top locations by item count
- All metrics respect the current department filter

### Barcode scanner (`/scanner`)
- Browser `BarcodeDetector` for camera scanning, with keyboard fallback
- Formats — QR, Code 128, Code 39, EAN-13/8, UPC-A/E
- Targets a product (by SKU/barcode) or a location; deep-links to the match

### Unified CSV pipeline (`/import-pclsf`)
Three tabs in one page:
- **Import** — auto-detects file type (Products / Categories / Locations / Floor Plans) from headers
- **Export** — per-type CSV, or one unified file with `#IMS_SECTION,<type>` section markers
- **Corrector** — re-uploads an export to repair/re-sync rows
- Offline companion: `scripts/csv-corrector/csv_corrector.py` — drop any CSV in that folder, run `python csv_corrector.py`, get a `corrected-XXXXX-YYYYMMDD-HHMMSS.csv` back (no dependencies)

### Departments and assignments
- Department-scoped data for Products, Categories, Locations, Movements, Floor Plans
- `AdminDepartment` and `StaffDepartment` join tables let users belong to multiple departments
- Top-bar **DepartmentSwitcher** — superadmins see all, admins/staff see their assigned set plus "All Departments" where applicable

### Delete requests
- Staff cannot hard-delete; they file a `DeleteRequest` (product / category / location / floor plan)
- Admins/superadmins approve or reject at `/delete-requests`
- The original entity name and reason are captured for the audit trail

### Audit log
- Backend writes audit records on key actions (CREATE / UPDATE / DELETE, stock movements, login, etc.) with user, entity, JSON change snapshot, IP
- Exposed at `GET /api/audit-logs` to admins/superadmins

### Superadmin danger zone (`/admin/settings`)
- One destructive button: "Delete operational data" with typed confirmation phrase + 5-second countdown
- Wipes products, categories, locations, movements, stock details, floor plans, requests, invites, audit logs
- **Preserves** users, departments, and department assignments

---

## Tech stack

**Frontend**
- React 18 + TypeScript on Vite
- React Router 6, Zustand, Axios
- Tailwind CSS with dark mode via `ThemeContext`
- Lucide icons
- HTML5 Canvas for the floor-plan editor; browser `BarcodeDetector` for the scanner
- React `ErrorBoundary` wraps the entire app

**Backend**
- Node.js + Express + TypeScript
- Prisma ORM
- **PostgreSQL** (schema is `provider = "postgresql"` — no other DB supported)
- `jsonwebtoken` (JWT auth) + `bcryptjs` password hashing
- `csv-parse` + `json2csv` for the CSV pipeline
- `nodemon` + `ts-node` for dev

**Infra / tooling**
- `docker-compose.yml` provisions a `postgres:16-alpine` container (`ims_postgres`)
- `scripts/dev-start.js` orchestrates: checks Docker → starts the DB → waits for `pg_isready` → runs both apps via `concurrently`
- `ims-control.ps1` — PowerShell control script (`start | stop | restart | status`) for ports 3001 / 5173 and the Docker container
- `setup.bat` / `setup.sh` — install dependencies + run initial migration
- Python `scripts/csv-corrector/csv_corrector.py` — offline CSV-to-IMS-format normaliser (no dependencies)

---

## Project layout

```
ims/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── pages/             # 21 route pages
│   │   ├── components/        # Layout, Sidebar, DepartmentSwitcher,
│   │   │                      # DepartmentGuard, DataPageLayout,
│   │   │                      # ConfirmDialog, Pagination, CSVControls,
│   │   │                      # StockDetails, ErrorBoundary, floorplan/
│   │   ├── services/api.ts    # All Axios API clients
│   │   ├── services/floorPlanStore.ts  # Zustand store for the editor
│   │   ├── contexts/          # ThemeContext (light/dark)
│   │   ├── types/             # inventory, filters, floorplan
│   │   ├── utils/             # filterHelpers, csv, ids, validation
│   │   ├── constants/app.ts   # ALL_DEPARTMENTS_ID, etc.
│   │   └── App.tsx            # Routes + role guards
│   └── vite.config.ts         # Dev server proxies /api → :3001
│
├── backend/                   # Express API
│   ├── src/
│   │   ├── routes/            # 17 route modules
│   │   ├── middleware/auth.ts # JWT + role + department header resolution
│   │   ├── utils/             # prisma, audit, csv, idGenerator
│   │   └── index.ts
│   ├── prisma/schema.prisma   # All models
│   └── .env.example
│
├── scripts/
│   ├── dev-start.js           # Docker + concurrently launcher
│   └── csv-corrector/
│       ├── csv_corrector.py   # Offline CSV normaliser (no deps)
│       └── format.csv         # Reference format
│
├── docker-compose.yml         # ims_postgres (postgres:16-alpine)
├── ims-control.ps1            # PowerShell control script
├── setup.bat / setup.sh       # One-shot install + migrate
└── package.json               # Root scripts (dev, build, db, etc.)
```

---

## Routes

### Public
`/login`, `/register`, `/initial-setup`

### Authenticated and department-scoped
`/dashboard`, `/products`, `/categories`, `/locations`, `/inventory-items`, `/stock-movements`, `/floor-plans`, `/floor-plans/:id/edit`, `/import-pclsf`, `/scanner`

### Authenticated (any role)
`/change-password`

### Admin / superadmin only
`/admin/users`, `/admin/departments`, `/admin/assignment`, `/delete-requests`, `/password-requests`

### Superadmin only
`/admin/settings`

---

## API surface

All `/api/*` routes except `/api/auth/*` and `/api/invites` require `Authorization: Bearer <JWT>`. Admin/staff requests also send `X-Department-Id: <id | 'all-departments'>` so the backend can scope queries.

| Mount | File | Purpose |
|-------|------|---------|
| `/api/auth` | `auth.ts` | login, register, me, initial setup, change/reset password, ensure-superadmin |
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
| `/api/admin-departments` | `adminDepartments.ts` | admin ↔ department links |
| `/api/staff-departments` | `staffDepartments.ts` | staff ↔ department links |
| `/api/delete-requests` | `deleteRequests.ts` | approve / reject staff deletes |
| `/api/password-requests` | `passwordRequests.ts` | approve / reject password changes |
| `/api/settings` | `settings.ts` | superadmin danger-zone wipe |

`GET /api/health` — unauthenticated `{ status: 'ok' }`.

---

## Quick start

### Prerequisites
- Node.js 18+ and npm 9+
- **Docker Desktop** (recommended — `docker-compose.yml` boots PostgreSQL for you)
- Or your own PostgreSQL 14+ reachable at the URL in `backend/.env`

### Setup
```bash
# Install dependencies for both apps
npm install

# Configure the backend
cp backend/.env.example backend/.env
# Edit JWT_SECRET to a strong random string

# Run migrations (Docker DB must be up: docker-compose up -d)
cd backend
npx prisma migrate dev
cd ..

# Start everything together (handles Docker + both apps)
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend:  <http://localhost:3001>
- Postgres: `localhost:5432` (db `ims_db`, user `ims_user`)

### Root scripts (`package.json`)
| Script | Does |
|--------|------|
| `npm run dev` | `scripts/dev-start.js` — Docker check → DB up → both apps via `concurrently` |
| `npm run frontend:dev` | Vite only |
| `npm run backend:dev` | Express only (`ts-node` + `nodemon`) |
| `npm run frontend:build` | `tsc && vite build` |
| `npm run backend:build` | `tsc` compile |
| `npm run backend:db:migrate` | `prisma migrate dev` |
| `npm run backend:db:studio` | Prisma Studio UI |
| `npm run control` | PowerShell control script (`start | stop | restart | status`) |
| `setup.bat` / `setup.sh` | One-shot dependency install + initial migrate |

---

## First-time login

The backend ensures a default superadmin exists on first boot:

| Field | Value |
|-------|-------|
| Email | `admin@ims.local` |
| Password | `changeme123` |

Logging in with that account redirects to `/initial-setup` — set your real name, email, and a new password before anything else opens.

After setup:
1. Create departments at `/admin/departments`
2. Generate invite codes at `/admin/users`
3. Link roles + departments at `/admin/assignment`
4. Build the location tree at `/locations`
5. Add products at `/products` (or bulk-import via `/import-pclsf`)

---

## Configuration

`backend/.env`:
```env
DATABASE_URL="postgresql://ims_user:ims_password_secure@localhost:5432/ims_db"
JWT_SECRET="change-this-to-a-strong-random-secret"
NODE_ENV="development"
PORT=3001
# Comma-separated origins for CORS (production)
# ALLOWED_ORIGINS="https://yourdomain.com,https://app.yourdomain.com"
```

The frontend needs no env vars — `vite.config.ts` proxies `/api` to `http://localhost:3001` in dev.

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
| Superadmin danger zone | ✓ | – | – |

---

## Security notes

- JWT auth + bcrypt (10 salt rounds)
- Department scoping enforced in `backend/src/middleware/auth.ts` via `req.departmentId` / `req.departmentIds`
- Soft-delete pattern via `DeleteRequest` for staff
- Audit log captures user, entity, JSON change snapshot, IP
- Never commit `backend/.env` — use `backend/.env.example`
- Change `admin@ims.local` / `changeme123` immediately on first login
- Use HTTPS in production; rotate `JWT_SECRET` periodically

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `Can't reach database server` | PostgreSQL isn't running — `docker-compose up -d`, then check `DATABASE_URL` |
| `npm run dev` says Docker is not running | Start Docker Desktop, retry |
| Port 3001 / 5173 in use | `npm run control` then `stop`, or kill the offending process |
| Login keeps redirecting to `/initial-setup` | The default superadmin hasn't finished setup — complete the form |
| CORS errors | Add the frontend origin to `ALLOWED_ORIGINS` in `backend/.env` |
| Scanner says "camera not supported" | Browser lacks `BarcodeDetector` — use keyboard mode, or Chrome/Edge |
| CSV import says "Unknown type" | Header row doesn't match a known schema — re-export the template, or run it through `scripts/csv-corrector/csv_corrector.py` first |

---

## License

MIT
