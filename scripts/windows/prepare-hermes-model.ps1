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

$loadResult = Invoke-NativeCommand `
    -Executable $LmsExecutable `
    -Arguments @(
        'load', $modelKey,
        '--identifier', $modelKey,
        '--context-length', [string]$contextLength,
        '--parallel', [string]$parallel,
        '--gpu', $gpuOffload,
        '--no-speculative-draft-mtp',
        '--yes'
    )
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
    "parallel $parallel; GPU $gpuOffload; MTP disabled."
)
