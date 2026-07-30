[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function New-FixtureSandbox([string]$Name) {
    $result = & (Join-Path $PSScriptRoot 'new-hermes-sandbox.ps1') `
        -ProjectPath $script:projectPath `
        -Objective "Implement validated fixture $Name without leaving the sandbox." `
        -AcceptanceCriteria @('The source changes only after Complete true.') `
        -AllowedFiles @('sample.ps1') `
        -RequestedBy Codex
    $result | ConvertFrom-Json
}

function Set-FixtureContent([string]$Sandbox, [string]$Value) {
    [IO.File]::WriteAllText(
        (Join-Path $Sandbox 'sample.ps1'),
        "'$Value'`n",
        $script:utf8
    )
}

function Seal-And-Approve([string]$TaskId) {
    & (Join-Path $PSScriptRoot 'seal-hermes-task.ps1') -TaskId $TaskId |
        Out-Null
    $taskDirectory = Get-TaskDirectory -TaskId $TaskId
    Assert-Condition `
        ((Get-TaskStatus -TaskDirectory $taskDirectory).state -eq 'sealed') `
        'Seal did not transition the task to sealed.'
    & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $TaskId `
        -Decision Approve | Out-Null
    Assert-Condition `
        ((Get-TaskStatus -TaskDirectory $taskDirectory).state -eq 'validating') `
        'Approve did not transition the task to validating.'
}

$catalogPath = Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\project-catalog.json'
$catalogBackup = [IO.File]::ReadAllText($catalogPath)
$managedRoot = 'C:\Users\waila\StudioProjects'
$fixtureName = 'hermes-brain-lifecycle-' + [Guid]::NewGuid().ToString('N')
$projectPath = Join-Path $managedRoot $fixtureName
$taskIds = [Collections.Generic.List[string]]::new()
$learningRoot = Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\hermes-learning'
$utf8 = [Text.UTF8Encoding]::new($false)
$env:HERMES_TEST_SKIP_GRAPH_REFRESH = '1'

try {
    New-Item -ItemType Directory -Path $projectPath -Force | Out-Null
    & git.exe -C $projectPath init --quiet
    & git.exe -C $projectPath config user.email 'hermes-test@localhost'
    & git.exe -C $projectPath config user.name 'Hermes Test'
    [IO.File]::WriteAllText((Join-Path $projectPath 'sample.ps1'), "'baseline'`n", $utf8)
    & git.exe -C $projectPath add sample.ps1
    & git.exe -C $projectPath commit --quiet -m baseline

    $catalog = $catalogBackup | ConvertFrom-Json
    $catalog.projects += [pscustomobject]@{
        id = $fixtureName
        name = $fixtureName
        rootAlias = 'studio-projects'
        relativePath = $fixtureName
        hasGit = $true
        gitScope = 'own'
        gitBranch = 'main'
        gitDirty = $false
        graphStatus = 'inventory-only'
    }
    Write-JsonAtomic -Path $catalogPath -Value $catalog

    $sandboxScript = [IO.File]::ReadAllText(
        (Join-Path $PSScriptRoot 'new-hermes-sandbox.ps1')
    )
    Assert-Condition `
        ($sandboxScript -notmatch '(?i)Start-HermesWorker|hermes\.exe|lms\.exe|LM Studio') `
        'Sandbox creation contains a local model startup path.'

    $first = New-FixtureSandbox -Name 'same-sandbox-correction'
    $taskIds.Add([string]$first.taskId) | Out-Null
    $firstDirectory = Get-TaskDirectory -TaskId $first.taskId
    Assert-Condition ($first.state -eq 'editing') 'Sandbox was not ready for editing.'
    Assert-Condition (Test-Path -LiteralPath $first.sandboxPath) 'Sandbox path is missing.'
    Set-FixtureContent -Sandbox $first.sandboxPath -Value 'invalid'
    $sourceBeforeSeal = [IO.File]::ReadAllText((Join-Path $projectPath 'sample.ps1'))
    Seal-And-Approve -TaskId $first.taskId
    Assert-Condition `
        ([IO.File]::ReadAllText((Join-Path $projectPath 'sample.ps1')) -eq $sourceBeforeSeal) `
        'Seal or Approve modified the source repository.'

    $failed = & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $first.taskId `
        -Decision Complete `
        -ValidationPassed $false `
        -ValidationSummary 'PowerShell parser test failed.' `
        -CorrectionFeedback 'The sandbox file must contain the validated fixture value.'
    $failedStatus = $failed | ConvertFrom-Json
    Assert-Condition ($failedStatus.state -eq 'editing') 'Failed validation did not return to editing.'
    Assert-Condition `
        ($failedStatus.worktreePath -eq $first.sandboxPath) `
        'Failed validation replaced the sandbox.'
    Assert-Condition `
        ($null -eq $failedStatus.PSObject.Properties['childTaskId']) `
        'Failed validation created a child task.'
    Assert-Condition `
        (-not (Test-Path -LiteralPath (Join-Path $firstDirectory 'changes.patch'))) `
        'Failed validation did not invalidate old seal evidence.'

    Set-FixtureContent -Sandbox $first.sandboxPath -Value 'validated'
    Seal-And-Approve -TaskId $first.taskId
    & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $first.taskId `
        -Decision Complete `
        -ValidationPassed $true `
        -ValidationSummary 'PowerShell parser and integration checks passed.' | Out-Null
    $completed = Get-TaskStatus -TaskDirectory $firstDirectory
    Assert-Condition ($completed.state -eq 'completed') 'Task did not complete.'
    Assert-Condition `
        ([IO.File]::ReadAllText((Join-Path $projectPath 'sample.ps1')) -match 'validated') `
        'Complete true did not apply the patch.'
    Assert-Condition (-not (Test-Path -LiteralPath $first.sandboxPath)) 'Completed sandbox survived.'
    Assert-Condition `
        (Test-Path -LiteralPath (Join-Path $firstDirectory 'integration.json')) `
        'Integration idempotency record is missing.'

    $secondApplyRejected = $false
    try {
        & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
            -TaskId $first.taskId `
            -Decision Complete `
            -ValidationPassed $true `
            -ValidationSummary 'Repeated validation must not apply again.' | Out-Null
    }
    catch {
        $secondApplyRejected = $true
    }
    Assert-Condition $secondApplyRejected 'Completed patch was applied twice.'

    & git.exe -C $projectPath add sample.ps1
    & git.exe -C $projectPath commit --quiet -m validated
    $cleanup = New-FixtureSandbox -Name 'cleanup-recovery'
    $taskIds.Add([string]$cleanup.taskId) | Out-Null
    $cleanupDirectory = Get-TaskDirectory -TaskId $cleanup.taskId
    Set-FixtureContent -Sandbox $cleanup.sandboxPath -Value 'cleanup-recovery'
    Seal-And-Approve -TaskId $cleanup.taskId
    $env:HERMES_TEST_FORCE_CLEANUP_FAILURE = '1'
    & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $cleanup.taskId `
        -Decision Complete `
        -ValidationPassed $true `
        -ValidationSummary 'Cleanup recovery validation passed.' | Out-Null
    Remove-Item Env:HERMES_TEST_FORCE_CLEANUP_FAILURE
    $pending = Get-TaskStatus -TaskDirectory $cleanupDirectory
    Assert-Condition `
        ($pending.state -eq 'applied-cleanup-pending') `
        'Cleanup failure did not produce a recoverable state.'
    Assert-Condition `
        ([IO.File]::ReadAllText((Join-Path $projectPath 'sample.ps1')) -match 'cleanup-recovery') `
        'Patch was not applied before the injected cleanup failure.'
    & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $cleanup.taskId `
        -Decision Complete `
        -ValidationPassed $true `
        -ValidationSummary 'Cleanup retry passed without reapplying.' | Out-Null
    Assert-Condition `
        ((Get-TaskStatus -TaskDirectory $cleanupDirectory).state -eq 'completed') `
        'Cleanup retry did not complete the task.'

    $testLessons = @(
        Get-ChildItem -LiteralPath $learningRoot -Filter '*.json' |
            Where-Object {
                $lesson = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
                $taskIds.Contains([string]$lesson.task_id)
            }
    )
    Assert-Condition `
        ($testLessons.Count -ge 1) `
        'Validated tasks did not produce sanitized learning.'
}
finally {
    [IO.File]::WriteAllText($catalogPath, $catalogBackup, $utf8)
    Remove-Item Env:HERMES_TEST_SKIP_GRAPH_REFRESH -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_TEST_FORCE_CLEANUP_FAILURE -ErrorAction SilentlyContinue
    foreach ($taskId in $taskIds) {
        $taskDirectory = Get-TaskDirectory -TaskId $taskId
        if (Test-Path -LiteralPath $taskDirectory) {
            $status = Get-TaskStatus -TaskDirectory $taskDirectory
            if ($status.worktreePath -and (Test-Path -LiteralPath ([string]$status.worktreePath))) {
                Remove-TaskWorktree -ProjectRoot $projectPath -WorktreePath ([string]$status.worktreePath)
            }
            Remove-Item -LiteralPath $taskDirectory -Recurse -Force
        }
    }
    if (Test-Path -LiteralPath $learningRoot) {
        Get-ChildItem -LiteralPath $learningRoot -Filter '*.json' |
            Where-Object {
                $lesson = Get-Content -LiteralPath $_.FullName -Raw | ConvertFrom-Json
                $taskIds.Contains([string]$lesson.task_id)
            } |
            Remove-Item -Force
    }
    $resolvedProject = [IO.Path]::GetFullPath($projectPath)
    $resolvedManagedRoot = [IO.Path]::GetFullPath($managedRoot).TrimEnd('\') + '\'
    if (
        $resolvedProject.StartsWith($resolvedManagedRoot, [StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $resolvedProject)
    ) {
        Remove-Item -LiteralPath $resolvedProject -Recurse -Force
    }
}

'Hermes Brain lifecycle integration tests passed.'
