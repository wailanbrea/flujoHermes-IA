<#
.SYNOPSIS
Releases isolated worktrees left behind by Hermes tasks that ended in a terminal
state and were never reviewed.

.DESCRIPTION
Only review-hermes-task.ps1 releases a worktree, so a task that fails and is
never reviewed keeps its worktree and its Git metadata forever. The failure path
deliberately leaves the workspace in place for post-mortem inspection; this is
the maintenance step that eventually reclaims it.

.PARAMETER MinimumAgeHours
Leaves recent failures alone so a post-mortem is still possible. Zero reclaims
every terminal task immediately.

.PARAMETER WhatIf
Reports what would be released without touching anything.
#>
[CmdletBinding()]
param(
    [ValidateRange(0, 8760)]
    [int]$MinimumAgeHours = 24,

    [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

# A task in one of these states will never be resumed, so its worktree is dead
# weight. Anything still queued, preparing, executing or awaiting a decision is
# left untouched.
$terminalStates = @('failed', 'blocked', 'completed', 'rejected')

$runtimeRoot = Get-HermesRuntimeRoot
if (-not (Test-Path -LiteralPath $runtimeRoot -PathType Container)) {
    Write-Output 'No Hermes task history to prune.'
    return
}

$cutoff = [DateTime]::UtcNow.AddHours(-$MinimumAgeHours)
$released = 0
$skipped = 0
$failures = [Collections.Generic.List[string]]::new()

foreach ($taskDirectory in Get-ChildItem -LiteralPath $runtimeRoot -Directory) {
    $statusPath = Join-Path $taskDirectory.FullName 'status.json'
    if (-not (Test-Path -LiteralPath $statusPath -PathType Leaf)) { continue }

    try {
        $status = Read-JsonFile -Path $statusPath
        $contract = Read-JsonFile -Path (
            Join-Path $taskDirectory.FullName 'contract.json'
        )
    }
    catch {
        continue
    }

    $state = [string](Get-JsonProperty -Object $status -Name 'state' -Default '')
    if ($state -notin $terminalStates) { continue }

    $worktreePath = [string](
        Get-JsonProperty -Object $status -Name 'worktreePath' -Default ''
    )
    if (-not $worktreePath -or -not (Test-Path -LiteralPath $worktreePath)) {
        continue
    }

    $updatedAt = [string](Get-JsonProperty -Object $status -Name 'updatedAt' -Default '')
    if ($updatedAt) {
        try {
            $updated = [DateTime]::Parse(
                $updatedAt,
                [Globalization.CultureInfo]::InvariantCulture,
                [Globalization.DateTimeStyles]::AdjustToUniversal
            )
            if ($updated -gt $cutoff) {
                $skipped += 1
                continue
            }
        }
        catch {
            # An unreadable timestamp is not a reason to keep the worktree.
        }
    }

    $projectRoot = [string](
        Get-JsonProperty -Object $contract -Name 'projectRoot' -Default ''
    )
    if (-not $projectRoot -or -not (Test-Path -LiteralPath $projectRoot)) {
        continue
    }

    if ($WhatIf) {
        Write-Output ('would release {0} ({1})' -f $taskDirectory.Name, $state)
        $released += 1
        continue
    }

    try {
        Remove-TaskWorktree -ProjectRoot $projectRoot -WorktreePath $worktreePath
        Remove-TaskExchange -TaskId $taskDirectory.Name
        Set-TaskStatus `
            -TaskDirectory $taskDirectory.FullName `
            -State $state `
            -Message 'Espacio aislado liberado por mantenimiento.' `
            -Fields @{ worktreeActive = $false }
        $released += 1
    }
    catch {
        $failures.Add(('{0}: {1}' -f $taskDirectory.Name, $_.Exception.Message))
    }
}

[pscustomobject]@{
    released = $released
    skippedTooRecent = $skipped
    failed = $failures.Count
    failures = @($failures)
    whatIf = $WhatIf.IsPresent
} | ConvertTo-Json -Depth 3 -Compress
