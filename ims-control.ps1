param(
    [ValidateSet('start', 'stop', 'restart', 'status')]
    [string]$action = 'status'
)

$backendPort = 3001
$frontendPort = 5173

function Get-PortProcess {
    param([int]$port)
    $netstat = netstat -ano | Select-String ":$port.*LISTENING"
    if ($netstat) {
        $procId = $netstat -split '\s+' | Select-Object -Last 1
        return [int]$procId
    }
    return $null
}

function Show-Status {
    $backendPid = Get-PortProcess $backendPort
    $frontendPid = Get-PortProcess $frontendPort

    Write-Host "`n=== IMS App Status ===" -ForegroundColor Cyan

    if ($backendPid) {
        Write-Host "[OK] Backend (Port $backendPort): Running (PID: $backendPid)" -ForegroundColor Green
    } else {
        Write-Host "[STOP] Backend (Port $backendPort): Stopped" -ForegroundColor Red
    }

    if ($frontendPid) {
        Write-Host "[OK] Frontend (Port $frontendPort): Running (PID: $frontendPid)" -ForegroundColor Green
    } else {
        Write-Host "[STOP] Frontend (Port $frontendPort): Stopped" -ForegroundColor Red
    }

    # Check Docker containers
    Push-Location $PSScriptRoot
    $dockerStatus = docker-compose ps --services 2>&1 | Where-Object { $_ -and $_ -notmatch "warning" }
    if ($dockerStatus) {
        Write-Host "[OK] Docker: Running" -ForegroundColor Green
    } else {
        Write-Host "[STOP] Docker: Stopped" -ForegroundColor Red
    }
    Pop-Location

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

    # Stop Docker containers
    Write-Host "Stopping Docker containers..." -ForegroundColor Cyan
    try {
        Push-Location (Split-Path -Parent $MyInvocation.MyCommand.Path)
        docker-compose down 2>$null
        Pop-Location
    } catch {
        Write-Host "WARNING: Could not stop Docker containers" -ForegroundColor Yellow
        Pop-Location
    }

    if (-not $backendPid -and -not $frontendPid) {
        Write-Host "No running processes found." -ForegroundColor Yellow
    } else {
        Write-Host "IMS app stopped." -ForegroundColor Green
    }
}

function Start-IMSApp {
    Write-Host "`nStarting IMS app..." -ForegroundColor Yellow

    $backendPid = Get-PortProcess $backendPort
    $frontendPid = Get-PortProcess $frontendPort

    if ($backendPid -or $frontendPid) {
        Write-Host "Warning: IMS app is already running!" -ForegroundColor Yellow
        Show-Status
        return
    }

    try {
        Push-Location $PSScriptRoot
        npm run dev
    } finally {
        Pop-Location
    }
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
        Write-Host "Waiting for services to fully stop..." -ForegroundColor Yellow
        Start-Sleep -Seconds 3
        Start-IMSApp
    }
    'status' {
        Show-Status
    }
}
