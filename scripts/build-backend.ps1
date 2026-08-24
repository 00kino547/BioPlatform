#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Write-Host "==> Building Backend Image"
docker build -t dracoservices/bioplatform-backend -f apps/backend/Dockerfile .

if ($LASTEXITCODE -ne 0) { throw "Backend build failed" }
Write-Host "==> Image complete!"
