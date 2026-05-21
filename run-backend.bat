@echo off
setlocal enabledelayedexpansion

REM Use full node path to run TypeScript compiler and the built server
echo Starting IMS Backend Server (direct)...
cd /d d:\vs\ims\backend

REM Compile TypeScript
"C:\Program Files\nodejs\node.exe" node_modules\typescript\lib\tsc.js

REM Start server
"C:\Program Files\nodejs\node.exe" dist\index.js

pause
