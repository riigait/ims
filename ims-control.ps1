param(
    [ValidateSet('start', 'stop', 'restart', 'status', 'check')]
    [string]$action = 'status'
)

$backendPort = 3001
$frontendPort = 5173
$rootPath = $PSScriptRoot
$backendPath = Join-Path $rootPath 'backend'
$frontendPath = Join-Path $rootPath 'frontend'

function Get-PortProcess {
    param([int]$port)

    $netstat = netstat -ano | Select-String ":$port.*LISTENING" | Select-Object -First 1
    if ($netstat) {
        $procId = $netstat -split '\s+' | Select-Object -Last 1
        return [int]$procId
    }

    return $null
}

function Get-IMSDevProcessIds {
    $escapedRoot = [regex]::Escape($rootPath)
    return @(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -and
            $_.CommandLine -match $escapedRoot -and
            $_.CommandLine -match '(scripts[\\/]dev-start\.js|concurrently|backend[\\/].*(nodemon|ts-node)|frontend[\\/].*vite)'
        } |
        Select-Object -ExpandProperty ProcessId -Unique)
}

function Invoke-IMSCommand {
    param(
        [string]$Name,
        [string]$Path,
        [string]$FilePath,
        [string[]]$ArgumentList
    )

    Write-Host "`nChecking $Name..." -ForegroundColor Cyan

    Push-Location $Path
    try {
        & $FilePath @ArgumentList | Out-Host
        $exitCode = $LASTEXITCODE
        if ($exitCode -ne 0) {
            Write-Host "[FAIL] $Name check failed." -ForegroundColor Red
            return $false
        }

        Write-Host "[OK] $Name check passed." -ForegroundColor Green
        return $true
    } finally {
        Pop-Location
    }
}

function Test-IMSApp {
    Write-Host "`n=== IMS App Check ===" -ForegroundColor Cyan

    $backendOk = Invoke-IMSCommand 'Backend' $backendPath 'npm' @('run', 'build')
    if (-not $backendOk) {
        Write-Host "`nStart cancelled. Fix backend errors first." -ForegroundColor Red
        return $false
    }

    $frontendOk = Invoke-IMSCommand 'Frontend' $frontendPath 'npm' @('run', 'build')
    if (-not $frontendOk) {
        Write-Host "`nStart cancelled. Fix frontend errors first." -ForegroundColor Red
        return $false
    }

    Write-Host "`n[OK] Backend and frontend have no build errors." -ForegroundColor Green
    return $true
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

    Push-Location $rootPath
    try {
        $dockerStatus = docker-compose ps --services 2>&1 | Where-Object { $_ -and $_ -notmatch 'warning' }
        if ($dockerStatus) {
            Write-Host "[OK] Docker: Running" -ForegroundColor Green
        } else {
            Write-Host "[STOP] Docker: Stopped" -ForegroundColor Red
        }
    } catch {
        Write-Host "[WARN] Docker status unavailable" -ForegroundColor Yellow
    } finally {
        Pop-Location
    }

    Write-Host ''
}

function Stop-IMSApp {
    Write-Host "`nStopping IMS app..." -ForegroundColor Yellow

    $backendPid = Get-PortProcess $backendPort
    $frontendPid = Get-PortProcess $frontendPort
    $devProcessIds = Get-IMSDevProcessIds

    if ($devProcessIds.Count -gt 0) {
        Write-Host "Stopping IMS development processes..."
        Stop-Process -Id $devProcessIds -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 1
    }

    Write-Host "Stopping Docker containers..." -ForegroundColor Cyan
    Push-Location $rootPath
    try {
        docker-compose down 2>$null
    } catch {
        Write-Host "WARNING: Could not stop Docker containers" -ForegroundColor Yellow
    } finally {
        Pop-Location
    }

    if (-not $backendPid -and -not $frontendPid -and $devProcessIds.Count -eq 0) {
        Write-Host "No running processes found." -ForegroundColor Yellow
    } else {
        Write-Host "IMS app stopped." -ForegroundColor Green
    }
}

function Start-IMSApp {
    Write-Host "`nStarting IMS app..." -ForegroundColor Yellow

    Write-Output "Checking Docker..."
    docker info 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Output "[FAIL] Docker is not running. Start Docker Desktop, then run this command again."
        return
    }

    # Dev mode runs backend/frontend locally; Docker should only run Postgres.
    Write-Output "Starting Docker database only..."
    Push-Location $rootPath
    try {
        docker compose stop backend frontend 2>$null | Out-Null
        docker compose up -d postgres
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[FAIL] Could not start Postgres container." -ForegroundColor Red
            return
        }

        Write-Output "[OK] Postgres container is running."
    } catch {
        Write-Output "[FAIL] Docker database start failed."
        return
    } finally {
        Pop-Location
    }

    $backendPid = Get-PortProcess $backendPort
    $frontendPid = Get-PortProcess $frontendPort

    if ($backendPid -or $frontendPid) {
        Write-Host "Warning: IMS app is already running!" -ForegroundColor Yellow
        Show-Status
        return
    }

    if (-not (Test-IMSApp)) {
        return
    }

    $graphPath = Join-Path $rootPath 'graphify-out\graph.html'
    if (Test-Path $graphPath) {
        Start-Process $graphPath
    }

    Push-Location $rootPath
    try {
        npm run dev
    } finally {
        Pop-Location
    }
}

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
    'check' {
        Test-IMSApp | Out-Null
    }
}
