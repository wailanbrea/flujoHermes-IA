<#
.SYNOPSIS
Confirms the former local-writer batch cannot bypass Hermes Brain governance.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$submitScript = Join-Path $PSScriptRoot 'submit-hermes-task-batch.ps1'
$rejected = $false
try {
    & $submitScript `
        -ProjectPath (Get-OrchestratorRoot) `
        -Model gemma-qat `
        -ModificationAuthorized `
        -Tasks @(
            @{
                Objective = 'Legacy writer batch A must be rejected.'
                AcceptanceCriteria = @('n/a')
                AllowedFiles = @('README.md')
            },
            @{
                Objective = 'Legacy writer batch B must be rejected.'
                AcceptanceCriteria = @('n/a')
                AllowedFiles = @('AGENTS.md')
            }
        ) | Out-Null
}
catch {
    $rejected = $true
}
Assert-Condition $rejected 'The deprecated local-writer batch was accepted.'

$source = [IO.File]::ReadAllText($submitScript)
Assert-Condition `
    ($source -match 'submit-hermes-task\.ps1') `
    'The legacy batch no longer routes through the guarded submit entrypoint.'

'Hermes legacy batch guard tests passed.'
