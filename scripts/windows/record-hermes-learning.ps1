<#
.SYNOPSIS
Records a sanitized lesson only for a successfully completed task.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [string]$TaskId,

    [Parameter(Mandatory)]
    [string]$Domain,

    [Parameter(Mandatory)]
    [string]$ProblemPattern,

    [Parameter(Mandatory)]
    [string]$RootCause,

    [Parameter(Mandatory)]
    [string]$SolutionSummary,

    [Parameter(Mandatory)]
    [ValidateCount(1, 30)]
    [string[]]$PassedCommands,

    [string]$RelatedSkill = '',

    [string]$BenchmarkResult = ''
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$root = Get-OrchestratorRoot
$taskDirectory = Get-TaskDirectory -TaskId $TaskId
$status = Get-TaskStatus -TaskDirectory $taskDirectory
if ($status.state -ne 'completed' -or -not [bool]$status.validationPassed) {
    throw 'Learning can only be recorded after successful independent validation.'
}
$patchEvidence = Read-JsonFile -Path (
    Join-Path $taskDirectory 'patch-validation.json'
)
$patchPath = Join-Path $taskDirectory 'changes.patch'
if (
    -not [bool]$patchEvidence.passed -or
    -not (Test-Path -LiteralPath $patchPath -PathType Leaf) -or
    (Get-FileSha256 -Path $patchPath) -ne ([string]$patchEvidence.patchSha256)
) {
    throw 'Learning requires intact sealed patch evidence.'
}

$previousPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = Join-Path $root 'src'
    $arguments = @(
        '-3', '-m', 'hermes_brain.cli', 'record-learning',
        '--repo', $root,
        '--task-id', $TaskId,
        '--domain', $Domain,
        '--problem-pattern', $ProblemPattern,
        '--root-cause', $RootCause,
        '--solution-summary', $SolutionSummary
    )
    foreach ($command in $PassedCommands) {
        $arguments += @('--passed-command', $command)
    }
    foreach ($file in @($patchEvidence.files)) {
        $arguments += @('--file', [string]$file)
    }
    if ($RelatedSkill) {
        $arguments += @('--related-skill', $RelatedSkill)
    }
    if ($BenchmarkResult) {
        $arguments += @('--benchmark-result', $BenchmarkResult)
    }
    & py.exe @arguments
    if ($LASTEXITCODE -ne 0) {
        throw 'Hermes Brain rejected the learning record.'
    }
}
finally {
    $env:PYTHONPATH = $previousPythonPath
}
