@echo off
REM Setup script for Inventory Management System (Windows)

echo 🚀 Setting up Inventory Management System Phase 1...

REM Install root dependencies
echo 📦 Installing root dependencies...
call npm install

REM Install frontend dependencies
echo 📦 Installing frontend dependencies...
cd frontend
call npm install
cd ..

REM Install backend dependencies
echo 📦 Installing backend dependencies...
cd backend
call npm install

REM Setup Prisma
echo 🗄️  Setting up database...
echo Make sure PostgreSQL is running and DATABASE_URL is set in backend\.env
echo Running migrations...
call npx prisma migrate dev --name init

echo ✅ Setup complete!
echo.
echo 📝 Next steps:
echo 1. Start the backend: npm run backend:dev
echo 2. Start the frontend (in another terminal): npm run frontend:dev
echo 3. Open http://localhost:5173 in your browser
echo 4. Login with admin@example.com / password
