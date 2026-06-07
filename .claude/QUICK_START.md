# Quick Start Commands

---

## Development

```bash
# Start backend (port 3001)
cd backend && npm run dev

# Start frontend (port 5173)
cd frontend && npm run dev

# Start both via control script (Windows)
.\ims-control.ps1
```

## Database

```bash
# Apply new migrations
cd backend && npx prisma migrate dev --name <description>

# Open Prisma Studio (visual DB browser)
cd backend && npx prisma studio

# Seed the database
cd backend && npm run seed

# Reset DB (drops all data)
cd backend && npx prisma migrate reset
```

## Tests

```bash
# Run backend tests only
cd backend && npm test

# Run a single test file
cd backend && npx jest src/__tests__/auth.test.ts
```

## Build / Docker

```bash
# Build and run locally with Docker
docker-compose up -d

# Use pre-built production images
cp .env.example .env  # fill in secrets
docker-compose -f docker-compose.prod.yml up -d
```

---

**Last Updated**: 2026-06-07
