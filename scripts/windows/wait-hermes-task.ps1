<#
.SYNOPSIS
Blocks until one Hermes task reaches a reviewable state, then renders its digest.

.DESCRIPTION
Waiting by repeatedly reading status.json costs a full director round trip per
poll. This waits inside a single tool call, reading the status file locally, and
returns the bounded review digest as soon as the task settles. The default
timeout stays inside the tool-call budget of an AI director, so a call always
returns something actionable: either the digest or a one-line progress report
that can be resumed with an identical call.

.PARAMETER TaskId
Identifier returned by submit-hermes-task.ps1.

.PARAMETER TimeoutSeconds
Upper bound for this wait. Not the task's own timeout, which the contract owns.

.PARAMETER PollSeconds
Local status-file poll interval. Costs nothing to the director.

.PARAMETER AsJson
Emits the structured digest instead of the terser text rendering.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$TaskId,

    [ValidateRange(10, 570)]
    [int]$TimeoutSeconds = 540,

    [ValidateRange(2, 30)]
    [int]$PollSeconds = 5,

    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

# Listed by what is still moving rather than by what has settled, so an unknown
# or legacy state ends the wait instead of blocking until the timeout.
$runningStates = @('queued', 'preparing', 'executing')

$taskDirectory = Get-TaskDirectory -TaskId $TaskId
$deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
$status = Get-TaskStatus -TaskDirectory $taskDirectory
$state = [string](Get-JsonProperty -Object $status -Name 'state' -Default 'unknown')

while ($state -in $runningStates -and [DateTime]::UtcNow -lt $deadline) {
    Start-Sleep -Seconds $PollSeconds
    $status = Get-TaskStatus -TaskDirectory $taskDirectory
    $state = [string](Get-JsonProperty -Object $status -Name 'state' -Default 'unknown')
}

if ($state -in $runningStates) {
    $progress = [ordered]@{
        taskId = $TaskId
        state = $state
        settled = $false
        elapsedSeconds = [int](Get-JsonProperty -Object $status -Name 'elapsedSeconds' -Default 0)
        noProgressSeconds = [int](Get-JsonProperty -Object $status -Name 'noProgressSeconds' -Default 0)
        progressKind = [string](Get-JsonProperty -Object $status -Name 'progressKind' -Default 'unknown')
        nextAction = 'Still running. Repeat this exact call to keep waiting.'
    }
    if ($AsJson) {
        $progress | ConvertTo-Json -Depth 4 -Compress
    }
    else {
        Write-Output (
            '{0} state={1} elapsed={2}s no-progress={3}s kind={4}' -f
                $progress.taskId, $progress.state, $progress.elapsedSeconds,
                $progress.noProgressSeconds, $progress.progressKind
        )
        Write-Output ('next: ' + $progress.nextAction)
    }
    return
}

$briefScript = Join-Path $PSScriptRoot 'get-hermes-brief.ps1'
if ($AsJson) {
    & $briefScript -TaskId $TaskId -AsJson
}
else {
    & $briefScript -TaskId $TaskId
}
