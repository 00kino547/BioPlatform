#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==> Building Frontend Image"
docker build -t dracoservices/bioplatform-frontend -f apps/frontend/Dockerfile .

if ($LASTEXITCODE -ne 0) { throw "Frontend build failed" }
Write-Host "==> Image complete!"
