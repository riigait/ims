# IMS Startup Script - Starts Docker, Backend, and Frontend in current window

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "  IMS - Inventory Management System" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "[1/3] Checking Docker status..." -ForegroundColor Yellow
try {
    $dockerCheck = docker ps 2>&1
    Write-Host "[OK] Docker is running" -ForegroundColor Green
} catch {
    Write-Host "ERROR: Docker is not running or not installed." -ForegroundColor Red
    Write-Host "Please start Docker Desktop manually and run this script again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""

# Start PostgreSQL container
Write-Host "[2/3] Starting PostgreSQL container..." -ForegroundColor Yellow
docker-compose up -d
Write-Host "Waiting for database to be ready (10 seconds)..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

Write-Host ""

# Start Backend
Write-Host "[3/3] Starting Backend Server..." -ForegroundColor Yellow
Write-Host "Starting: npm run dev (in backend folder)" -ForegroundColor Gray
$backendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "$PSScriptRoot\backend" -NoNewWindow -PassThru
Write-Host "Backend PID: $($backendProcess.Id)" -ForegroundColor Gray
Start-Sleep -Seconds 5

Write-Host ""

# Start Frontend
Write-Host "[4/4] Starting Frontend Server..." -ForegroundColor Yellow
Write-Host "Starting: npm run dev (in frontend folder)" -ForegroundColor Gray
$frontendProcess = Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory "$PSScriptRoot\frontend" -NoNewWindow -PassThru
Write-Host "Frontend PID: $($frontendProcess.Id)" -ForegroundColor Gray

Write-Host ""
Write-Host "====================================" -ForegroundColor Cyan
Write-Host "   All services started!" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Backend:  http://localhost:5000" -ForegroundColor Green
Write-Host "Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host "Database: PostgreSQL via Docker" -ForegroundColor Green
Write-Host ""
Write-Host "All output will appear in this window." -ForegroundColor Gray
Write-Host "Press Ctrl+C to stop all services." -ForegroundColor Gray
Write-Host ""

# Wait for processes to complete
Wait-Process -Id $backendProcess.Id, $frontendProcess.Id
