<#
.SYNOPSIS
Checks the local AI environment without changing it.
.PARAMETER DryRun
Lists the checks without executing them.
#>
[CmdletBinding()]
param([switch]$DryRun)

if ($DryRun) {
    Write-Output 'Would check LM Studio, Hermes localai, WSL2 and Docker.'
    exit 0
}
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File `
    (Join-Path (Split-Path $PSScriptRoot -Parent) 'health\check-all.ps1')
exit $LASTEXITCODE
