<#
.SYNOPSIS
Records Codex review, applies an approved patch, or completes validation.
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
$forbidSwitch = $false
if ($null -ne $contract.patchPolicy.forbidLiteralEscapedNewlines) {
    $forbidSwitch = [bool]$contract.patchPolicy.forbidLiteralEscapedNewlines
}

# A PowerShell script invoked with `&` does not set $LASTEXITCODE unless it calls
# `exit`, so the old exit-code guard read a stale value from an unrelated native
# command. ensure-project-graph.ps1 throws on failure; catch that instead.
function Update-ProjectGraph([string]$ProjectRoot) {
    if ($env:HERMES_TEST_SKIP_GRAPH_REFRESH -eq '1') { return }
    try {
        & (Join-Path $PSScriptRoot 'ensure-project-graph.ps1') `
            -ProjectPath $ProjectRoot `
            -Refresh | Out-Null
    }
    catch {
        throw "Code passed validation, but Graphify refresh failed: $($_.Exception.Message)"
    }
}

function Request-HermesCorrection(
    [string]$TaskId,
    [string]$TaskDirectory,
    [object]$Status,
    [object]$Contract,
    [string]$Feedback,
    [string]$ReviewedBy,
    [bool]$ForbidLiteralEscapedNewlines
) {
    $sanitizedFeedback = Get-SanitizedCorrectionFeedback -Feedback $Feedback
    $currentAttempt = if ($null -ne $Status.attempt) {
        [int]$Status.attempt
    }
    elseif ($null -ne $Contract.attempt) {
        [int]$Contract.attempt
    }
    else {
        1
    }
    $maxAttempts = if ($null -ne $Status.maxAttempts) {
        [int]$Status.maxAttempts
    }
    elseif ($null -ne $Contract.maxAttempts) {
        [int]$Contract.maxAttempts
    }
    else {
        3
    }
    $maxAttempts = [Math]::Min(3, $maxAttempts)

    if ($currentAttempt -ge $maxAttempts) {
        Set-TaskStatus `
            -TaskDirectory $taskDirectory `
            -State 'blocked' `
            -Message "Exceeded max attempts." `
            -Fields @{ errorCode = 'correction-attempts-exhausted' }
        return
    }

    $combinedConstraints = @($Contract.constraints | Select-Object -First 19)
    $combinedConstraints += $sanitizedFeedback

    $maxTurns = 18
    if ($null -ne $Contract.maxTurns) {
        $maxTurns = [Math]::Max(5, [Math]::Min(18, [int]$Contract.maxTurns))
    }
    $timeoutSeconds = 1200
    if ($null -ne $Contract.timeoutSeconds) {
        $timeoutSeconds = [int]$Contract.timeoutSeconds
    }
    $noProgressTimeout = 180
    if ($null -ne $Contract.noProgressTimeoutSeconds) {
        $noProgressTimeout = [int]$Contract.noProgressTimeoutSeconds
    }
    $modificationAuthorized = $true
    if ($null -ne $Contract.modificationAuthorized) {
        $modificationAuthorized = [bool]$Contract.modificationAuthorized
    }

    $submitParams = [ordered]@{
        ProjectPath          = $Contract.projectRoot
        Objective            = $Contract.objective
        AcceptanceCriteria   = @($Contract.acceptanceCriteria)
        Constraints          = $combinedConstraints
        Mode                 = $Contract.mode
        Phase                = $Contract.phase
        AllowedFiles         = @($Contract.patchPolicy.allowedFiles)
        MaxAddedLines        = [int]$Contract.patchPolicy.maxAddedLines
        MaxRemovedLines      = [int]$Contract.patchPolicy.maxRemovedLines
        MaxPatchBytes        = [int]$Contract.patchPolicy.maxPatchBytes
        # The guard is on by default now, so a correction only carries the
        # opt-out when the parent contract explicitly disabled it.
        AllowLiteralEscapedNewlines = (-not $ForbidLiteralEscapedNewlines)
        MaxTurns             = $maxTurns
        TimeoutSeconds       = $timeoutSeconds
        NoProgressTimeoutSeconds = $noProgressTimeout
        RequestedBy          = $ReviewedBy
        ModificationAuthorized = $modificationAuthorized
        Wait                 = $false
    }

    $submitParams['Attempt']       = $currentAttempt + 1
    $submitParams['MaxAttempts']   = $maxAttempts
    $submitParams['CorrectionOf']  = $TaskId

    # Three-step ordering, and the order is load-bearing. Queue the child first
    # but keep its worker deferred, so a rejected contract leaves the parent's
    # worktree intact as evidence. Only once the child is known valid is the
    # parent's worktree released, and only then is the worker started: the
    # child's `git worktree add` must never run while `worktree prune` is
    # removing the parent's metadata from the same repository.
    $submitParams['DeferWorker'] = $true

    $submitScript = Join-Path $PSScriptRoot 'submit-hermes-task.ps1'
    $childResult = & $submitScript @submitParams
    if ($null -eq $childResult) {
        throw 'Submit-hermes-task returned null.'
    }

    $childStatus = $null
    try {
        $childStatus = $childResult | ConvertFrom-Json
    }
    catch {
        throw "Could not parse child task status: $_"
    }

    if ($null -eq $childStatus) {
        throw 'Parsed child task status is null.'
    }

    if (-not $childStatus.taskId) {
        throw 'Child task must have a valid ID.'
    }

    if ($Status.worktreePath) {
        Remove-TaskWorktree `
            -ProjectRoot $project.Path `
            -WorktreePath ([string]$Status.worktreePath)
    }
    Remove-TaskExchange -TaskId $TaskId

    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'correction-requested' `
        -Message "Correction requested (attempt $($currentAttempt + 1))." `
        -Fields @{
            reviewedAt   = [DateTime]::UtcNow.ToString('o')
            reviewedBy   = $ReviewedBy
            worktreeActive = $false
            childTaskId  = $childStatus.taskId
        }

    Start-HermesWorker -TaskId ([string]$childStatus.taskId)

    return
}

