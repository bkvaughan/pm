@echo off
setlocal

for %%I in ("%~dp0..") do set ROOT_DIR=%%~fI
cd /d "%ROOT_DIR%"

docker compose down

echo PM MVP containers stopped
