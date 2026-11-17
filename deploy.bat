@echo off
setlocal
chcp 65001 >nul
title Calendario Editorial - despliegue

set "VPS=root@212.227.95.230"
set "APP=/opt/studio-mb-apps/studio-mb-calendario-editorial"

echo.
echo == Desplegando Calendario Editorial en produccion ==
echo    (te pedira la contrasena del servidor si no tienes clave SSH)
echo.

ssh -t %VPS% "cd %APP% && bash deploy.sh"

if errorlevel 1 (
  echo.
  echo ERROR: el despliegue no termino bien. Revisa la salida de arriba.
) else (
  echo.
  echo Listo. Abre https://calendar.studiomb.es
)
echo.
pause
