@echo off
setlocal enabledelayedexpansion

echo.
echo ====================================
echo   IMS - Inventory Management System
echo ====================================
echo.

REM Check if Docker is running
echo [1/3] Checking Docker status...
docker ps >nul 2>&1
if errorlevel 1 (
    echo ERROR: Docker is not running or not installed.
    echo.
    echo Please start Docker Desktop manually and run this script again.
    echo.
    pause
    exit /b 1
) else (
    echo [OK] Docker is running
)

echo.

REM Check if PostgreSQL container is running
echo [2/3] Checking PostgreSQL container...
docker ps -a 2>nul | find "ims-postgres" >nul
if errorlevel 1 (
    echo PostgreSQL container not found. Starting docker-compose...
    docker-compose up -d
    if errorlevel 1 (
        echo ERROR: Failed to start docker-compose. Make sure docker-compose.yml exists.
        pause
        exit /b 1
    )
    echo Waiting for database to be ready (10 seconds)...
    timeout /t 10 /nobreak
) else (
    echo [OK] PostgreSQL is running
)

echo.

REM Start Backend in a new window
echo [3/3] Starting Backend Server...
echo Starting in: backend
start "IMS Backend" cmd /k "cd /d %CD%\backend && npm run dev"
timeout /t 5 /nobreak

echo.

REM Start Frontend in a new window
echo [4/4] Starting Frontend Server...
echo Starting in: frontend
start "IMS Frontend" cmd /k "cd /d %CD%\frontend && npm run dev"

echo.
echo ====================================
echo   All services started!
echo ====================================
echo.
echo Backend:  http://localhost:5000
echo Frontend: http://localhost:5173
echo Database: PostgreSQL via Docker
echo.
echo New windows are opening for Backend and Frontend servers.
echo Check those windows for any startup errors.
echo.
timeout /t 3 /nobreak
