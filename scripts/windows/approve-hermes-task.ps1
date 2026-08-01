<#
.SYNOPSIS
Approves a validated Hermes task for integration.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$TaskId,

    [ValidateSet('Codex', 'Claude', 'Antigravity', 'OpenCode')]
    [string]$ApprovedBy = 'Codex'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$taskDirectory = Get-TaskDirectory -TaskId $TaskId
$status = Get-TaskStatus -TaskDirectory $taskDirectory

if ($status.state -ne 'validating' -or -not $status.validationPassed) {
    throw "Task '$TaskId' must be validated before it can be approved."
}

Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'approved' `
    -Message "Task approved by $ApprovedBy. Ready for promotion/integration." `
    -Fields @{
        approvedAt = [DateTime]::UtcNow.ToString('o')
        approvedBy = $ApprovedBy
        progressKind = 'approved'
    }

Update-HermesBrainProjection
Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
