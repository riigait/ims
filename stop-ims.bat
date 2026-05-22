@echo off
setlocal enabledelayedexpansion

echo.
echo Stopping IMS Application...
echo.

REM Kill processes on ports 3001 and 5173
for /f "tokens=5" %%a in ('netstat -ano ^| find ":3001"') do (
    if not "%%a"=="0" (
        echo Killing backend process (PID: %%a)
        taskkill /PID %%a /F 2>nul
    )
)

for /f "tokens=5" %%a in ('netstat -ano ^| find ":5173"') do (
    if not "%%a"=="0" (
        echo Killing frontend process (PID: %%a)
        taskkill /PID %%a /F 2>nul
    )
)

echo.
echo IMS Application stopped.
echo.
timeout /t 2 /nobreak
