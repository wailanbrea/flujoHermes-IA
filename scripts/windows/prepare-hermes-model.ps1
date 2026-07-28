[CmdletBinding()]
param(
    [ValidateSet('gemma', 'qwen')]
    [string]$Model = 'gemma'
)

$ErrorActionPreference = 'Stop'
$contextLength = 65536
$parallel = 1
if ($Model -eq 'qwen') {
    $modelKey = 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive'
    $gpuOffload = '0.50'
}
else {
    $modelKey = 'google/gemma-4-12b'
    $gpuOffload = 'max'
}

$loaded = @(& lms.exe ps --json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio could not list loaded models.'
}

$target = @($loaded | Where-Object { $_.modelKey -eq $modelKey })[0]
$conflicts = @(
    $loaded | Where-Object {
        $_.type -eq 'llm' -and $_.modelKey -ne $modelKey
    }
)
foreach ($conflict in $conflicts) {
    & lms.exe unload $conflict.identifier
    if ($LASTEXITCODE -ne 0) {
        throw 'LM Studio could not unload a conflicting language model.'
    }
}

$safeTarget = $target -and
    [int64]$target.contextLength -eq $contextLength -and
    [int]$target.parallel -eq $parallel
if ($safeTarget) {
    Write-Output (
        "Hermes model already ready: $modelKey; context $contextLength; " +
        "parallel $parallel; GPU preset $gpuOffload."
    )
    exit 0
}
if ($target) {
    & lms.exe unload $target.identifier
    if ($LASTEXITCODE -ne 0) {
        throw 'LM Studio could not unload the unsafe target instance.'
    }
}

& lms.exe load $modelKey `
    --identifier $modelKey `
    --context-length $contextLength `
    --parallel $parallel `
    --gpu $gpuOffload `
    --no-speculative-draft-mtp `
    --yes
if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio could not load the selected Hermes model safely.'
}

Write-Output (
    "Hermes model loaded: $modelKey; context $contextLength; " +
    "parallel $parallel; GPU $gpuOffload; MTP disabled."
)