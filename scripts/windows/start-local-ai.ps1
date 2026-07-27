<#
.SYNOPSIS
Starts the local dashboard and optionally prepares the bounded Hermes model.
.PARAMETER SkipModel
Starts observability without loading the 20.5 GiB model.
.PARAMETER DryRun
Shows planned actions only.
#>
[CmdletBinding()]
param([switch]$SkipModel, [switch]$DryRun)

$ErrorActionPreference = 'Stop'
if ($DryRun) {
    Write-Output "Would start dashboard on 127.0.0.1:4310/4311."
    if (-not $SkipModel) {
        Write-Output 'Would load the Hermes model with 64K context and parallel 1.'
    }
    exit 0
}

if (-not $SkipModel) {
    & (Join-Path $PSScriptRoot 'prepare-hermes-model.ps1')
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
& (Join-Path $PSScriptRoot 'start-dashboard.ps1')
exit $LASTEXITCODE
