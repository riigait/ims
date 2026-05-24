# Inventory Management System (IMS) - Phase 2

A full-stack Web App/PWA for inventory management with **role-based private dashboards**, interactive 2D floor plan builder, and multi-department support.

## Core Features

### 🔐 Authentication & Role Management
- **Three user roles**: Superadmin, Admin, Staff
- **Role-based access control** - Different views and permissions per role
- **Multi-department assignments** - Users can be assigned to multiple departments
- **Invite-based registration** - Admins invite users with invite codes
- **Password management** - Secure password changes and reset requests
- **Initial setup** - Secure one-time setup for default superadmin account

### 📊 Dashboard & Analytics
- **Role-specific dashboards** - Each role sees only relevant data
- **Department-filtered views** - Data isolation per department
- **Real-time statistics** - Product count, stock status, recent movements
- **Stock alerts** - Low stock warnings for quick action

### 📦 Inventory Management
- **Product Management** - Create, edit, delete products with SKU tracking
- **31 Measurement Units** - Pieces, weights (g/kg/oz/lb/ton), volumes (ml/L/gal/cup), lengths (mm/cm/m/km/inch/ft/yard), areas (cm²/m²), and others
- **Category Organization** - Hierarchical product categorization per department
- **Stock Tracking** - Real-time inventory levels with audit trail
- **Low Stock Alerts** - Automatic notifications for items below threshold

### 📍 Location & Floor Plan Management
- **Hierarchical Locations** - Branch → Building → Floor → Room → Rack → Shelf
- **Interactive 2D Floor Plan Editor** - Drag-and-drop warehouse layout builder
- **Canvas Drawing Tools** - Walls, rooms, racks, shelves, labels, and text
- **Location Linking** - Link inventory to physical floor plan locations

### 📤 Stock Movement Tracking
- **Movement Types** - Stock in, stock out, adjustment, transfer, damaged, returned
- **Audit Trail** - Complete history of all inventory changes
- **User Tracking** - Records who made each movement and when
- **Reason Documentation** - Record why stock was moved

### 🏢 Department Management
- **Multi-department support** - Isolated data per department
- **Admin assignments** - Admins manage department access
- **Staff assignments** - Staff can be assigned to one or more departments
- **Department switching** - Easy switching between assigned departments

### 🗑️ Request & Approval System
- **Delete Requests** - Staff request deletions, admins approve/reject
- **Password Change Requests** - Secure password change workflow
- **Audit trail** - All requests logged with timestamps

## Tech Stack

### Frontend
- **React 18** + **TypeScript** - Modern UI framework with type safety
- **Vite** - Lightning-fast build tool and dev server
- **Tailwind CSS** - Utility-first styling with dark mode support
- **Zustand** - Lightweight state management
- **Axios** - HTTP client with interceptors
- **React Router** - Client-side routing with protected routes
- **Canvas API** - 2D drawing for floor plans
- **PWA Support** - Service workers for offline capability

### Backend
- **Node.js 18+** + **Express** + **TypeScript** - Robust API server
- **Prisma ORM** - Type-safe database access
- **SQLite** (dev) / **PostgreSQL** (production) - Flexible database options
- **JWT** - Stateless authentication tokens
- **bcryptjs** - Password hashing with salt rounds
- **CORS** - Cross-origin request handling
- **nodemon** - Auto-reload during development

## Project Structure

