param(
    [ValidateSet('start', 'stop', 'restart', 'status')]
    [string]$action = 'status'
)

$backendPort = 3001
$frontendPort = 5173
$backendPath = 'd:\vs\ims\backend'
$frontendPath = 'd:\vs\ims\frontend'

function Get-PortProcess {
    param([int]$port)
    $netstat = netstat -ano | Select-String ":$port.*LISTENING"
    if ($netstat) {
        $pid = $netstat -split '\s+' | Select-Object -Last 1
        return [int]$pid
    }
    return $null
}

function Show-Status {
    $backendPid = Get-PortProcess $backendPort
    $frontendPid = Get-PortProcess $frontendPort

    Write-Host "`n=== IMS App Status ===" -ForegroundColor Cyan
    if ($backendPid) {
        Write-Host "✓ Backend (Port $backendPort): Running (PID: $backendPid)" -ForegroundColor Green
    } else {
        Write-Host "✗ Backend (Port $backendPort): Stopped" -ForegroundColor Red
    }

    if ($frontendPid) {
        Write-Host "✓ Frontend (Port $frontendPort): Running (PID: $frontendPid)" -ForegroundColor Green
    } else {
        Write-Host "✗ Frontend (Port $frontendPort): Stopped" -ForegroundColor Red
    }
    Write-Host "`n"
}

function Stop-IMSApp {
    Write-Host "`nStopping IMS app..." -ForegroundColor Yellow

    $backendPid = Get-PortProcess $backendPort
    $frontendPid = Get-PortProcess $frontendPort

    if ($backendPid) {
        Write-Host "Killing backend process (PID: $backendPid)..."
        Stop-Process -Id $backendPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }

    if ($frontendPid) {
        Write-Host "Killing frontend process (PID: $frontendPid)..."
        Stop-Process -Id $frontendPid -Force -ErrorAction SilentlyContinue
        Start-Sleep -Milliseconds 500
    }

    if (-not $backendPid -and -not $frontendPid) {
        Write-Host "No running processes found." -ForegroundColor Yellow
    } else {
        Write-Host "IMS app stopped." -ForegroundColor Green
    }
}

function Start-IMSApp {
    Write-Host "`nStarting IMS app..." -ForegroundColor Yellow

    # Check if already running
    $backendPid = Get-PortProcess $backendPort
    $frontendPid = Get-PortProcess $frontendPort

    if ($backendPid -or $frontendPid) {
        Write-Host "Warning: IMS app is already running!" -ForegroundColor Yellow
        Show-Status
        return
    }

    # Start backend
    Write-Host "Starting backend..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$backendPath'; npm run dev" -WindowStyle Normal

    Start-Sleep -Seconds 3

    # Start frontend
    Write-Host "Starting frontend..." -ForegroundColor Cyan
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$frontendPath'; npm run dev" -WindowStyle Normal

    Start-Sleep -Seconds 3

    Write-Host "`nWaiting for services to start..." -ForegroundColor Yellow
    Start-Sleep -Seconds 5

    Show-Status
}

# Main execution
switch ($action) {
    'start' {
        Start-IMSApp
    }
    'stop' {
        Stop-IMSApp
        Show-Status
    }
    'restart' {
        Stop-IMSApp
        Start-Sleep -Seconds 2
        Start-IMSApp
    }
    'status' {
        Show-Status
    }
}
