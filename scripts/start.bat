@echo off
setlocal

for %%I in ("%~dp0..") do set ROOT_DIR=%%~fI
cd /d "%ROOT_DIR%"

docker compose up --build -d

echo PM MVP is running at http://localhost:8000
