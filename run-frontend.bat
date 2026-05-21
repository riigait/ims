@echo off
setlocal enabledelayedexpansion

REM Add Node.js to PATH
set PATH=%PATH%;C:\Program Files\nodejs

echo Starting IMS Frontend Server...
cd /d d:\vs\ims\frontend
call "C:\Program Files\nodejs\npm.cmd" run dev

pause
