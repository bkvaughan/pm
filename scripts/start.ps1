Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

docker compose up --build -d
Write-Host "PM MVP is running at http://localhost:8000"