if ($Decision -eq 'RequestChanges') {
    if ($status.state -notin @('awaiting-review', 'failed', 'blocked')) {
        throw 'Only a reviewable Hermes task can have changes requested.'
    }
    Request-HermesCorrection `
        -TaskId $TaskId `
        -TaskDirectory $taskDirectory `
        -Status $status `
        -Contract $contract `
        -Feedback $CorrectionFeedback `
        -ReviewedBy $ReviewedBy `
        -ForbidLiteralEscapedNewlines $forbidSwitch

}
elseif ($Decision -eq 'Approve') {
    if ($status.state -ne 'awaiting-review') {
        throw 'Only an awaiting-review task can be approved.'
    }
    Assert-CleanGitRepository -ProjectRoot $project.Path
    $patchValidation = Assert-PatchEvidence `
        -ProjectRoot $project.Path `
        -TaskDirectory $taskDirectory

    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'validating' `
        -Message "Parche aprobado; codex debe ejecutar la validacion." `
        -Fields @{
            reviewedAt   = [DateTime]::UtcNow.ToString('o')
            reviewedBy    = $ReviewedBy
            worktreeActive = $true
        }
}
else {
    if ($status.state -ne 'validating') {
        throw 'Only a validating task can be completed.'
    }
    if ($null -eq $ValidationPassed -or -not $ValidationSummary) {
        throw 'Complete requires -ValidationPassed and -ValidationSummary.'
    }

    # Recorded before any state change so the evidence survives a later failure.
    $evidence = Write-ValidationEvidence `
        -TaskDirectory $taskDirectory `
        -Summary $ValidationSummary `
        -Passed ([bool]$ValidationPassed) `
        -ReviewedBy $ReviewedBy

    if ($ValidationPassed -and -not [bool]$status.worktreeActive) {
        Set-TaskStatus `
            -TaskDirectory $taskDirectory `
            -State 'completed' `
            -Message 'Codex valido una tarea aplicada por el flujo anterior.' `
            -Fields @{
                validatedAt = [DateTime]::UtcNow.ToString('o')
                reviewedBy = $ReviewedBy
                validationPassed = $true
                validationRecordedAt = $evidence.recordedAt
            }
        Update-ProjectGraph -ProjectRoot $project.Path
        Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
        exit 0
    }

    if ($ValidationPassed) {
        Assert-CleanGitRepository -ProjectRoot $project.Path
        $patchValidation = Assert-PatchEvidence `
            -ProjectRoot $project.Path `
            -TaskDirectory $taskDirectory
        $patchPath = Join-Path $taskDirectory 'changes.patch'
        if ([int64]$patchValidation.patchBytes -gt 0) {
            & git.exe -C $project.Path apply $patchPath
            if ($LASTEXITCODE -ne 0) {
                throw 'Git failed while applying the reviewed Hermes patch.'
            }
        }

        Remove-TaskWorktree `
            -ProjectRoot $project.Path `
            -WorktreePath ([string]$status.worktreePath)
        Remove-TaskExchange -TaskId $TaskId

        Set-TaskStatus `
            -TaskDirectory $taskDirectory `
            -State 'completed' `
            -Message 'Codex valido el trabajo local.' `
            -Fields @{
                validatedAt   = [DateTime]::UtcNow.ToString('o')
                reviewedBy    = $ReviewedBy
                validationPassed = [bool]$ValidationPassed
                validationRecordedAt = $evidence.recordedAt
                worktreeActive = $false
            }

        Update-ProjectGraph -ProjectRoot $project.Path
    }
    else {
        if ($null -eq $CorrectionFeedback -or $CorrectionFeedback.Trim().Length -eq 0) {
            throw 'Failed Complete requires -CorrectionFeedback.'
        }

        Request-HermesCorrection `
            -TaskId $TaskId `
            -TaskDirectory $taskDirectory `
            -Status $status `
            -Contract $contract `
            -Feedback $CorrectionFeedback `
            -ReviewedBy $ReviewedBy `
            -ForbidLiteralEscapedNewlines $forbidSwitch

    }

}

Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
