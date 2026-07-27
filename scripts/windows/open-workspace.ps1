<#
.SYNOPSIS
Opens the isolated workspace in Explorer or prints it in dry-run mode.
#>
[CmdletBinding()]
param([switch]$DryRun)

$workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if ($DryRun) {
    Write-Output "Would open $workspace"
    exit 0
}
Start-Process -FilePath 'explorer.exe' -ArgumentList $workspace
