# Inventory Management System

Local Inventory Management System for products, inventory items, locations, stock movements, users, departments, and floor plans.

## Requirements

### Software

* Git
* Node.js
* npm
* PostgreSQL
* Prisma

### Hardware

No special hardware is required.

Recommended for local use:

* Desktop, laptop, mini PC, or Raspberry Pi
* At least 4GB RAM
* SSD or NVMe storage recommended for the database

## Project Structure

```txt
ims/
├── backend/
├── frontend/
├── csv-corrector/
├── docker-compose.yml
└── README.md
```

## Local Installation

Clone the repository:

```bash
git clone <repository-url>
cd ims
```

## Backend Setup

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:

```env
DATABASE_URL="postgresql://user:password@localhost:5432/ims"
JWT_SECRET="your-jwt-secret"
PORT=3001
```

Run Prisma:

```bash
npx prisma generate
npx prisma migrate dev
```

Start the backend:

```bash
npm run dev
```

Backend runs on:

```txt
http://localhost:3001
```

## Frontend Setup

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Frontend runs on:

```txt
http://localhost:5173
```

## Docker Local Setup

You can also run the app locally using Docker:

```bash
docker-compose up
```

## Environment Notes

Do not commit `.env` files.

Keep these private:

```txt
.env
.env.local
database passwords
JWT secrets
admin credentials
private server IPs
```

## Usage

1. Start PostgreSQL.
2. Start the backend.
3. Start the frontend.
4. Open the frontend URL in your browser.
5. Complete the initial setup.
6. Login and use the system locally.

## License

Add your selected license here.
