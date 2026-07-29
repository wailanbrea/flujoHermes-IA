[CmdletBinding()]
param(
    [ValidateSet('gemma', 'qwen')]
    [string]$Model = 'gemma',

    [string]$LmsExecutable = 'lms.exe'
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

$loaded = @(& $LmsExecutable ps --json | ConvertFrom-Json)
if ($LASTEXITCODE -ne 0) {
    throw 'LM Studio could not list loaded models.'
}

$targets = @($loaded | Where-Object {
    $_.type -eq 'llm' -and $_.modelKey -eq $modelKey
})
$conflicts = @(
    $loaded | Where-Object {
        $_.type -eq 'llm' -and $_.modelKey -ne $modelKey
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
$verifiedLlms = @($verified | Where-Object { $_.type -eq 'llm' })
$verifiedTarget = @($verifiedLlms | Where-Object {
    $_.modelKey -eq $modelKey -and
    [int64]$_.contextLength -eq $contextLength -and
    [int]$_.parallel -eq $parallel
})
if ($verifiedLlms.Count -ne 1 -or $verifiedTarget.Count -ne 1) {
    throw 'LM Studio did not finish with exactly one safely configured language model.'
}

Write-Output (
    "Hermes model loaded: $modelKey; context $contextLength; " +
    "parallel $parallel; GPU $gpuOffload; MTP disabled."
)
