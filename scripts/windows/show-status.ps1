<#
.SYNOPSIS
Shows sanitized local service and dashboard status.
#>
[CmdletBinding()]
param()

& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
    (Join-Path (Split-Path $PSScriptRoot -Parent) 'health\check-all.ps1')
$healthExit = $LASTEXITCODE
& (Join-Path $PSScriptRoot 'status-dashboard.ps1')
if ($healthExit -eq 1 -or $LASTEXITCODE -eq 1) { exit 1 }
if ($healthExit -eq 2) { exit 2 }
exit 0
