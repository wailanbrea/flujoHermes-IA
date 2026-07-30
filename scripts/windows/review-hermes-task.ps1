<#
.SYNOPSIS
Reviews sealed director evidence and performs one idempotent integration.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$TaskId,

    [Parameter(Mandatory)]
    [ValidateSet('Approve', 'Complete', 'RequestChanges')]
    [string]$Decision,

    [string]$ValidationSummary,

    [Nullable[bool]]$ValidationPassed,

    [string]$CorrectionFeedback,

    [ValidateSet('Codex', 'Claude', 'Antigravity', 'OpenCode')]
    [string]$ReviewedBy = 'Codex'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$taskDirectory = Get-TaskDirectory -TaskId $TaskId
$contract = Read-JsonFile -Path (Join-Path $taskDirectory 'contract.json')
$status = Get-TaskStatus -TaskDirectory $taskDirectory
$project = Get-AuthorizedProject -ProjectPath $contract.projectRoot

function Update-ProjectGraph([string]$ProjectRoot) {
    if ($env:HERMES_TEST_SKIP_GRAPH_REFRESH -eq '1') { return }
    & (Join-Path $PSScriptRoot 'ensure-project-graph.ps1') `
        -ProjectPath $ProjectRoot `
        -Refresh | Out-Null
}

function Clear-SealEvidence([string]$Directory) {
    foreach ($name in @('changes.patch', 'patch-validation.json', 'validation.json')) {
        $path = Join-Path $Directory $name
        if (Test-Path -LiteralPath $path -PathType Leaf) {
            Remove-Item -LiteralPath $path -Force
        }
    }
}

function Return-ToEditing(
    [object]$CurrentStatus,
    [string]$Feedback,
    [string]$Reviewer
) {
    Get-SanitizedCorrectionFeedback -Feedback $Feedback | Out-Null
    if (
        -not $CurrentStatus.worktreePath -or
        -not (Test-Path -LiteralPath ([string]$CurrentStatus.worktreePath) -PathType Container)
    ) {
        throw 'The original sandbox is unavailable; correction cannot continue safely.'
    }
    Clear-SealEvidence -Directory $taskDirectory
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'editing' `
        -Message 'Independent validation requested a correction in the same sandbox.' `
        -Fields @{
            reviewedAt = [DateTime]::UtcNow.ToString('o')
            reviewedBy = $Reviewer
            worktreeActive = $true
            validationPassed = $false
            patchPolicyPassed = $null
            patchBytes = 0
            filesChanged = 0
            errorCode = 'validation-failed'
            progressKind = 'editing'
        }
}

if ($Decision -eq 'RequestChanges') {
    if ($status.state -notin @('sealed', 'awaiting-review', 'validating', 'blocked')) {
        throw 'Only a sealed, validating, or policy-blocked task can return to editing.'
    }
    if (-not $CorrectionFeedback) {
        throw 'RequestChanges requires -CorrectionFeedback.'
    }
    Return-ToEditing `
        -CurrentStatus $status `
        -Feedback $CorrectionFeedback `
        -Reviewer $ReviewedBy
    Update-HermesBrainProjection
    Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
    exit 0
}

if ($Decision -eq 'Approve') {
    if ($status.state -notin @('sealed', 'awaiting-review')) {
        throw 'Only a sealed task can be approved.'
    }
    Assert-CleanGitRepository -ProjectRoot $project.Path
    Assert-PatchEvidence `
        -ProjectRoot $project.Path `
        -TaskDirectory $taskDirectory | Out-Null
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'validating' `
        -Message 'Evidence approved; independent validation is required.' `
        -Fields @{
            reviewedAt = [DateTime]::UtcNow.ToString('o')
            reviewedBy = $ReviewedBy
            worktreeActive = $true
            progressKind = 'validating'
        }
    Update-HermesBrainProjection
    Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
    exit 0
}

if ($status.state -notin @('validating', 'applied-cleanup-pending')) {
    throw 'Only a validating or cleanup-pending task can be completed.'
}
if ($null -eq $ValidationPassed -or -not $ValidationSummary) {
    throw 'Complete requires -ValidationPassed and -ValidationSummary.'
}

if (-not [bool]$ValidationPassed) {
    if (-not $CorrectionFeedback) {
        throw 'Failed Complete requires -CorrectionFeedback.'
    }
    Write-ValidationEvidence `
        -TaskDirectory $taskDirectory `
        -Summary $ValidationSummary `
        -Passed $false `
        -ReviewedBy $ReviewedBy | Out-Null
    Return-ToEditing `
        -CurrentStatus $status `
        -Feedback $CorrectionFeedback `
        -Reviewer $ReviewedBy
    Update-HermesBrainProjection
    Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
    exit 0
}

