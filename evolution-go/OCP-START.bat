@echo off
title OCP Server - DO NOT CLOSE
echo Starting Orange Cheese Pizza...
echo (This window must stay open - minimize it)
echo.

wsl --shutdown
timeout /t 5 /nobreak >nul

wsl -u pizza -e bash /mnt/c/Users/Pizza/Downloads/evolution-go/start-ocp.sh

echo.
echo ================================================
echo   SERVER RUNNING - MINIMIZE THIS WINDOW
echo   Closing this window will stop the server
echo ================================================

:: Keep-alive: holds WSL VM open permanently
wsl -u pizza -e bash -c "while true; do sleep 3600; done"
