@echo off
title OCP Frontend - DO NOT CLOSE
cd /d "%~dp0frontend"

:: Kill stale vite dev servers squatting :5173.
:: Filtered to vite only - other node apps (campaign runner :3001) are untouched.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*vite*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: Remove stale WSL portproxy that blocks 5173 (ignore error if not admin)
netsh interface portproxy delete v4tov4 listenport=5173 listenaddress=127.0.0.1 >nul 2>&1

:: If :5173 is STILL held (a non-vite program), refuse to start: on Windows
:: a second server can bind the same port on the other IP stack and steal
:: traffic randomly. Fail loudly instead of running a shadow server.
netstat -ano | findstr /R /C:":5173.*LISTEN" >nul 2>&1
if %errorlevel% equ 0 (
  echo.
  echo [ERROR] Port 5173 is still held by another program - not starting vite.
  echo   1. Find it with:  netstat -ano ^| findstr :5173
  echo   2. Stop it, or press FIX PORTS in the Control Panel, then re-run this file.
  pause
  exit /b 1
)

:: strictPort: fail loudly if 5173 is held instead of silently drifting to
:: 5174 (the panel, shortcuts and health checks all assume :5173).
call npm run dev -- --host 0.0.0.0 --port 5173 --strictPort
if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Could not bind port 5173. It is held by another program.
  echo   1. Find it with:  netstat -ano ^| findstr :5173
  echo   2. Stop it, or press FIX PORTS in the Control Panel, then re-run this file.
)
pause
