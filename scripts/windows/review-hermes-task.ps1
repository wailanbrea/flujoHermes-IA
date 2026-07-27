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
    [ValidateSet('Approve', 'Complete', 'Reject')]
    [string]$Decision,

    [string]$ValidationSummary,

    [Nullable[bool]]$ValidationPassed
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$taskDirectory = Get-TaskDirectory -TaskId $TaskId
$contract = Read-JsonFile -Path (Join-Path $taskDirectory 'contract.json')
$status = Get-TaskStatus -TaskDirectory $taskDirectory
$project = Get-AuthorizedProject -ProjectPath $contract.projectRoot

if ($Decision -eq 'Reject') {
    if ($status.state -notin @('awaiting-review', 'failed', 'blocked')) {
        throw 'Only a reviewable Hermes task can be rejected.'
    }
    Remove-TaskWorktree `
        -ProjectRoot $project.Path `
        -WorktreePath ([string]$status.worktreePath)
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'rejected' `
        -Message 'Codex rechazó el resultado local.' `
        -Fields @{
            reviewedAt = [DateTime]::UtcNow.ToString('o')
            worktreeActive = $false
        }
}
elseif ($Decision -eq 'Approve') {
    if ($status.state -ne 'awaiting-review') {
        throw 'Only an awaiting-review task can be approved.'
    }
    $patchPath = Join-Path $taskDirectory 'changes.patch'
    if ($status.patchBytes -gt 0) {
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
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'validating' `
        -Message 'Parche aprobado; Codex debe ejecutar la validación.' `
        -Fields @{
            reviewedAt = [DateTime]::UtcNow.ToString('o')
            worktreeActive = $false
        }
}
else {
    if ($status.state -ne 'validating') {
        throw 'Only a validating task can be completed.'
    }
    if ($null -eq $ValidationPassed -or -not $ValidationSummary) {
        throw 'Complete requires -ValidationPassed and -ValidationSummary.'
    }
    $finalState = if ($ValidationPassed) { 'completed' } else {
        'validation-failed'
    }
    $message = if ($ValidationPassed) {
        'Codex validó el trabajo local.'
    }
    else {
        'La validación independiente de Codex falló.'
    }
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State $finalState `
        -Message $message `
        -Fields @{
            validatedAt = [DateTime]::UtcNow.ToString('o')
            validationPassed = [bool]$ValidationPassed
            validationSummary = $ValidationSummary.Substring(
                0,
                [Math]::Min(180, $ValidationSummary.Length)
            )
        }
    if ($ValidationPassed) {
        & (Join-Path $PSScriptRoot 'ensure-project-graph.ps1') `
            -ProjectPath $project.Path `
            -Refresh | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw 'Code passed validation, but Graphify refresh failed.'
        }
    }
}

Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