```
ims/
├── frontend/                    # React Vite SPA
│   ├── src/
│   │   ├── pages/              # Route pages (Dashboard, Products, etc.)
│   │   ├── components/         # Reusable UI components
│   │   │   ├── layout/         # Layout wrappers (Sidebar, Layout)
│   │   │   └── floorplan/      # Floor plan editor components
│   │   ├── services/           # API clients (api.ts, stores)
│   │   ├── contexts/           # React contexts (ThemeContext)
│   │   ├── types/              # TypeScript interfaces
│   │   ├── utils/              # Helpers (validation, filters, IDs)
│   │   ├── constants/          # App constants
│   │   ├── App.tsx             # Route definitions
│   │   └── main.tsx            # Entry point
│   ├── public/icons/           # Static assets
│   ├── index.html              # HTML template
│   ├── vite.config.ts          # Vite configuration
│   ├── tailwind.config.js      # Tailwind theming
│   └── package.json
│
├── backend/                     # Express API server
│   ├── src/
│   │   ├── routes/             # API endpoints (products, users, auth, etc.)
│   │   ├── middleware/         # Auth & error handling
│   │   ├── utils/              # Utilities (audit logging)
│   │   └── index.ts            # Server entry point
│   ├── prisma/
│   │   └── schema.prisma       # Database schema & models
│   ├── .env.example            # Environment template
│   ├── tsconfig.json           # TypeScript config
│   └── package.json
│
├── scripts/                     # Utility scripts (CSV import, DB setup, etc.)
├── .env                        # Environment variables (JWT_SECRET, DATABASE_URL)
├── start-ims.bat               # Windows: Start both frontend & backend
├── stop-ims.bat                # Windows: Kill frontend & backend processes
├── setup.bat                   # Windows: Initial setup (install deps, migrate DB)
└── README.md
```

## Architecture Overview

### Data Flow
```
User → Frontend (React) → API (Express) → Database (SQLite/PostgreSQL)
                                          ↓
                                     Audit Logs
```

### Authentication Flow
1. User logs in with email/password
2. Backend validates credentials, issues JWT token
3. Frontend stores token in localStorage
4. Every API request includes `Authorization: Bearer <token>`
5. Backend validates token via auth middleware
6. Protected routes require valid token + proper role

### Department Isolation
- Every entity (Product, Category, Location, etc.) has optional `departmentId`
- Admin queries filter by department when selected
- Staff users see only assigned departments
- Dashboard stats are department-specific

### Role-Based Access (Phase 2)
| Feature | Superadmin | Admin | Staff |
|---------|----------|-------|-------|
| View all departments | ✓ | ✓ (filter) | ✗ |
| Manage users | ✓ | ✓ | ✗ |
| Manage departments | ✓ | ✗ | ✗ |
| View audit logs | ✓ | ✓ | ✗ |
| Approve delete requests | ✓ | ✓ | ✗ |
| Manage staff assignments | ✓ | ✓ | ✗ |
| Create/edit inventory | ✓ | ✓ | ✓ (dept only) |
| View inventory | ✓ | ✓ | ✓ (dept only) |
| Stock movements | ✓ | ✓ | ✓ (dept only) |

## Quick Start

### Prerequisites
- **Node.js 18+** - Runtime
- **npm 9+** - Package manager
- **SQLite** - Included with Node (local dev only)
- **PostgreSQL 14+** - Optional, for production

### Database Strategy

| Scenario | Database | Setup |
|----------|----------|-------|
| **Local development** | SQLite | Zero setup — `.db` file auto-created |
| **Staging/Production** | PostgreSQL | Install PostgreSQL, set `DATABASE_URL` |

### Installation & Setup

**Option 1: Automated Setup (Windows)**
```batch
# From project root
setup.bat
```

**Option 2: Manual Setup**
```bash
# Install all dependencies
npm install

# Setup database
cd backend
npx prisma migrate dev --name init
cd ..

# Start the app
npm run dev
```

Frontend will be at `http://localhost:5174` (or next available port)
Backend API at `http://localhost:3001`

### Initial Login

The backend creates a default superadmin on first startup:

| Field | Value |
|-------|-------|
| Email | `admin@ims.local` |
| Password | `changeme123` |

**⚠️ Critical**: Change these credentials immediately on first login by completing the **Initial Setup** workflow. The app will automatically redirect you to it.

## First-Time Setup Workflow

When you first login with the default `admin@ims.local` account, the system will:

1. **Detect incomplete setup** - Redirect you to `/initial-setup`
2. **Update your profile**:
   - Change your name
   - Set your permanent email address
   - Create a strong password (min 8 chars)
