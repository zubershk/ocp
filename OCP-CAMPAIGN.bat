@echo off
title OCP Campaign Runner - DO NOT CLOSE
cd /d "%~dp0campaign-runner"

:: Ensure node is reachable even with a thin PATH
where node >nul 2>&1
if %errorlevel% neq 0 set "PATH=C:\nvm4w\nodejs;%PATH%"

:: Stand down the scheduled task first so its restart policy doesn't
:: fight this window for :3001 (task stays registered for boot).
schtasks /end /tn "OCP-Campaign-Runner" >nul 2>&1

:: Kill stale runner servers holding :3001.
:: Filtered to server/index.js only - vite and other node apps are untouched.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*server/index.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1

:: If :3001 is STILL held (a non-node program), refuse to start a shadow server.
netstat -ano | findstr /R /C:":3001.*LISTEN" >nul 2>&1
if %errorlevel% equ 0 (
  echo.
  echo [ERROR] Port 3001 is still held by another program - not starting.
  echo   1. Find it with:  netstat -ano ^| findstr :3001
  echo   2. Stop it, then re-run this file.
  pause
  exit /b 1
)

:: Start the UI (vite :5174) in a second window, then run the API here.
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*campaign-runner*' -and $_.CommandLine -like '*vite*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }" >nul 2>&1
start "OCP Campaign UI" /min cmd /c "cd /d %~dp0campaign-runner && call npm run dev:client -- --host 0.0.0.0 --port 5174 --strictPort"

call node server/index.js
if %errorlevel% neq 0 (
  echo.
  echo [ERROR] Campaign Runner exited. Check the error above.
  echo   If the port is held, run:  netstat -ano ^| findstr :3001
)
pause
