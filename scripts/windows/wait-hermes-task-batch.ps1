<#
.SYNOPSIS
Waits on every task in a batch and renders each one's bounded review digest.

.DESCRIPTION
Mirrors wait-hermes-task.ps1's one-call design for a single task, extended to
however many task IDs a batch produced (at most 2). Polling N status.json files
locally costs nothing; the alternative — the director calling
wait-hermes-task.ps1 once per task — would cost N tool-call round trips instead
of one.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateCount(1, 2)]
    [string[]]$TaskIds,

    [ValidateRange(10, 570)]
    [int]$TimeoutSeconds = 540,

    [ValidateRange(2, 30)]
    [int]$PollSeconds = 5
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$runningStates = @('queued', 'preparing', 'executing')
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)

function Get-TaskState([string]$TaskId) {
    $status = Get-TaskStatus -TaskDirectory (Get-TaskDirectory -TaskId $TaskId)
    return [string](Get-JsonProperty -Object $status -Name 'state' -Default 'unknown')
}

$states = @{}
foreach ($taskId in $TaskIds) {
    $states[$taskId] = Get-TaskState -TaskId $taskId
}

while (
    (@($states.Values) | Where-Object { $_ -in $runningStates }).Count -gt 0 -and
    [DateTime]::UtcNow -lt $deadline
) {
    Start-Sleep -Seconds $PollSeconds
    foreach ($taskId in $TaskIds) {
        $states[$taskId] = Get-TaskState -TaskId $taskId
    }
}

$briefScript = Join-Path $PSScriptRoot 'get-hermes-brief.ps1'
$settledCount = (@($states.Values) | Where-Object { $_ -notin $runningStates }).Count

foreach ($taskId in $TaskIds) {
    if ($states[$taskId] -in $runningStates) {
        Write-Output (
            '{0} state={1} — still running; call wait-hermes-task.ps1 -TaskId {0} to keep waiting.' -f
                $taskId, $states[$taskId]
        )
    }
    else {
        & $briefScript -TaskId $taskId
    }
    Write-Output '---'
}
Write-Output (
    '{0}/{1} tasks settled.' -f $settledCount, $TaskIds.Count
)
