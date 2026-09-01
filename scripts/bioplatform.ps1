#!/usr/bin/env pwsh
Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

docker compose exec -T backend bioplatform @args
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }