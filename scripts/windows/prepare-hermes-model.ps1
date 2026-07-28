[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$model = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive'
$gpuOffload = 0.70
$loaded = @(& lms.exe ps --json | ConvertFrom-Json)
$target = $loaded | Where-Object { $_.modelKey -eq $model } | Select-Object -First 1

if ($target -and [int64]$target.contextLength -eq 65536 -and [int]$target.parallel -eq 1) {
    Write-Output 'Modelo de Hermes ya cargado con 64K y paralelo 1.'
    exit 0
}

if ($target) {
    & lms.exe unload $target.identifier
    if ($LASTEXITCODE -ne 0) {
        throw 'No fue posible descargar la instancia insegura del modelo.'
    }
}

& lms.exe load $model `
    --identifier $model `
    --context-length 65536 `
    --parallel 1 `
    --gpu $gpuOffload `
    --no-speculative-draft-mtp `
    --yes
if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio no pudo cargar el modelo con límites seguros.'
}
Write-Output "Modelo de Hermes cargado con 64K, paralelo 1 y GPU $gpuOffload."
