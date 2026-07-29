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

function Request-HermesCorrection(
    [string]$TaskId,
    [string]$TaskDirectory,
    [object]$Status,
    [object]$Contract,
    [string]$Feedback,
    [string]$ReviewedBy,
    [bool]$ForbidLiteralEscapedNewlines
) {
    if (-not $Feedback -or $Feedback.Trim().Length -eq 0) {
        throw 'Correction feedback must be nonblank.'
    }

    $currentAttempt = $Status.attempt
    if ($null -eq $currentAttempt) {
        $currentAttempt = 0
    }

    $maxAttempts = $Status.maxAttempts
    if ($null -eq $maxAttempts) {
        $maxAttempts = 1
    }

    if ($currentAttempt -ge $maxAttempts) {
        Set-TaskStatus `
            -TaskDirectory $taskDirectory `
            -State 'blocked' `
            -Message "Exceeded max attempts." `
            -Fields @{ errorCode = 'correction-attempts-exhausted' }
        return
    }

    $sanitizedFeedback = $Feedback.Trim()
    if ($sanitizedFeedback.Length -gt 500) {
        $sanitizedFeedback = $sanitizedFeedback.Substring(0, 500)
    }

    $combinedConstraints = @($Contract.constraints)
    if ($sanitizedFeedback.Length -gt 0) {
        $combinedConstraints += $sanitizedFeedback
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
        ForbidLiteralEscapedNewlines = $ForbidLiteralEscapedNewlines
        MaxTurns             = if ($null -ne $Contract.maxTurns) { [int]$Contract.maxTurns } else { 30 }
        TimeoutSeconds       = if ($null -ne $Contract.timeoutSeconds) { [int]$Contract.timeoutSeconds } else { 1200 }
        NoProgressTimeoutSeconds = if ($null -ne $Contract.noProgressTimeoutSeconds) { [int]$Contract.noProgressTimeoutSeconds } else { 180 }
        RequestedBy          = $ReviewedBy
        ModificationAuthorized = if ($null -ne $Contract.modificationAuthorized) { [bool]$Contract.modificationAuthorized } else { $true }
        Wait                 = $false
    }

    $submitParams['Attempt']       = $currentAttempt + 1
    $submitParams['MaxAttempts']   = $maxAttempts
    $submitParams['CorrectionOf']  = $TaskId

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
    $patchValidationPath = Join-Path $taskDirectory 'patch-validation.json'
    if (-not (Test-Path -LiteralPath $patchValidationPath -PathType Leaf)) {
        throw 'Hermes patch validation evidence is missing.'
    }
    $patchValidation = Read-JsonFile -Path $patchValidationPath
    if (-not [bool]$patchValidation.passed) {
        throw 'Hermes patch policy did not pass.'
    }
    $patchPath = Join-Path $taskDirectory 'changes.patch'
    if ($status.patchBytes -gt 0 -and (
        -not (Test-Path -LiteralPath $patchPath -PathType Leaf) -or
        (Get-Item -LiteralPath $patchPath).Length -ne [int64]$patchValidation.patchBytes
    )) {
        throw 'Hermes patch no longer matches its validation evidence.'
    }


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

    if ($ValidationPassed -and -not [bool]$status.worktreeActive) {
        Set-TaskStatus `
            -TaskDirectory $taskDirectory `
            -State 'completed' `
            -Message 'Codex valido una tarea aplicada por el flujo anterior.' `
            -Fields @{
                validatedAt = [DateTime]::UtcNow.ToString('o')
                reviewedBy = $ReviewedBy
                validationPassed = $true
                validationSummary = $ValidationSummary.Substring(
                    0,
                    [Math]::Min(180, $ValidationSummary.Length)
                )
            }
        & (Join-Path $PSScriptRoot 'ensure-project-graph.ps1') `
            -ProjectPath $project.Path `
            -Refresh | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'Code passed validation, but Graphify refresh failed.'
        }
        Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
        exit 0
    }

    if ($ValidationPassed) {
        $patchValidationPath = Join-Path $taskDirectory 'patch-validation.json'
        if (-not (Test-Path -LiteralPath $patchValidationPath -PathType Leaf)) {
            throw 'Patch validation file is missing.'
        }
        $patchValidation = Read-JsonFile -Path $patchValidationPath

        if (-not [bool]$patchValidation.passed) {
            throw 'Patch validation failed.'
        }

        $patchPath = Join-Path $taskDirectory 'changes.patch'
        if ($status.patchBytes -gt 0) {
            if (-not (Test-Path -LiteralPath $patchPath -PathType Leaf) -or (Get-Item -LiteralPath $patchPath).Length -ne [int64]$patchValidation.patchBytes) {
                throw 'Hermes patch no longer matches its validation evidence.'
            }

            $gitStatus = @(& git.exe -C $project.Path status --porcelain)
            if ($LASTEXITCODE -ne 0 -or $gitStatus.Count -gt 0) {
                throw 'Source is not clean before applying patch.'
            }

            & git.exe -C $project.Path apply --check $patchPath
            if ($LASTEXITCODE -ne 0) {
                Set-TaskStatus `
                    -TaskDirectory $taskDirectory `
                    -State 'blocked' `
                    -Message 'El parche entra en conflicto con el proyecto actual.' `
                    -Fields @{ errorCode = 'patch-check-failed' }
                throw 'Hermes patch did not pass git apply --check.'
            }
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
                validationSummary = $ValidationSummary.Substring(0, [Math]::Min(180, $ValidationSummary.Length))
                worktreeActive = $false
            }

        & (Join-Path $PSScriptRoot 'ensure-project-graph.ps1') `
            -ProjectPath $project.Path `
            -Refresh | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'Code passed validation, but Graphify refresh failed.'
        }
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
