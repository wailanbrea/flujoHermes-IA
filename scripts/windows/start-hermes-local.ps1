[CmdletBinding()]
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$HermesArguments
)

$ErrorActionPreference = 'Stop'

$forbiddenArguments = @('--yolo', '--oneshot', '-z')
$requestedForbiddenArguments = @(
    $HermesArguments | Where-Object { $_ -in $forbiddenArguments }
)
if ($requestedForbiddenArguments.Count -gt 0) {
    throw "Modo Hermes prohibido por la política local: $($requestedForbiddenArguments -join ', '). Use el CLI interactivo con aprobaciones manuales."
}

& (Join-Path $PSScriptRoot 'prepare-hermes-model.ps1')
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
& hermes.exe --profile localai @HermesArguments
exit $LASTEXITCODE
