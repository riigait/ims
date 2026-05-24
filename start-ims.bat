@echo off
REM IMS Startup Script - Starts Docker, Backend, and Frontend

echo.
echo ====================================
echo   IMS - Inventory Management System
echo ====================================
echo.

setlocal enabledelayedexpansion

REM Check if Docker is running
echo [1/3] Checking Docker status...
docker ps >/dev/null 2>&1
if errorlevel 1 (
    echo WARNING: Docker is not running. Starting Docker Desktop...
    start "" "C:\Program Files\Docker\Docker\Docker.exe"
    echo Waiting for Docker to start (30 seconds)...
    timeout /t 30 /nobreak
) else (
    echo [OK] Docker is running
)

echo.

REM Check if PostgreSQL container is running
echo [2/3] Checking PostgreSQL container...
docker ps --filter "name=ims-postgres" --format "{{.Names}}" | findstr "ims-postgres" >/dev/null
if errorlevel 1 (
    echo PostgreSQL container not found. Starting docker-compose...
    docker-compose up -d
    echo Waiting for database to be ready (10 seconds)...
    timeout /t 10 /nobreak
) else (
    echo [OK] PostgreSQL is running
)

echo.

REM Start Backend in a new window
echo [3/3] Starting Backend Server...
start "IMS Backend" cmd /k "cd backend && npm run dev"
timeout /t 5 /nobreak

echo.

REM Start Frontend in a new window
echo [4/4] Starting Frontend Server...
start "IMS Frontend" cmd /k "cd frontend && npm run dev"

echo.
echo ====================================
echo   All services started!
echo ====================================
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo Database: PostgreSQL via Docker
echo.
echo Close any window to stop that service.
echo.
pause
