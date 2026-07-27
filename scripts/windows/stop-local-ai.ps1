<#
.SYNOPSIS
Stops workspace-owned dashboard processes and optionally unloads its model.
.PARAMETER KeepModel
Leaves the LM Studio model loaded.
.PARAMETER DryRun
Shows planned actions only.
#>
[CmdletBinding()]
param([switch]$KeepModel, [switch]$DryRun)

$model = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive'
if ($DryRun) {
    Write-Output 'Would stop workspace-owned dashboard processes.'
    if (-not $KeepModel) { Write-Output "Would unload $model." }
    exit 0
}

& (Join-Path $PSScriptRoot 'stop-dashboard.ps1')
if (-not $KeepModel) {
    $loaded = @(& lms.exe ps --json | ConvertFrom-Json)
    $target = $loaded | Where-Object { $_.modelKey -eq $model } | Select-Object -First 1
    if ($target) { & lms.exe unload $target.identifier }
}
exit 0
