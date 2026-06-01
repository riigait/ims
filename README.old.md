# Inventory Management System

An open-source Inventory Management System built for IT asset tracking, office equipment inventory, and multi-department stock management.

This app is currently under active development. You can use it, test it, and contribute to it, but some features may still change or contain bugs. Please report any issues through GitHub Issues.

---

## About the Project

Inventory Management System is designed to help companies, offices, IT departments, and government organizations manage assets and inventory records in a structured way.

It can be used for tracking:

- IT equipment and network devices
- Office supplies and equipment
- Stock movements and transactions
- Department-assigned assets
- Locations and storage areas
- Product categories
- Individual inventory item details
- Visual floor plan layouts

The goal of this project is to provide a practical, open-source inventory platform that can be improved and customized based on real operational needs.

---

## Main Features

- Product management with SKU, category, location, stock levels, unit, pricing, expiry, and supplier fields
- Individual inventory item tracking with status and condition per unit
- Hierarchical location management (branch → building → floor → room → rack → shelf)
- Stock movement logging with 12+ movement types (stock in/out, transfer, adjustment, deployment, repair, disposal, borrowed, lost, and more)
- Interactive floor plan editor with wall drawing, door/window placement, and inventory markers
- CSV import and export for products, categories, locations, and floor plans
- Built-in CSV corrector tool for fixing malformed import files
- Barcode and QR code scanner (camera or keyboard input)
- Three-tier role system: superadmin, admin, and staff
- Department-based access control and data isolation
- Request workflows for delete requests, password changes, and CSV import approvals
- Invite-based user registration with role assignment
- Audit log for tracking all changes by entity and user
- Dashboard with inventory statistics, stock status, and low-stock alerts
- Dark and light theme support

---

## Pages

| Page | Description |
|---|---|
| Login | User authentication |
| Register | Invite-based registration |
| Initial Setup | First-time system setup wizard (superadmin only) |
| Dashboard | Inventory stats, stock status overview, recent activity |
| Products | Full product CRUD with filters, sorting, and stock management |
| Categories | Product category management per department |
| Locations | Hierarchical location CRUD |
| Inventory Items | Per-unit item tracking with status, condition, and movement history |
| Stock Movements | Transaction log for all stock in/out/transfer/adjustment events |
| Floor Plans | Visual floor plan list and management |
| Floor Plan Editor | Interactive canvas editor for drawing layouts and placing inventory markers |
| Import / Export | CSV import and export for all core data types, plus CSV corrector tool |
| Requests | Import request tracking with auto-approval after 30 days |
| Scanner | Camera and keyboard barcode/QR scanner for products and locations |
| Admin Users | User management, invite code generation, role assignment |
| Admin Departments | Department CRUD |
| Admin Assignment | Assign admins to departments |
| Delete Requests | Review and approve delete requests submitted by staff |
| Password Requests | Review and approve password change requests from staff |
| Change Password | User password change with reason field for staff |
| Superadmin Settings | Dangerous operations: full database wipe with confirmation (superadmin only) |

---

## User Roles

| Role | Access |
|---|---|
| **Superadmin** | Full system access, initial setup, all departments, database management, user and department creation |
| **Admin** | Department-scoped access, manage staff, approve delete and password requests, view audit logs |
| **Staff** | Read and limited write access to assigned department, submit delete and password requests via approval workflow |

---

## Tech Stack

- **Frontend:** React 18, TypeScript, Vite 5, Tailwind CSS 3, Zustand, React Router 6, Axios, Lucide React
- **Backend:** Node.js, Express 4, TypeScript
- **ORM:** Prisma 5
- **Database:** PostgreSQL
- **Authentication:** JWT with role-based access control
- **CSV:** csv-parse (import), json2csv (export)
- **API:** REST

---

## Project Structure

```
ims/
├── backend/
│   ├── src/
│   │   ├── index.ts          Express server entry
│   │   ├── middleware/        JWT auth and role middleware
│   │   ├── routes/            18 route handlers
│   │   └── utils/             Prisma client, CSV utilities, audit logging, ID generation
│   └── prisma/
│       ├── schema.prisma      Database schema (15+ models)
│       └── seed.ts            Database seed script
├── frontend/
│   └── src/
│       ├── pages/             22 page components
│       ├── components/        Layout, floor plan, inventory UI components
│       ├── services/          Axios API client, Zustand stores
│       ├── types/             TypeScript interfaces
│       ├── utils/             Filters, validation, CSV helpers, ID generation
│       ├── contexts/          Theme context (dark/light mode)
│       └── hooks/             Custom React hooks
├── csv-corrector/             Standalone CSV validation and correction tool
├── docs/screenshots/          UI documentation images
├── templates/                 Floor plan templates
├── docker-compose.yml
└── README.md
```

---

## Installation

Clone the repository:

```bash
git clone <your-repository-url>
cd <repository-folder>
```

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Update `.env` with your PostgreSQL connection string and JWT secret:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/ims"
JWT_SECRET="your-jwt-secret-here"
PORT=3001
```

Run database migrations:

```bash
npx prisma generate
npx prisma migrate dev
```

Start the backend:

```bash
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and the backend on `http://localhost:3001` by default.

---

## Docker

A `docker-compose.yml` is included for running the full stack with Docker:

```bash
docker-compose up
```

---

## Environment Files

Use `.env.example` as the template. Never commit `.env`.

```env
DATABASE_URL="postgresql://user:password@localhost:5432/ims"
JWT_SECRET="your-jwt-secret-here"
PORT=3001
```

`.gitignore` should include:

```
.env
.env.local
node_modules
dist
build
```

---

## Security Notice

This repository should only contain safe public information.

Do not commit or expose:

- `.env` files
- API keys
- Database passwords
- JWT secrets
- Admin credentials
- Private server IP addresses
- Internal-only URLs
- Cloud access tokens
- Personal user data
- Production database dumps
- Real confidential inventory records

---

## Use Cases

- IT asset tracking
- Office equipment inventory
- Government office inventory
- Company stock management
- Multi-department asset monitoring
- Equipment assignment and deployment tracking
- Basic warehouse or storage room inventory

---

## Contributing

Contributions are welcome.

You can help by:

- Reporting bugs
- Suggesting improvements
- Improving documentation
- Fixing UI issues
- Improving backend logic
- Adding tests
- Improving security
- Refactoring code safely

Before submitting changes, make sure your code does not expose secrets, private data, or environment-specific configuration.

---

## Bug Reports

When reporting bugs, please include:

- What page or feature has the issue
- Steps to reproduce the problem
- Expected result
- Actual result
- Screenshot if helpful
- Browser or environment used

Do not include passwords, tokens, private URLs, or real confidential data in bug reports.

---

## License

This project is open source. Add your selected license here (e.g., MIT License).

---

## Disclaimer

This software is provided as-is while under active development. Review the code before production deployment and configure your own security settings properly.
