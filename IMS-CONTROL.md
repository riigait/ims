# IMS Control Scripts

Quick start and stop scripts for the Inventory Management System.

## Quick Start (Easiest)

### Windows - Double-click these files:
- **`start-ims.bat`** — Starts both frontend and backend in separate windows
- **`stop-ims.bat`** — Stops both frontend and backend

### Terminal - Run these commands:

**Using NPM:**
```bash
npm run dev          # Start both (all-in-one)
npm start            # Alias for npm run dev
```

**Using PowerShell Control Script:**
```powershell
# Check status
powershell -ExecutionPolicy Bypass -File ims-control.ps1 status

# Start app
powershell -ExecutionPolicy Bypass -File ims-control.ps1 start

# Stop app
powershell -ExecutionPolicy Bypass -File ims-control.ps1 stop

# Restart app
powershell -ExecutionPolicy Bypass -File ims-control.ps1 restart

# Or use the npm shortcut
npm run control status
npm run control start
npm run control stop
npm run control restart
```

**Using Terminal Commands:**
```bash
# Start
npm run frontend:dev      # Terminal 1
npm run backend:dev       # Terminal 2

# Stop - Use Ctrl+C in each terminal
```

## Services

| Service | Port | Start Command | Stop Command |
|---------|------|---------------|--------------|
| Frontend (React/Vite) | 5173 | `start-ims.bat` or `npm run frontend:dev` | `stop-ims.bat` or Ctrl+C |
| Backend (Express/Node) | 3001 | `start-ims.bat` or `npm run backend:dev` | `stop-ims.bat` or Ctrl+C |

## Access

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001/api

## Script Details

### start-ims.bat
- Opens two separate command windows
- Starts backend (port 3001)
- Starts frontend (port 5173)
- Shows URLs for quick access

### stop-ims.bat
- Kills all processes on ports 3001 and 5173
- Safe and clean shutdown

### ims-control.ps1
- PowerShell script with more control
- Commands: `start`, `stop`, `restart`, `status`
- Color-coded output for easy reading
- Shows process IDs (PIDs)

## Troubleshooting

**Port already in use?**
```powershell
npm run control stop
# or
powershell -ExecutionPolicy Bypass -File ims-control.ps1 stop
```

**Still stuck?**
```bash
# Kill by port (PowerShell)
$pid = (netstat -ano | Select-String ":3001|:5173" | ForEach-Object { $_ -split '\s+' | Select-Object -Last 1 }); Stop-Process -Id $pid -Force 2>$null

# Or use the batch file
stop-ims.bat
```

**Services won't start?**
1. Check Node.js is installed: `node -v`
2. Check npm is installed: `npm -v`
3. Install dependencies: `npm run install`
4. Try starting manually: `npm run dev`
