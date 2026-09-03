@echo off
title OCP Frontend - DO NOT CLOSE
cd /d "%~dp0frontend"
:: Remove stale WSL portproxy that blocks 5173 (ignore error if not admin)
netsh interface portproxy delete v4tov4 listenport=5173 listenaddress=127.0.0.1 >nul 2>&1
call npm run dev -- --host 0.0.0.0 --port 5173
if %errorlevel% neq 0 (
  echo Port 5173 busy, trying 5174...
  call npm run dev -- --host 0.0.0.0 --port 5174
)
pause
