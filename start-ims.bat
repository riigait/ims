@echo off
setlocal enabledelayedexpansion

echo.
echo Starting IMS Application...
echo.

cd /d d:\vs\ims
call npm run dev

pause
