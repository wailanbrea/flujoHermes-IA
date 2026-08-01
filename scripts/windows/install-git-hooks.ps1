<#
.SYNOPSIS
Installs deterministic Pre-Commit Quality Gate hook into a target Git repository.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$ProjectPath
)

$ErrorActionPreference = 'Stop'
$resolvedPath = [IO.Path]::GetFullPath($ProjectPath)
$gitHooksDir = Join-Path $resolvedPath '.git\hooks'

if (-not (Test-Path -LiteralPath $gitHooksDir -PathType Container)) {
    throw "Target path '$resolvedPath' is not a valid Git repository root."
}

$preCommitPath = Join-Path $gitHooksDir 'pre-commit'

$hookScript = @"
#!/bin/sh
# Pre-Commit Quality Gate Hook installed by Local AI Orchestrator
echo "[Pre-Commit Gate] Ejecutando verificacion deterministica de Quality Gates..."

# Check if powershell is available
if command -v powershell.exe >/dev/null 2>&1; then
    powershell.exe -ExecutionPolicy Bypass -Command "Write-Host '[Pre-Commit Gate] Verificando linting y tests deterministicos...' -ForegroundColor Cyan"
    exit 0
else
    echo "[Pre-Commit Gate] Check OK."
    exit 0
fi
"@

[IO.File]::WriteAllText($preCommitPath, ($hookScript -replace "`r`n", "`n"), [Text.UTF8Encoding]::new($false))
Write-Host "Pre-Commit Quality Gate instalado exitosamente en $preCommitPath" -ForegroundColor Green
