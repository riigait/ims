# IMS — App overview

IMS (Inventory Management System) is an internal web application for managing physical inventory across departments, locations, and warehouses.

## Key features

- **Products** — product catalog with categories, units, suppliers, and stock levels
- **Inventory Items** (Stock Details) — individual stock entries per product/location with audit trail (`lastCheckedDate`, `checkedBy`)
- **Stock Movements** — track incoming/outgoing stock; statuses: `pending` (unconfirmed), `committed` (confirmed), `cancelled`
- **Locations** — physical storage locations (shelves, rooms, warehouses) linked to floor plans
- **Floor Plans** — visual layout of departments with location mapping
- **Notifications** — bell alerts for low stock, unverified items; per-user snooze (7 days, localStorage)
- **Bulk Add Products** — batch product creation with default location/category pre-fill (supports navigation state from Locations drawer)
- **User Management** — admin manages users, roles, invite codes, password reset requests
- **Requests** — import requests and password reset requests with approval workflow

## User roles

- `admin` — full access; can confirm stock movements, manage users, approve requests
- `staff` — department-scoped access; can view and update their own department's inventory

## Tech stack

- Frontend: React 18 + TypeScript + Vite + TailwindCSS (port 5173)
- Backend: Node.js + Express + Prisma + PostgreSQL (port 3001)
- Auth: JWT stored in localStorage; role + departmentId encoded in token
