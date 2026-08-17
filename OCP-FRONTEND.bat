@echo off
title OCP Frontend - DO NOT CLOSE
cd /d C:\Users\Pizza\Downloads\Tech-OCP\frontend
wsl -u pizza -e bash -c "cd /mnt/c/Users/Pizza/Downloads/Tech-OCP/frontend && npx vite --host"
pause
