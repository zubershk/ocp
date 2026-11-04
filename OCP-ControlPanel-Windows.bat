@echo off
title OCP Control Panel v2 (Windows Native)
cd /d "%~dp0"
start "OCP Control Panel" powershell.exe -NoProfile -STA -ExecutionPolicy Bypass -File "%~dp0OCP-ControlPanel-Windows.ps1"
