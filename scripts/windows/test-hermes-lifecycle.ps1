[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

function Submit-FixtureTask([int]$Attempt = 1) {
    $json = & (Join-Path $PSScriptRoot 'submit-hermes-task.ps1') `
        -ProjectPath $script:projectPath `
        -Objective 'Apply the isolated lifecycle test change.' `
        -AcceptanceCriteria @('The lifecycle invariant is preserved.') `
        -Mode execute `
        -Phase edit `
        -AllowedFiles @('sample.ps1') `
        -ModificationAuthorized `
        -Attempt $Attempt `
        -MaxAttempts 3
    $status = $json | ConvertFrom-Json
    $script:taskIds.Add([string]$status.taskId) | Out-Null
    return $status
}

function Add-FixtureWorktree([string]$TaskId) {
    $path = Join-Path (Get-HermesWorktreeRoot) $TaskId
    & git.exe -C $script:projectPath worktree add --quiet --detach $path HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Could not create lifecycle fixture worktree.' }
    $script:worktrees.Add($path) | Out-Null
    return $path
}

$catalogPath = Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\project-catalog.json'
$catalogBackup = [IO.File]::ReadAllText($catalogPath)
$managedRoot = 'C:\Users\waila\StudioProjects'
$fixtureName = 'hermes-lifecycle-test-' + [Guid]::NewGuid().ToString('N')
$projectPath = Join-Path $managedRoot $fixtureName
$taskIds = [Collections.Generic.List[string]]::new()
$worktrees = [Collections.Generic.List[string]]::new()
$utf8 = [Text.UTF8Encoding]::new($false)
$env:HERMES_TEST_DEFER_WORKER = '1'
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

    $first = Submit-FixtureTask -Attempt 1
    $firstDirectory = Get-TaskDirectory -TaskId $first.taskId
    $firstWorktree = Add-FixtureWorktree -TaskId $first.taskId
    Set-TaskStatus `
        -TaskDirectory $firstDirectory `
        -State 'failed' `
        -Message 'Validation failed.' `
        -Fields @{
            worktreePath = $firstWorktree
            worktreeActive = $true
            attempt = 1
            maxAttempts = 3
        }
    $firstResult = & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $first.taskId `
        -Decision RequestChanges `
        -CorrectionFeedback 'The parser rejected the generated PowerShell syntax.'
    $firstParent = $firstResult | ConvertFrom-Json
    Assert-Condition `
        ($firstParent.state -eq 'correction-requested') `
        'Attempt 1 did not request a correction.'
    Assert-Condition `
        (-not (Test-Path -LiteralPath $firstWorktree)) `
        'The old worktree survived after its child was created.'
    $childDirectory = Get-TaskDirectory -TaskId $firstParent.childTaskId
    $taskIds.Add([string]$firstParent.childTaskId) | Out-Null
    $child = Get-TaskStatus -TaskDirectory $childDirectory
    Assert-Condition ([int]$child.attempt -eq 2) 'Child attempt was not incremented.'
    $parentText = Get-Content -LiteralPath (
        Join-Path $firstDirectory 'status.json'
    ) -Raw
    Assert-Condition `
        ($parentText -notmatch '(?i)parser rejected|feedback|prompt|response') `
        'Correction feedback leaked into status.'

    $third = Submit-FixtureTask -Attempt 3
    $thirdDirectory = Get-TaskDirectory -TaskId $third.taskId
    Set-TaskStatus `
        -TaskDirectory $thirdDirectory `
        -State 'failed' `
        -Message 'Validation failed.' `
        -Fields @{ attempt = 3; maxAttempts = 3 }
    $countBefore = @(Get-ChildItem -LiteralPath (Get-HermesRuntimeRoot) -Directory).Count
    & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $third.taskId `
        -Decision RequestChanges `
        -CorrectionFeedback 'The integration assertion still fails on attempt three.' |
        Out-Null
    $thirdResult = Get-TaskStatus -TaskDirectory $thirdDirectory
    $countAfter = @(Get-ChildItem -LiteralPath (Get-HermesRuntimeRoot) -Directory).Count
    Assert-Condition ($thirdResult.state -eq 'blocked') 'Attempt 3 was not blocked.'
    Assert-Condition `
        ($thirdResult.errorCode -eq 'correction-attempts-exhausted') `
        'Attempt exhaustion did not use the stable error code.'
    Assert-Condition ($countBefore -eq $countAfter) 'Attempt 4 was created.'

    $childFailure = Submit-FixtureTask -Attempt 1
    $childFailureDirectory = Get-TaskDirectory -TaskId $childFailure.taskId
    $childFailureWorktree = Add-FixtureWorktree -TaskId $childFailure.taskId
    $childFailureContractPath = Join-Path $childFailureDirectory 'contract.json'
    $childFailureContract = Read-JsonFile -Path $childFailureContractPath
    $childFailureContract.patchPolicy.allowedFiles = @()
    Write-JsonAtomic -Path $childFailureContractPath -Value $childFailureContract
    Set-TaskStatus `
        -TaskDirectory $childFailureDirectory `
        -State 'failed' `
        -Message 'Validation failed.' `
        -Fields @{
            worktreePath = $childFailureWorktree
            worktreeActive = $true
            attempt = 1
            maxAttempts = 3
        }
    $childCreationFailed = $false
    try {
        & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
            -TaskId $childFailure.taskId `
            -Decision RequestChanges `
            -CorrectionFeedback 'The child fixture must reject an empty file allowlist.' |
            Out-Null
    }
    catch {
        $childCreationFailed = $true
    }
    Assert-Condition $childCreationFailed 'Invalid child creation unexpectedly succeeded.'
    Assert-Condition `
        (Test-Path -LiteralPath $childFailureWorktree) `
        'The previous worktree was removed after child creation failed.'
    Assert-Condition `
        ((Get-TaskStatus -TaskDirectory $childFailureDirectory).state -eq 'failed') `
        'The parent state changed after child creation failed.'

    $failedValidation = Submit-FixtureTask -Attempt 1
    $failedDirectory = Get-TaskDirectory -TaskId $failedValidation.taskId
    $failedWorktree = Add-FixtureWorktree -TaskId $failedValidation.taskId
    Set-TaskStatus `
        -TaskDirectory $failedDirectory `
        -State 'validating' `
        -Message 'Validating.' `
        -Fields @{
            worktreePath = $failedWorktree
            worktreeActive = $true
            attempt = 1
            maxAttempts = 3
        }
    $failedResultJson = & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $failedValidation.taskId `
        -Decision Complete `
        -ValidationPassed $false `
        -ValidationSummary 'Integration validation failed.' `
        -CorrectionFeedback 'The expected integration output was not produced.'
    $failedResult = $failedResultJson | ConvertFrom-Json
    $taskIds.Add([string]$failedResult.childTaskId) | Out-Null
    Assert-Condition `
        ($failedResult.state -eq 'correction-requested') `
        'Failed validation did not create a correction.'

    $successful = Submit-FixtureTask -Attempt 1
    $successfulDirectory = Get-TaskDirectory -TaskId $successful.taskId
    $successfulWorktree = Add-FixtureWorktree -TaskId $successful.taskId
    [IO.File]::WriteAllText(
        (Join-Path $successfulWorktree 'sample.ps1'),
        "'validated'`n",
        $utf8
    )
    $patchText = @(
        & git.exe -C $successfulWorktree diff --binary --no-ext-diff HEAD
    ) -join "`n"
    $patchText += "`n"
    $patchPath = Join-Path $successfulDirectory 'changes.patch'
    [IO.File]::WriteAllText($patchPath, $patchText, $utf8)
    $patchBytes = (Get-Item -LiteralPath $patchPath).Length
    Write-JsonAtomic `
        -Path (Join-Path $successfulDirectory 'patch-validation.json') `
        -Value ([ordered]@{
            schemaVersion = 1
            passed = $true
            files = @('sample.ps1')
            additions = 1
            removals = 1
            patchBytes = $patchBytes
            patchSha256 = Get-FileSha256 -Path $patchPath
            violations = @()
        })
    Set-TaskStatus `
        -TaskDirectory $successfulDirectory `
        -State 'awaiting-review' `
        -Message 'Ready.' `
        -Fields @{
            patchBytes = $patchBytes
            patchPolicyPassed = $true
            worktreePath = $successfulWorktree
            worktreeActive = $true
        }
    $beforeApprove = [IO.File]::ReadAllText((Join-Path $projectPath 'sample.ps1'))
    & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $successful.taskId `
        -Decision Approve | Out-Null
    Assert-Condition `
        ([IO.File]::ReadAllText((Join-Path $projectPath 'sample.ps1')) -eq $beforeApprove) `
        'Approve modified the source project.'
    Assert-Condition `
        (Test-Path -LiteralPath $successfulWorktree) `
        'Approve removed the isolated worktree.'
    & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
        -TaskId $successful.taskId `
        -Decision Complete `
        -ValidationPassed $true `
        -ValidationSummary 'Parser and integration checks passed.' | Out-Null
    Assert-Condition `
        ([IO.File]::ReadAllText((Join-Path $projectPath 'sample.ps1')) -match 'validated') `
        'Successful Complete did not apply the patch.'
    $secondApplyRejected = $false
    try {
        & (Join-Path $PSScriptRoot 'review-hermes-task.ps1') `
            -TaskId $successful.taskId `
            -Decision Complete `
            -ValidationPassed $true `
            -ValidationSummary 'Repeated validation.' | Out-Null
    }
    catch {
        $secondApplyRejected = $true
    }
    Assert-Condition $secondApplyRejected 'Completed patch was applied twice.'
}
finally {
    [IO.File]::WriteAllText($catalogPath, $catalogBackup, $utf8)
    Remove-Item Env:HERMES_TEST_DEFER_WORKER -ErrorAction SilentlyContinue
    Remove-Item Env:HERMES_TEST_SKIP_GRAPH_REFRESH -ErrorAction SilentlyContinue
    foreach ($worktree in $worktrees) {
        if (Test-Path -LiteralPath $worktree) {
            Remove-TaskWorktree -ProjectRoot $projectPath -WorktreePath $worktree
        }
    }
    foreach ($taskId in $taskIds) {
        $taskDirectory = Get-TaskDirectory -TaskId $taskId
        if (Test-Path -LiteralPath $taskDirectory) {
            Remove-Item -LiteralPath $taskDirectory -Recurse -Force
        }
        $exchangeDirectory = Get-TaskExchangeDirectory -TaskId $taskId
        if (Test-Path -LiteralPath $exchangeDirectory) {
            Remove-Item -LiteralPath $exchangeDirectory -Recurse -Force
        }
    }
    $resolvedProject = [IO.Path]::GetFullPath($projectPath)
    $resolvedManagedRoot = [IO.Path]::GetFullPath($managedRoot).TrimEnd('\') + '\'
    if (
        $resolvedProject.StartsWith(
            $resolvedManagedRoot,
            [StringComparison]::OrdinalIgnoreCase
        ) -and
        (Test-Path -LiteralPath $resolvedProject)
    ) {
        Remove-Item -LiteralPath $resolvedProject -Recurse -Force
    }
}

'Hermes lifecycle integration tests passed.'
