<#
.SYNOPSIS
Queues up to two Hermes tasks to run concurrently against the same model.

.DESCRIPTION
LM Studio now loads every model with parallelism 4, measured this session to
give roughly 1.5x aggregate throughput with concurrent requests and no cost to
a single in-flight one. Nothing in the delegation flow used that before: every
task ran one at a time. This is the tooling that actually uses it, capped at
two tasks because throughput beyond two concurrent requests has not been
measured.

The director prepares the model once (prepare-hermes-model.ps1) before calling
this; it is not called automatically here, matching how submit-hermes-task.ps1
itself never prepares a model on the director's behalf.

.PARAMETER ProjectPath
Shared across every task in the batch: they must all land in the same
authorized project, since they are meant to be pieces of one larger objective.

.PARAMETER Tasks
One hashtable per task, each accepting the same per-task keys as
submit-hermes-task.ps1: Objective, AcceptanceCriteria, Constraints,
AllowedFiles, MaxAddedLines, MaxRemovedLines, MaxPatchBytes,
AllowLiteralEscapedNewlines. AllowedFiles must be pairwise disjoint across
tasks - two concurrent Hermes agents editing the same file in separate
worktrees would each patch it blind to the other's change.

.PARAMETER Model
Applies to every task in the batch. Mixing models is refused: qwen alone is
20.55 GiB against a 16 GiB card, so loading it alongside anything else would
either fail to fit or force LM Studio to thrash between them, defeating the
point of running them concurrently.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$ProjectPath,

    [Parameter(Mandatory)]
    [ValidateCount(1, 2)]
    [hashtable[]]$Tasks,

    [ValidateSet('plan', 'edit', 'browser')]
    [string]$Phase = 'edit',

    [ValidateSet('gemma', 'gemma-qat', 'qwen')]
    [string]$Model = 'gemma',

    [ValidateSet('Codex', 'Claude', 'Antigravity', 'OpenCode')]
    [string]$RequestedBy = 'Codex',

    [ValidateRange(5, 18)]
    [int]$MaxTurns = 18,

    [ValidateRange(60, 3600)]
    [int]$TimeoutSeconds = 1200,

    [ValidateRange(60, 900)]
    [int]$NoProgressTimeoutSeconds = 180,

    [ValidateRange(60, 1800)]
    [int]$ReadOnlyStallSeconds = 300,

    [switch]$ModificationAuthorized
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

# Two concurrent Hermes agents editing the same file in separate worktrees
# would each patch it blind to the other's change, and the source repository
# would only ever see one of them applied cleanly.
$seenFiles = [Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase
)
foreach ($task in $Tasks) {
    foreach ($file in @($task.AllowedFiles)) {
        $normalized = ([string]$file).Trim().Replace('\', '/')
        if (-not $seenFiles.Add($normalized)) {
            throw (
                "File '$normalized' is claimed by more than one task in this " +
                'batch. Concurrent tasks must edit disjoint files.'
            )
        }
    }
}

$taskIds = [Collections.Generic.List[string]]::new()
$taskDirectories = [Collections.Generic.List[string]]::new()
try {
    foreach ($task in $Tasks) {
        $submitParams = [ordered]@{
            ProjectPath              = $ProjectPath
            Objective                = $task.Objective
            AcceptanceCriteria       = @($task.AcceptanceCriteria)
            Phase                    = $Phase
            Mode                     = if ($Phase -eq 'edit') { 'execute' } else { 'analysis' }
            Model                    = $Model
            RequestedBy              = $RequestedBy
            MaxTurns                 = $MaxTurns
            TimeoutSeconds           = $TimeoutSeconds
            NoProgressTimeoutSeconds = $NoProgressTimeoutSeconds
            ReadOnlyStallSeconds     = $ReadOnlyStallSeconds
            ModificationAuthorized   = $ModificationAuthorized.IsPresent
            # Queue only; workers start together below once every task in the
            # batch has been validated and persisted, so a rejected second task
            # can never leave the first one running alone under the assumption
            # its sibling would follow.
            DeferWorker              = $true
        }
        if ($task.ContainsKey('Constraints')) {
            $submitParams['Constraints'] = @($task.Constraints)
        }
        if ($task.ContainsKey('AllowedFiles')) {
            $submitParams['AllowedFiles'] = @($task.AllowedFiles)
        }
        if ($task.ContainsKey('MaxAddedLines')) {
            $submitParams['MaxAddedLines'] = [int]$task.MaxAddedLines
        }
        if ($task.ContainsKey('MaxRemovedLines')) {
            $submitParams['MaxRemovedLines'] = [int]$task.MaxRemovedLines
        }
        if ($task.ContainsKey('MaxPatchBytes')) {
            $submitParams['MaxPatchBytes'] = [int]$task.MaxPatchBytes
        }
        if ($task.ContainsKey('AllowLiteralEscapedNewlines')) {
            $submitParams['AllowLiteralEscapedNewlines'] =
                [bool]$task.AllowLiteralEscapedNewlines
        }

        $submitScript = Join-Path $PSScriptRoot 'submit-hermes-task.ps1'
        $result = & $submitScript @submitParams
        $status = $result | ConvertFrom-Json
        $taskIds.Add([string]$status.taskId)
        $taskDirectories.Add((Get-TaskDirectory -TaskId $status.taskId))
    }
}
catch {
    # A later task in the batch failed validation; nothing that already queued
    # should run alone, since the batch was scoped as one unit of work.
    foreach ($taskDirectory in $taskDirectories) {
        if (Test-Path -LiteralPath $taskDirectory) {
            Remove-Item -LiteralPath $taskDirectory -Recurse -Force
        }
    }
    throw
}

foreach ($taskId in $taskIds) {
    Start-HermesWorker -TaskId $taskId
}

[pscustomobject]@{
    taskIds = @($taskIds)
    model = $Model
} | ConvertTo-Json -Compress
