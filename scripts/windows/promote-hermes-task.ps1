<#
.SYNOPSIS
Promotes an approved task to the integration branch.
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

if ($status.state -ne 'approved') {
    throw "Task '$TaskId' must be in 'approved' state before promotion."
}

$patchPath = Join-Path $taskDirectory 'changes.patch'

# Apply patch to repository
Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'applying' `
    -Message 'Applying patch to integration branch...' `
    -Fields @{ progressKind = 'applying' }

& git.exe -C $project.Path apply $patchPath
if ($LASTEXITCODE -ne 0) {
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'conflicted' `
        -Message 'Patch application resulted in merge conflict.' `
        -Fields @{ errorCode = 'git-conflict' }
    throw "Patch application failed with git conflict for task '$TaskId'."
}

Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'applied' `
    -Message 'Patch applied to integration branch successfully.' `
    -Fields @{
        appliedAt = [DateTime]::UtcNow.ToString('o')
        progressKind = 'applied'
    }

Update-HermesBrainProjection
Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
