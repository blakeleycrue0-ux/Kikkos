@echo off
chcp 65001 >nul
net session >nul 2>&1
if errorlevel 1 (
  echo Pidiendo permisos de administrador...
  powershell -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
set PUERTO=3000
netsh advfirewall firewall delete rule name="FFSP Retransmision" >nul 2>&1
netsh advfirewall firewall add rule name="FFSP Retransmision" dir=in action=allow protocol=TCP localport=%PUERTO% profile=any remoteip=localsubnet
if errorlevel 1 ( echo No se pudo crear la regla. ) else ( echo Regla creada: el puerto %PUERTO% queda abierto solo para tu red local, en cualquier tipo de red. )
echo.
pause
