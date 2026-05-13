@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "HOST=%~1"
set "DEVICE_ID=%~2"
if "%HOST%"=="" set "HOST=192.168.11.2:8080"

if "%DEVICE_ID%"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-viewer.ps1" -HostAddress "%HOST%"
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start-viewer.ps1" -HostAddress "%HOST%" -DeviceId "%DEVICE_ID%"
)