3. **Secure the default account** - The default credentials become invalid
4. **Redirect to dashboard** - You're now the superadmin with full access

This is a **one-time workflow**. Future logins use your new credentials.

### Next Steps After Setup
1. **Create departments** - `/admin/departments` - Organize your organization
2. **Invite team members** - Generate invite codes and send to staff
3. **Assign roles & departments** - `/admin/assignment` - Link users to departments
4. **Configure locations** - `/locations` - Set up your facility hierarchy
5. **Add products** - `/products` - Start managing inventory

## Usage Guide

### 🏠 Dashboard
- **Overview statistics**: Total products, stock status, recent movements
- **Department-specific data**: Auto-filtered based on selected department
- **Quick stats**: Visual indicators for low-stock items, incoming/outgoing movements
- **Role-based view**: Superadmin sees all depts, admins see assigned, staff see theirs

### 🔄 Department Switcher
Located in the **top navigation bar**:

- **Superadmin**: Switch between all departments or "All Departments" view
- **Admin**: Switch between assigned departments
- **Staff (single-dept)**: Shows fixed department name (read-only)
- **Staff (multi-dept)**: Dropdown to pick one assigned department or "All Departments"

Changes apply instantly across all pages (Dashboard → Products → Locations, etc.)

### 📦 Product Management

#### Measurement Units (31 types)
| Category | Units |
|----------|-------|
| **Count** | pcs, dozen, box, pack |
| **Weight** | g, kg, mg, oz, lb, ton |
| **Volume** | ml, liter, gallon, cup |
| **Length** | mm, cm, m, km, inch, ft, yard |
| **Area** | cm², m² |
| **Other** | roll, sheet, can, bottle, bag, carton |

#### Workflow
1. Go to `/products`
2. Click **New Product**
3. Fill in:
   - **SKU** - Unique identifier
   - **Name** - Product name
   - **Category** - Assign to a category (create if needed)
   - **Unit** - Select measurement type
   - **Low Stock Threshold** - Alert level
4. **Save** - Product created with 0 stock
5. **Record movements** - Use `/stock-movements` to adjust stock

**Bulk Import**: Use the CSV import script in `backend/scripts/` (for initial setup)

### 📂 Categories & Locations

#### Categories
- Department-specific organization
- Create at `/categories` - Each dept has its own categories
- Products sorted by category on `/products`

#### Locations (Hierarchical Tree)
```
Branch
 ├─ Building
 │   ├─ Floor
 │   │   ├─ Room
 │   │   │   ├─ Rack
 │   │   │   │   ├─ Shelf
```
Manage at `/locations` - Create the structure that matches your facility

### 📊 Stock Movements

Record inventory changes:

| Type | Use Case | Impact |
|------|----------|--------|
| **stock_in** | Received goods | ⬆️ Increases stock |
| **stock_out** | Sold/used | ⬇️ Decreases stock |
| **adjustment** | Correction | ↔️ Manual fix |
| **transfer** | Location to location | ↔️ Horizontal move |
| **damaged** | Damaged items | ⬇️ Write-off |
| **returned** | Customer return | ⬆️ Back in stock |

Workflow:
1. Go to `/stock-movements`
2. Click **New Movement**
3. Select product → movement type → quantity → reason
4. Save - Stock updated, audit logged

### 🎨 Floor Plan Editor (`/floor-plans`)

**Create a floor plan:**
1. Click **New Floor Plan** - Set width/height (in units)
2. Use drawing tools:

| Tool | Purpose | Hotkey |
|------|---------|--------|
| **Select** | Pick & move objects | `S` |
| **Wall** | Draw barriers (doors/walls) | `W` |
| **Room** | Define enclosed spaces | `R` |
| **Rack** | Inventory storage units | `K` |
| **Shelf** | Sub-divisions in racks | `H` |
| **Label** | Text annotations | `L` |
| **Delete** | Remove objects | `D` |
| **Zoom In/Out** | Scale view | `+` / `-` |

