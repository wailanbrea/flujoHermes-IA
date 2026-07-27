<#
.SYNOPSIS
Creates a timestamped archive of non-secret workspace configuration.
.PARAMETER DryRun
Lists source and destination without creating an archive.
#>
[CmdletBinding()]
param([switch]$DryRun)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$destination = Join-Path $workspace "backups\orchestrator-config-$timestamp.zip"
$sources = @(
    (Join-Path $workspace 'config'),
    (Join-Path $workspace 'docs'),
    (Join-Path $workspace 'scripts'),
    (Join-Path $workspace 'templates'),
    (Join-Path $workspace 'AGENTS.md'),
    (Join-Path $workspace 'GLOBAL_RULES.md'),
    (Join-Path $workspace 'SECURITY_RULES.md')
)
if ($DryRun) {
    Write-Output "Would archive non-secret configuration to $destination"
    exit 0
}
Compress-Archive -LiteralPath $sources -DestinationPath $destination
Write-Output "Backup created: $destination"
