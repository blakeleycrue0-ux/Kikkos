@echo off
chcp 65001 >nul
cd /d "%~dp0"
title FFSP - Actualizar
echo.
echo  Actualizando FFSP desde el ZIP mas reciente de Descargas...
echo.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\actualizar.ps1"
echo.
pause
