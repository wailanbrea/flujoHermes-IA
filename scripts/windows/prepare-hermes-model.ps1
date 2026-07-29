[CmdletBinding()]
param(
    [ValidateSet('gemma', 'qwen')]
    [string]$Model = 'gemma',

    [string]$LmsExecutable = 'lms.exe'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$contextLength = 65536
$parallel = 1
# The key itself comes from the shared map so this script and the task worker can
# never disagree about which model an alias means.
$modelKey = Get-HermesModelKey -Alias $Model
$gpuOffload = if ($Model -eq 'qwen') { '0.50' } else { 'max' }

$loaded = @(& $LmsExecutable ps --json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio could not list loaded models.'
}

# LM Studio omits fields on some entries, and this script now runs under the
# shared strict mode, so every field is read through the tolerant accessor.
$targets = @($loaded | Where-Object {
    (Get-JsonProperty -Object $_ -Name 'type') -eq 'llm' -and
    (Get-JsonProperty -Object $_ -Name 'modelKey') -eq $modelKey
})
$conflicts = @(
    $loaded | Where-Object {
        (Get-JsonProperty -Object $_ -Name 'type') -eq 'llm' -and
        (Get-JsonProperty -Object $_ -Name 'modelKey') -ne $modelKey
    }
)
foreach ($conflict in $conflicts) {
    $conflictIdentifier = [string]$conflict.identifier
    if (-not $conflictIdentifier) {
        throw 'A loaded language model has no unload identifier.'
    }
    & $LmsExecutable unload $conflictIdentifier
    if ($LASTEXITCODE -ne 0) {
        throw 'LM Studio could not unload a conflicting language model.'
    }
}
foreach ($unsafeTarget in $targets) {
    $targetIdentifier = [string]$unsafeTarget.identifier
    if (-not $targetIdentifier) {
        throw 'The target language model has no unload identifier.'
    }
    & $LmsExecutable unload $targetIdentifier
    if ($LASTEXITCODE -ne 0) {
        throw 'LM Studio could not unload the unsafe target instance.'
    }
}

& $LmsExecutable load $modelKey `
    --identifier $modelKey `
    --context-length $contextLength `
    --parallel $parallel `
    --gpu $gpuOffload `
    --no-speculative-draft-mtp `
    --yes
if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio could not load the selected Hermes model safely.'
}

$verified = @(& $LmsExecutable ps --json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio could not verify the loaded Hermes model.'
}
$verifiedLlms = @($verified | Where-Object {
    (Get-JsonProperty -Object $_ -Name 'type') -eq 'llm'
})
$verifiedTarget = @($verifiedLlms | Where-Object {
    (Get-JsonProperty -Object $_ -Name 'modelKey') -eq $modelKey -and
    [int64](Get-JsonProperty -Object $_ -Name 'contextLength' -Default 0) -eq $contextLength -and
    [int](Get-JsonProperty -Object $_ -Name 'parallel' -Default 0) -eq $parallel
})
if ($verifiedLlms.Count -ne 1 -or $verifiedTarget.Count -ne 1) {
    throw 'LM Studio did not finish with exactly one safely configured language model.'
}

Write-Output (
    "Hermes model loaded: $modelKey; context $contextLength; " +
    "parallel $parallel; GPU $gpuOffload; MTP disabled."
)
