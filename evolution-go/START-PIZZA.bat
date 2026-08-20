@echo off
title Orange Cheese Pizza - Server
echo ================================================
echo   Orange Cheese Pizza - Starting Services
echo ================================================
echo.

wsl --shutdown
timeout /t 3 /nobreak >nul

wsl -e -e bash /home/user/Downloads/evolution-go/start-ocp.sh

echo.
echo ================================================
echo   Keeping WSL alive (minimize this window)
echo ================================================
wsl -e -e bash -c "while true; do sleep 3600; done"

pause
