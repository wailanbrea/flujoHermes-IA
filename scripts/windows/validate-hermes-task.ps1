<#
.SYNOPSIS
Executes deterministic Quality Gates for a sealed task without manual overrides.
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

if ($status.state -notin @('sealed', 'validating')) {
    throw "Task '$TaskId' must be in 'sealed' or 'validating' state to run validation pipeline."
}

# Set state to validating
Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'validating' `
    -Message 'Executing deterministic Quality Gates validation...' `
    -Fields @{
        progressKind = 'validating'
        validatingStartedAt = [DateTime]::UtcNow.ToString('o')
    }

# Execute Quality Gates deterministically
$validationPassed = $true
$validationSummary = 'Deterministic Quality Gates passed successfully.'
$failures = @()

# Run patch gate check
try {
    Assert-PatchEvidence -ProjectRoot $project.Path -TaskDirectory $taskDirectory | Out-Null
} catch {
    $validationPassed = $false
    $failures += $_.Exception.Message
}

$evidence = Write-ValidationEvidence `
    -TaskDirectory $taskDirectory `
    -Summary (if ($failures.Count -eq 0) { $validationSummary } else { $failures -join '; ' }) `
    -Passed $validationPassed `
    -ReviewedBy 'QualityGate'

Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State (if ($validationPassed) { 'validating' } else { 'editing' }) `
    -Message (if ($validationPassed) { 'Quality Gates passed. Ready for approval.' } else { 'Quality Gates failed.' }) `
    -Fields @{
        validationPassed = $validationPassed
        validationRecordedAt = $evidence.recordedAt
        progressKind = if ($validationPassed) { 'awaiting-approval' } else { 'validation-failed' }
    }

Update-HermesBrainProjection
Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
