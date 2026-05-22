# Inventory Management System (IMS) - Phase 1

A full-stack Web App/PWA for inventory management with an interactive 2D floor plan builder.

## Features

- **Inventory Dashboard** - Summary of products, stock, and locations
- **Product Management** - Add, edit, delete, and search products with measurement units
- **Product Measurement Units** - Support for 31 unit types (pieces, weight, volume, length, area, and other)
- **Category Management** - Organize products by categories
- **Stock Movements** - Record stock in/out with reasons (stock_in, stock_out, adjustment, transfer, damaged, returned)
- **Location Management** - Hierarchical location tree (Branch → Building → Floor → Room → Rack → Shelf)
- **Interactive 2D Floor Plan Editor** - Manually create warehouse layouts with walls, rooms, racks, shelves, and labels
- **Department-based Access Control** - Multi-department support with department switcher
  - Admin users can view all departments or select a specific department
  - Staff users with multiple department assignments can view "All Departments" or switch to a specific department
  - Single-department users see their department automatically
- **Basic PWA Support** - Installable app, offline fallback
- **Authentication** - Login/register with roles (superadmin/admin/staff), role-based access control
- **Initial Setup** - Secure setup page for default superadmin account on new servers

## Tech Stack

### Frontend
- React + TypeScript
- Vite
- Tailwind CSS
- Zustand (state management)
- Axios (HTTP client)
- Canvas for 2D drawing

### Backend
- Node.js + Express + TypeScript
- **SQLite** (local development) / **PostgreSQL** (production)
- Prisma ORM
- JWT authentication
- bcryptjs for password hashing

## Project Structure

```
inventory-pwa/
├── frontend/          # React Vite app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── types/
│   │   └── utils/
│   └── package.json
├── backend/           # Express server
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── index.ts
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 18+
- npm or yarn
- SQLite (bundled — no installation needed for local dev)
- PostgreSQL 14+ (for production only)

### Database decision

| Environment | Database  | Why |
|-------------|-----------|-----|
| Local dev   | SQLite    | Zero setup, file-based, fast for iteration |
| Production  | PostgreSQL| Concurrent writes, row-level locking, production reliability |

To switch to PostgreSQL for production:
1. Change `provider = "sqlite"` → `provider = "postgresql"` in `backend/prisma/schema.prisma`
2. Update `DATABASE_URL` in `.env` to a Postgres connection string, e.g. `postgresql://user:pass@host:5432/ims`
3. Re-run `npx prisma migrate deploy`

### Setup

1. **Clone and install dependencies**
   ```bash
   cd frontend && npm install
   cd ../backend && npm install
   ```

2. **Setup database**
   ```bash
   cd backend
   npx prisma migrate dev --name init
   ```

3. **Seed the database**
   ```bash
   cd backend
   npm run seed
   ```
   This creates a default superadmin account with temporary credentials that **must be changed** on first login (see Initial Setup below).

4. **Start backend**
   ```bash
   cd backend
   npm run dev
   ```

5. **Start frontend (in another terminal)**
   ```bash
   cd frontend
   npm run dev
   ```

6. **Access the app**
   - Open http://localhost:5173 in your browser
   - Login with default credentials (see Initial Setup below)

## Initial Setup

Every new server comes with a default superadmin account that must be configured before use.

### Default Credentials
- Email: `admin@ims.local`
- Password: `changeme123`

### Setup Process
1. Login with the default credentials above
2. You will be automatically redirected to the **Initial Setup** page
3. Fill in the form with:
   - **Name**: Your full name
   - **Email**: Your permanent email address
   - **Password**: Strong password (minimum 8 characters)
   - **Confirm Password**: Verify your password
4. Click **Complete Setup**
5. Your superadmin account is now configured and ready to use

**Important**: This is a one-time setup. After completion, use your new credentials to log in.

## Usage

### Dashboard
- View summary statistics
- See recent stock movements
- Department-filtered data (shows data for selected department or all assigned departments)

