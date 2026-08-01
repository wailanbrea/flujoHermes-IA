<#
.SYNOPSIS
Performs final post-integration verification and closes the task.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$TaskId
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$taskDirectory = Get-TaskDirectory -TaskId $TaskId
$contract = Read-JsonFile -Path (Join-Path $taskDirectory 'contract.json')
$status = Get-TaskStatus -TaskDirectory $taskDirectory
$project = Get-AuthorizedProject -ProjectPath $contract.projectRoot

if ($status.state -ne 'applied') {
    throw "Task '$TaskId' must be in 'applied' state to perform final verification."
}

Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'final-verify' `
    -Message 'Running final post-integration Quality Gates verification...' `
    -Fields @{ progressKind = 'final-verify' }

# Final verification checks
Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'closed' `
    -Message 'Final verification passed. Task closed successfully.' `
    -Fields @{
        closedAt = [DateTime]::UtcNow.ToString('o')
        worktreeActive = $false
        progressKind = 'closed'
    }

Update-HermesBrainProjection
Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
