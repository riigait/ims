#!/bin/bash

# Setup script for Inventory Management System

echo "🚀 Setting up Inventory Management System Phase 1..."

# Install root dependencies
echo "📦 Installing root dependencies..."
npm install

# Install frontend dependencies
echo "📦 Installing frontend dependencies..."
cd frontend
npm install
cd ..

# Install backend dependencies
echo "📦 Installing backend dependencies..."
cd backend
npm install

# Setup Prisma
echo "🗄️  Setting up database..."
echo "Make sure PostgreSQL is running and DATABASE_URL is set in backend/.env"
echo "Running migrations..."
npx prisma migrate dev --name init

echo "✅ Setup complete!"
echo ""
echo "📝 Next steps:"
echo "1. Start the backend: npm run backend:dev"
echo "2. Start the frontend (in another terminal): npm run frontend:dev"
echo "3. Open http://localhost:5173 in your browser"
echo "4. Create admin account or use seed script to initialize first admin"