$evidence = Write-ValidationEvidence `
    -TaskDirectory $taskDirectory `
    -Summary $ValidationSummary `
    -Passed $true `
    -ReviewedBy $ReviewedBy
$patchValidation = Read-JsonFile -Path (
    Join-Path $taskDirectory 'patch-validation.json'
)
$patchPath = Join-Path $taskDirectory 'changes.patch'
$integrationPath = Join-Path $taskDirectory 'integration.json'
$integration = $null
if (Test-Path -LiteralPath $integrationPath -PathType Leaf) {
    $integration = Read-JsonFile -Path $integrationPath
    if ($integration.patchSha256 -ne $patchValidation.patchSha256) {
        throw 'Integration record does not match the sealed patch.'
    }
}

if ($null -eq $integration) {
    $sourceClean = $true
    try {
        Assert-CleanGitRepository -ProjectRoot $project.Path
    }
    catch {
        $sourceClean = $false
    }
    if ($sourceClean) {
        Assert-PatchEvidence `
            -ProjectRoot $project.Path `
            -TaskDirectory $taskDirectory | Out-Null
        if ([int64]$patchValidation.patchBytes -gt 0) {
            & git.exe -C $project.Path apply $patchPath
            if ($LASTEXITCODE -ne 0) {
                throw 'Git failed while applying the reviewed director patch.'
            }
        }
    }
    else {
        & git.exe -C $project.Path apply --reverse --check $patchPath
        if ($LASTEXITCODE -ne 0) {
            throw 'Source is dirty and does not exactly contain the sealed patch.'
        }
    }
    $integration = [ordered]@{
        schemaVersion = 1
        taskId = $TaskId
        patchSha256 = $patchValidation.patchSha256
        appliedAt = [DateTime]::UtcNow.ToString('o')
        appliedBy = $ReviewedBy
    }
    Write-JsonAtomic -Path $integrationPath -Value $integration
}

Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'applied-cleanup-pending' `
    -Message 'Patch applied once; sandbox cleanup is pending.' `
    -Fields @{
        integrationApplied = $true
        integrationAppliedAt = $integration.appliedAt
        validationPassed = $true
        validationRecordedAt = $evidence.recordedAt
        progressKind = 'cleanup'
        errorCode = 'cleanup-pending'
    }

try {
    if ($env:HERMES_TEST_FORCE_CLEANUP_FAILURE -eq '1') {
        throw 'Injected cleanup failure.'
    }
    Remove-TaskWorktree `
        -ProjectRoot $project.Path `
        -WorktreePath ([string]$status.worktreePath)
    Remove-TaskExchange -TaskId $TaskId
}
catch {
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'applied-cleanup-pending' `
        -Message 'Patch is applied; cleanup can be retried safely.' `
        -Fields @{
            worktreeActive = Test-Path -LiteralPath ([string]$status.worktreePath)
            errorCode = 'cleanup-pending'
        }
    Update-HermesBrainProjection
    Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
    exit 0
}

Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'completed' `
    -Message 'Director change passed validation and was integrated once.' `
    -Fields @{
        validatedAt = [DateTime]::UtcNow.ToString('o')
        reviewedBy = $ReviewedBy
        validationPassed = $true
        validationRecordedAt = $evidence.recordedAt
        worktreeActive = $false
        errorCode = $null
        progressKind = 'completed'
    }

try {
    & (Join-Path $PSScriptRoot 'record-hermes-learning.ps1') `
        -TaskId $TaskId `
        -Domain ([string]$contract.projectName) `
        -ProblemPattern 'Validated repository change completed in an isolated sandbox.' `
        -RootCause 'The requested modification required an evidence-gated implementation.' `
        -SolutionSummary 'A cloud director produced a sealed patch that passed independent validation.' `
        -PassedCommands @($ValidationSummary) | Out-Null
}
catch {
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'completed' `
        -Message 'Integrated successfully; sanitized learning capture needs review.' `
        -Fields @{ learningState = 'failed'; learningErrorCode = 'learning-capture-failed' }
}

Update-ProjectGraph -ProjectRoot $project.Path
Update-HermesBrainProjection
Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