**Link to locations:**
- After creating objects, name them (e.g., "Warehouse A - Rack 1")
- Link via location tree to track inventory physically

### 👥 Admin Controls (`/admin/...`)

#### Users (`/admin/users`)
- List all users by role
- Edit user details (name, email, role)
- Request deletion of user accounts

#### Departments (`/admin/departments`)
- Create/edit/delete departments
- View department stats
- Manage which users belong to each department

#### Staff Assignment (`/admin/assignment`)
- Assign staff to departments (single or multiple)
- Set admin roles for specific departments
- Control who sees what data

#### Delete Requests (`/delete-requests`)
- Review pending deletion requests
- Approve (permanently delete) or reject requests
- Audit trail of all deletions

#### Password Requests (`/password-requests`)
- Review password change requests from staff
- Approve or reject changes
- Track security changes

### 🔒 Access Control Rules

| Resource | Superadmin | Admin | Staff |
|----------|----------|--------|-------|
| **View all depts** | ✓ | ✗ | ✗ |
| **Manage users** | ✓ | ✗ | ✗ |
| **Create departments** | ✓ | ✗ | ✗ |
| **Assign staff** | ✓ | ✓ | ✗ |
| **View audit logs** | ✓ | ✓ | ✗ |
| **Create products** | ✓ | ✓ | ✓ (dept only) |
| **View products** | ✓ (all) | ✓ (assigned depts) | ✓ (assigned depts) |
| **Stock movements** | ✓ | ✓ | ✓ (dept only) |
| **Floor plans** | ✓ | ✓ | ✓ (dept only) |

## API Endpoints

All protected endpoints require: `Authorization: Bearer <JWT_TOKEN>` header

### Authentication (Public)
- `POST /api/auth/register` - Register user with invite code
- `POST /api/auth/login` - Login, returns JWT token
- `GET /api/auth/me` - Get current user profile
- `POST /api/auth/complete-initial-setup` - Superadmin: Complete initial setup
- `GET /api/auth/ensure-superadmin` - Ensure default superadmin exists

### Products (Protected)
- `GET /api/products` - List products (filtered by department)
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Request deletion (pending admin approval)

### Categories (Protected)
- `GET /api/categories` - List categories (by department)
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Request deletion

### Locations (Protected)
- `GET /api/locations` - List locations (hierarchical tree)
- `POST /api/locations` - Create location
- `PUT /api/locations/:id` - Update location
- `DELETE /api/locations/:id` - Request deletion

### Stock Movements (Protected)
- `GET /api/stock-movements` - List movements with filters
- `POST /api/stock-movements` - Record stock in/out/adjustment/transfer/etc.

### Floor Plans (Protected)
- `GET /api/floor-plans` - List floor plans
- `GET /api/floor-plans/:id` - Get floor plan with canvas data
- `POST /api/floor-plans` - Create floor plan
- `PUT /api/floor-plans/:id` - Update floor plan (canvas data)
- `DELETE /api/floor-plans/:id` - Request deletion

### Dashboard (Protected)
- `GET /api/dashboard/stats` - Get summary statistics (products, stock, locations)
- `GET /api/dashboard/recent-movements` - Get recent stock movements

### Users (Admin Only)
- `GET /api/users` - List all users
- `GET /api/users/:id` - Get user details
- `PUT /api/users/:id` - Update user (name, email, role)
- `DELETE /api/users/:id` - Request user deletion

### Departments (Admin Only)
- `GET /api/departments` - List departments
- `POST /api/departments` - Create department
- `PUT /api/departments/:id` - Update department
- `DELETE /api/departments/:id` - Delete department
- `GET /api/admin-departments` - Get admin's assigned departments
- `GET /api/staff-departments` - Get staff's assigned departments

### Delete Requests (Admin Only)
- `GET /api/delete-requests` - List pending delete requests
- `POST /api/delete-requests/:id/approve` - Approve deletion
- `POST /api/delete-requests/:id/reject` - Reject deletion

