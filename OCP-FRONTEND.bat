@echo off
title OCP Frontend - DO NOT CLOSE
cd /d C:\Users\Pizza\Downloads\Tech-OCP\frontend
wsl -e -e bash -c "cd /home/user/Downloads/Tech-OCP/frontend && npx vite --host"
pause
