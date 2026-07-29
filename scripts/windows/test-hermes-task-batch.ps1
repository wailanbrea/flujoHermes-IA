<#
.SYNOPSIS
Covers submit-hermes-task-batch.ps1 and wait-hermes-task-batch.ps1.

.DESCRIPTION
The batch exists to run up to two Hermes tasks concurrently against the same
model, so the assertions that matter are the safety properties: disjoint
AllowedFiles are required, a rejected task never leaves its sibling queued
alone, and more than two tasks is refused outright.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$env:HERMES_TEST_DEFER_WORKER = '1'
$batchTaskIds = [Collections.Generic.List[string]]::new()

try {
    $submitScript = Join-Path $PSScriptRoot 'submit-hermes-task-batch.ps1'
    $waitScript = Join-Path $PSScriptRoot 'wait-hermes-task-batch.ps1'
    $orchestratorRoot = Get-OrchestratorRoot

    # --- Happy path: two tasks, disjoint files, same model -----------------
    $happyResult = & $submitScript `
        -ProjectPath $orchestratorRoot `
        -Model gemma-qat `
        -ModificationAuthorized `
        -Tasks @(
            @{
                Objective = 'Batch test task A: touches README.md only.'
                AcceptanceCriteria = @('n/a')
                AllowedFiles = @('README.md')
                MaxAddedLines = 10
                MaxRemovedLines = 10
            },
            @{
                Objective = 'Batch test task B: touches AGENTS.md only.'
                AcceptanceCriteria = @('n/a')
                AllowedFiles = @('AGENTS.md')
                MaxAddedLines = 10
                MaxRemovedLines = 10
            }
        ) | ConvertFrom-Json
    $batchTaskIds.AddRange([string[]]$happyResult.taskIds)
    Assert-Condition ($happyResult.taskIds.Count -eq 2) 'The happy-path batch did not queue two tasks.'
    foreach ($taskId in $happyResult.taskIds) {
        $contract = Read-JsonFile -Path (
            Join-Path (Get-TaskDirectory -TaskId $taskId) 'contract.json'
        )
        Assert-Condition `
            ($contract.model -eq 'gemma-qat') `
            'A batch task did not carry the batch-level model.'
        Assert-Condition `
            ($contract.phase -eq 'edit' -and $contract.mode -eq 'execute') `
            'A batch task did not default to the edit/execute phase.'
    }

    # --- wait-hermes-task-batch.ps1 renders both, even mid-run --------------
    $waitOutput = & $waitScript -TaskIds @($happyResult.taskIds) -TimeoutSeconds 10 |
        Out-String
    foreach ($taskId in $happyResult.taskIds) {
        Assert-Condition `
            ($waitOutput.Contains($taskId)) `
            "wait-hermes-task-batch.ps1 omitted task $taskId from its output."
    }

    # --- Overlapping AllowedFiles is refused, before either task queues ----
    $beforeOverlap = @(
        Get-ChildItem -LiteralPath (Get-HermesRuntimeRoot) -Directory
    ).Count
    $rejectedOverlap = $false
    try {
        & $submitScript `
            -ProjectPath $orchestratorRoot `
            -Model gemma-qat `
            -ModificationAuthorized `
            -Tasks @(
                @{
                    Objective = 'Batch test task C: also touches README.md.'
                    AcceptanceCriteria = @('n/a')
                    AllowedFiles = @('README.md')
                },
                @{
                    Objective = 'Batch test task D: also touches README.md.'
                    AcceptanceCriteria = @('n/a')
                    AllowedFiles = @('README.md')
                }
            ) | Out-Null
    }
    catch {
        $rejectedOverlap = $true
    }
    Assert-Condition `
        $rejectedOverlap `
        'A batch with overlapping AllowedFiles across tasks was not rejected.'
    $afterOverlap = @(
        Get-ChildItem -LiteralPath (Get-HermesRuntimeRoot) -Directory
    ).Count
    Assert-Condition `
        ($afterOverlap -eq $beforeOverlap) `
        'A rejected overlapping batch still left a task directory behind.'

    # --- More than two tasks is refused at parameter binding ---------------
    $rejectedTooMany = $false
    try {
        & $submitScript `
            -ProjectPath $orchestratorRoot `
            -Model gemma-qat `
            -ModificationAuthorized `
            -Tasks @(
                @{ Objective = 'one'; AcceptanceCriteria = @('n/a'); AllowedFiles = @('a.md') },
                @{ Objective = 'two'; AcceptanceCriteria = @('n/a'); AllowedFiles = @('b.md') },
                @{ Objective = 'three'; AcceptanceCriteria = @('n/a'); AllowedFiles = @('c.md') }
            ) | Out-Null
    }
    catch {
        $rejectedTooMany = $true
    }
    Assert-Condition `
        $rejectedTooMany `
        'A batch of three tasks was not rejected.'
}
finally {
    Remove-Item Env:HERMES_TEST_DEFER_WORKER -ErrorAction SilentlyContinue
    foreach ($taskId in $batchTaskIds) {
        $taskDirectory = Get-TaskDirectory -TaskId $taskId
        if (Test-Path -LiteralPath $taskDirectory) {
            Remove-Item -LiteralPath $taskDirectory -Recurse -Force
        }
    }
}

'Hermes task batch tests passed.'