### Password Requests (Admin Only)
- `GET /api/password-requests` - List pending password change requests
- `POST /api/password-requests/:id/approve` - Approve password change
- `POST /api/password-requests/:id/reject` - Reject password change

### Invites (Admin Only)
- `POST /api/invites` - Create invite code
- `GET /api/invites` - List active invite codes

### Audit Logs (Admin Only)
- `GET /api/audit-logs` - List all audit log entries

## Configuration

### Environment Variables

**Backend** (`.env`):
```env
# Database
DATABASE_URL=file:./dev.db          # SQLite for dev
# DATABASE_URL=postgresql://user:pass@localhost:5432/ims  # PostgreSQL for prod

# Security (REQUIRED)
JWT_SECRET=your-secret-key-here     # Change in production!

# Server
PORT=3001
NODE_ENV=development                # or 'production'
```

**Frontend** (`.env`):
- No sensitive vars needed (API base URL is relative)

### Key Settings

- `.env.example` - Template for all required variables
- `JWT_SECRET` minimum 32 characters for production
- SQLite file auto-created at `backend/dev.db` (add to `.gitignore`)

## Security Guidelines

### Authentication & Authorization
- ✓ **JWT tokens** - Stateless, signed, auto-expire
- ✓ **Password hashing** - bcryptjs with 10 salt rounds
- ✓ **Role-based access** - Superadmin/Admin/Staff with granular permissions
- ✓ **Department isolation** - Data segregated by department
- ✓ **Protected API routes** - All endpoints (except auth) require valid JWT

### Data Integrity
- ✓ **Stock validation** - Prevents negative stock, overselling detected
- ✓ **Audit trail** - All changes logged with user, timestamp, IP
- ✓ **Soft deletes** - Delete requests require admin approval
- ✓ **Cascading deletes** - Products deleted with categories (when allowed)

### Security Best Practices
- ⚠️ **Never commit `.env`** - Use `.env.example` template only
- ⚠️ **Change default credentials** immediately after first login
- ⚠️ **Use HTTPS in production** - JWT tokens vulnerable over HTTP
- ⚠️ **Rotate JWT_SECRET periodically** - Invalidates old tokens
- ⚠️ **Limit invite codes** - Expiring codes (future enhancement)

## Development

### Run Both Services
```bash
npm run dev          # Starts frontend + backend concurrently
```

### Run Individually
```bash
npm run frontend:dev # Just React dev server
npm run backend:dev  # Just Express with auto-reload
```

### Database Migrations
```bash
cd backend
npx prisma migrate dev --name <migration-name>  # Create & run
npx prisma migrate deploy                        # Run pending (prod)
npx prisma studio                                # Open Prisma Studio UI
```

### Reset Database
```bash
cd backend
npx prisma migrate reset --force  # ⚠️ Drops and recreates
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| **Port already in use** | Kill process on port 3001 or 5174 (use `stop-ims.bat`) |
| **JWT_SECRET not set** | Add `JWT_SECRET=<key>` to `.env` and restart backend |
| **Database locked** | SQLite has one writer — close other terminal windows |
| **Login fails** | Ensure backend is running, check `.env` DATABASE_URL |
| **CORS errors** | Backend CORS is enabled — check frontend API URL |

## Future Enhancements (Phase 3+)

- **Barcode/QR scanning** - Mobile barcode scanner for stock movements
- **Advanced exports** - PDF reports, Excel exports with templates
- **Mobile app** - React Native version for warehouse floor work
- **Asset tracking** - Serial numbers, equipment lifecycle management
- **Predictive inventory** - Stock forecasting with usage trends
- **Integration APIs** - Connect to accounting, ERP systems
- **Real-time collaboration** - WebSocket support for multi-user editing
- **Camera floor plan** - Auto-generate layouts from photos

## License

MIT

## Support

For issues or questions, please check the documentation or create an issue in the repository.