### Department Switcher
- Located in the top navigation bar
- **Admin users**: View all departments or select a specific department
- **Staff users**: 
  - Single-department staff: Shows read-only department name
  - Multi-department staff: Dropdown to select a specific department or view "All Departments"
- Changes to department selection are reflected across all pages (Dashboard, Products, Categories, Locations, Stock Movements, Floor Plans)

### Product Units
Products support 31 measurement unit types organized by category:

| Category | Units |
|----------|-------|
| Pieces/Count | pcs, dozen, box, pack |
| Weight | g, kg, mg, oz, lb, ton |
| Volume/Liquid | ml, liter, gallon, cup |
| Length/Distance | mm, cm, m, km, inch, ft, yard |
| Area | cm², m² |
| Other | roll, sheet, can, bottle, bag, carton |

### Products
- Add new products with SKU, name, category, stock levels
- Select measurement units for products (pieces, kg, liters, meters, etc.)
- Search and filter products by name, category, location, unit, or stock status
- Edit or delete products
- Low stock items are highlighted
- Department-filtered view (admin/staff can see their department's products)

### Categories
- Create and manage product categories

### Locations
- Build hierarchical location structure
- Supports: Branch → Building → Floor → Room → Rack → Shelf

### Stock Movements
- Record stock in/out with reasons
- Automatically updates product stock levels
- View movement history

### Floor Plans
- Create new floor plans with custom dimensions
- Use the interactive editor to:
  - Draw walls
  - Create rooms/areas
  - Place racks and shelves
  - Add text labels
  - Select and edit objects
  - Delete objects
- Save and reload floor plans
- Link objects to inventory locations

## Floor Plan Editor Controls

| Tool | Action |
|------|--------|
| Select | Click to select objects |
| Wall | Drag to draw lines |
| Room | Drag to create rectangles |
| Rack | Drag to create rectangles |
| Shelf | Drag to create rectangles |
| Label | Click to add text |
| Delete | Click object to delete |
| Zoom | Use +/- buttons |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user
- `POST /api/auth/complete-initial-setup` - Complete initial setup (change default email/password)

### Products
- `GET /api/products` - List products
- `GET /api/products/:id` - Get product details
- `POST /api/products` - Create product
- `PUT /api/products/:id` - Update product
- `DELETE /api/products/:id` - Delete product

### Categories
- `GET /api/categories` - List categories
- `POST /api/categories` - Create category
- `PUT /api/categories/:id` - Update category
- `DELETE /api/categories/:id` - Delete category

### Locations
- `GET /api/locations` - List locations
- `POST /api/locations` - Create location
- `PUT /api/locations/:id` - Update location
- `DELETE /api/locations/:id` - Delete location

### Stock Movements
- `GET /api/stock-movements` - List movements
- `POST /api/stock-movements` - Create movement

### Floor Plans
- `GET /api/floor-plans` - List floor plans
- `GET /api/floor-plans/:id` - Get floor plan
- `POST /api/floor-plans` - Create floor plan
- `PUT /api/floor-plans/:id` - Update floor plan
- `DELETE /api/floor-plans/:id` - Delete floor plan

### Dashboard
- `GET /api/dashboard/stats` - Get statistics
- `GET /api/dashboard/recent-movements` - Get recent movements

## Security Notes

- `JWT_SECRET` **must** be set in `.env` — the server will refuse to start without it
- All registrations default to `staff` role; use the seed script to create admin users
- Stock movements validate: quantity > 0, valid movement type, no overselling (admin override allowed)
- `currentStock` cannot be directly edited via the product form — use stock movements
- Audit log records all product and stock movement changes
- Password hashing with bcryptjs (bcrypt, 10 rounds)
- Protected routes require a valid JWT in the `Authorization: Bearer <token>` header

## Future Enhancements

- Camera-based floor plan detection
- Barcode/QR code scanning
- Mobile app (React Native)
- Advanced reporting and exports
- Multi-user collaboration
- Audit trail and logging
- Role-based access control (RBAC)
- Asset tracking
- Integration with accounting systems

## License

MIT

## Support

For issues or questions, please check the documentation or create an issue in the repository.
