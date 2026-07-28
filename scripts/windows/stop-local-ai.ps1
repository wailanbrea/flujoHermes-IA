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

$models = @(
    'google/gemma-4-12b',
    'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive'
)
if ($DryRun) {
    Write-Output 'Would stop workspace-owned dashboard processes.'
    if (-not $KeepModel) { Write-Output "Would unload Hermes language models." }
    exit 0
}

& (Join-Path $PSScriptRoot 'stop-dashboard.ps1')
if (-not $KeepModel) {
    $loaded = @(& lms.exe ps --json | ConvertFrom-Json)
    $targets = @($loaded | Where-Object { $_.modelKey -in $models })
    foreach ($target in $targets) {
        & lms.exe unload $target.identifier
    }
}
exit 0
