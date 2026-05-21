# Inventory Management System (IMS) - Phase 1

A full-stack Web App/PWA for inventory management with an interactive 2D floor plan builder.

## Features

- **Inventory Dashboard** - Summary of products, stock, and locations
- **Product Management** - Add, edit, delete, and search products
- **Category Management** - Organize products by categories
- **Stock Movements** - Record stock in/out with reasons
- **Location Management** - Hierarchical location tree (Branch → Building → Floor → Room → Rack → Shelf)
- **Interactive 2D Floor Plan Editor** - Manually create warehouse layouts with walls, rooms, racks, shelves, and labels
- **Basic PWA Support** - Installable app, offline fallback
- **Authentication** - Simple login/register with roles (admin/staff)

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

3. **Create the first admin user**
   ```bash
   cd backend
   # Optionally override defaults via env vars before running:
   # ADMIN_EMAIL=you@company.com ADMIN_PASSWORD=strongpassword npm run seed
   npm run seed
   ```
   Default credentials (change immediately after login):
   - Email: `admin@ims.local`
   - Password: `changeme123`

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
   - Login with the credentials set during the seed step

## First-time credentials

Set via `npm run seed` (override with env vars — see Setup step 3).

- Email: `admin@ims.local`
- Password: `changeme123`

**Change the password immediately after first login.**

## Usage

### Dashboard
- View summary statistics
- See recent stock movements

### Products
- Add new products with SKU, name, category, stock levels
- Search and filter products
- Edit or delete products
- Low stock items are highlighted

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
