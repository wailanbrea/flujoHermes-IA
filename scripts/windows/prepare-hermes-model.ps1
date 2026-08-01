[CmdletBinding()]
param(
    [ValidateSet('gemma', 'gemma-qat', 'agents-a1', 'qwen')]
    [string]$Model = 'gemma',

    [string]$LmsExecutable = 'lms.exe'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

# Measured before raising this: at 65536 context, parallel 4 costs +0.95 GiB
# dedicated VRAM on gemma (10.99 -> 11.94 GiB, still 4 GiB of headroom on the
# 16 GiB card) and +0.13 GiB on qwen (14.21 -> 14.34 GiB). A single in-flight
# request is unaffected (59.7 vs 61.3 tok/s, within run-to-run noise), and two
# or more concurrent Hermes tasks against the same loaded model go from 58.8 to
# 87.5 aggregate tok/s. Hermes issues one request at a time within a task, so
# the gain only pays off once the orchestrator runs more than one task at once.
$contextLength = 65536
$parallel = 4
# The key itself comes from the shared map so this script and the task worker can
# never disagree about which model an alias means.
$modelKey = Get-HermesModelKey -Alias $Model
# Only the 35B exceeds the card and has to be split; the 12B builds fit whole.
$gpuOffload = if ($Model -eq 'qwen') { '0.50' } else { 'max' }
# The primary model is intentionally resident. The manually selected 35B is
# evicted after fifteen idle minutes so its RAM/VRAM split cannot linger.
$ttlSeconds = if ($Model -eq 'qwen') { 900 } else { $null }

function Get-LoadedModels([string]$Executable) {
    $result = Invoke-NativeCommand -Executable $Executable -Arguments @('ps', '--json')
    if ($result.ExitCode -ne 0) {
        throw 'LM Studio could not list loaded models.'
    }
    return @(ConvertFrom-JsonArray -Json $result.Output)
}

function Remove-LoadedModel(
    [string]$Executable,
    [object]$Entry,
    [string]$FailureMessage
) {
    $identifier = [string](Get-JsonProperty -Object $Entry -Name 'identifier')
    if (-not $identifier) {
        throw 'A loaded language model has no unload identifier.'
    }
    $result = Invoke-NativeCommand `
        -Executable $Executable `
        -Arguments @('unload', $identifier)
    if ($result.ExitCode -ne 0) {
        throw $FailureMessage
    }
}

# `lms.exe load` resolves an unknown key by substring match against whatever is
# on disk and silently loads that instead - confirmed by loading the alias's
# old key after its model was removed: it loaded gemma-4-12b-qat while
# reporting the identifier as the stale key, so `ps --json`'s own modelKey
# field was the only place the substitution was visible. The API's
# /api/v0/models endpoint does not expose modelKey at all, so a per-task
# verification after load cannot detect this. The only reliable point to catch
# it is here, against the on-disk catalog, before load ever runs.
$catalogResult = Invoke-NativeCommand -Executable $LmsExecutable -Arguments @('ls', '--json')
if ($catalogResult.ExitCode -ne 0) {
    throw 'LM Studio could not list the on-disk model catalog.'
}
$catalog = @(ConvertFrom-JsonArray -Json $catalogResult.Output)
$catalogKeys = @($catalog | ForEach-Object {
    [string](Get-JsonProperty -Object $_ -Name 'modelKey')
})
if ($modelKey -notin $catalogKeys) {
    $available = if ($catalogKeys.Count -gt 0) { $catalogKeys -join ', ' } else { 'none' }
    throw (
        "Model alias '$Model' resolves to '$modelKey', which is not on disk. " +
        "Available: $available. Update Get-HermesModelKey in " +
        'hermes-task-common.ps1 or download the model before retrying.'
    )
}

$loaded = @(Get-LoadedModels -Executable $LmsExecutable)

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
    Remove-LoadedModel `
        -Executable $LmsExecutable `
        -Entry $conflict `
        -FailureMessage 'LM Studio could not unload a conflicting language model.'
}
# An already-loaded instance of the target is unloaded too: its context length,
# parallelism and MTP settings are unknown, and `lms load` refuses a duplicate
# identifier outright.
foreach ($unsafeTarget in $targets) {
    Remove-LoadedModel `
        -Executable $LmsExecutable `
        -Entry $unsafeTarget `
        -FailureMessage 'LM Studio could not unload the unsafe target instance.'
}

$loadArguments = @(
        'load', $modelKey,
        '--identifier', $modelKey,
        '--context-length', [string]$contextLength,
        '--parallel', [string]$parallel,
        '--gpu', $gpuOffload,
        '--no-speculative-draft-mtp'
)
if ($null -ne $ttlSeconds) {
    $loadArguments += @('--ttl', [string]$ttlSeconds)
}
$loadArguments += '--yes'
$loadResult = Invoke-NativeCommand `
    -Executable $LmsExecutable `
    -Arguments @($loadArguments)
if ($loadResult.ExitCode -ne 0) {
    throw 'LM Studio could not load the selected Hermes model safely.'
}

$verified = @(Get-LoadedModels -Executable $LmsExecutable)
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
    "parallel $parallel; GPU $gpuOffload; " +
    $(if ($null -eq $ttlSeconds) { 'resident' } else { "TTL ${ttlSeconds}s" }) +
    '; MTP disabled.'
)
