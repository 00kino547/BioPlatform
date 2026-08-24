#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

## Frontend Image
& "$PSScriptRoot\build-frontend.ps1"
## Backend Image
& "$PSScriptRoot\build-backend.ps1"
