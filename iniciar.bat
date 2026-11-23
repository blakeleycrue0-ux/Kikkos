@echo off
chcp 65001 >nul
cd /d "%~dp0"
title FFSP - Control de retransmisiones
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js no esta instalado. Instalalo desde https://nodejs.org ^(version LTS^)
  echo  o con:  winget install OpenJS.NodeJS.LTS
  echo  y vuelve a abrir este archivo.
  echo.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Primera vez: instalando componentes ^(necesita internet, tarda un minuto^)...
  call npm install --omit=dev
  if errorlevel 1 ( echo La instalacion ha fallado. Revisa la conexion a internet. & pause & exit /b 1 )
)
if not exist data\sample\muestra.mp4 call node tools\make-sample.js
node server\index.js --open
echo.
echo La aplicacion se ha cerrado.
pause
