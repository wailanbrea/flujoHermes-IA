<#
.SYNOPSIS
Creates a bounded local task for Hermes and optionally waits for its result.

.DESCRIPTION
Codex supplies an exact project, objective, constraints, and acceptance criteria.
The task is persisted locally; dashboard telemetry only reads sanitized status.
Execute mode requires explicit modification authorization and an owned Git root.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$ProjectPath,

    [Parameter(Mandatory)]
    [ValidateLength(10, 4000)]
    [string]$Objective,

    [Parameter(Mandatory)]
    [ValidateCount(1, 20)]
    [string[]]$AcceptanceCriteria,

    [ValidateCount(0, 20)]
    [string[]]$Constraints = @(),

    [ValidateSet('analysis', 'execute')]
    [string]$Mode = 'analysis',

    [ValidateRange(5, 80)]
    [int]$MaxTurns = 30,

    [ValidateRange(60, 3600)]
    [int]$TimeoutSeconds = 1200,

    [switch]$ModificationAuthorized,

    [switch]$Wait
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$project = Get-AuthorizedProject -ProjectPath $ProjectPath
if ($project.GitScope -ne 'own') {
    throw 'Hermes delegation currently requires a project-owned Git repository.'
}
$projectStatus = @(& git.exe -C $project.Path status --porcelain)
if ($LASTEXITCODE -ne 0) {
    throw 'Git status failed for the delegated project.'
}
if ($projectStatus.Count -gt 0) {
    throw 'Hermes delegation requires a clean target worktree.'
}
if ($Mode -eq 'execute') {
    if (-not $ModificationAuthorized) {
        throw 'Execute mode requires -ModificationAuthorized.'
    }
}

$taskId = 'hermes-{0}-{1}' -f (
    [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
), ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$taskDirectory = Get-TaskDirectory -TaskId $taskId
New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null

$contract = [ordered]@{
    schemaVersion = 1
    taskId = $taskId
    createdAt = [DateTime]::UtcNow.ToString('o')
    projectId = $project.Id
    projectName = $project.Name
    projectRoot = $project.Path
    objective = $Objective
    acceptanceCriteria = @($AcceptanceCriteria)
    constraints = @($Constraints)
    mode = $Mode
    modificationAuthorized = $ModificationAuthorized.IsPresent
    maxTurns = $MaxTurns
    timeoutSeconds = $TimeoutSeconds
    toolsets = @('terminal', 'file', 'skills', 'todo')
    executionPolicy = [ordered]@{
        externalNetwork = 'denied'
        secrets = 'denied'
        deployments = 'denied'
        databaseMutation = 'denied'
        commits = 'denied'
        destructiveCommands = 'denied'
        graphFirst = $true
        isolatedWorktree = $true
    }
}
Write-JsonAtomic `
    -Path (Join-Path $taskDirectory 'contract.json') `
    -Value $contract
Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'queued' `
    -Message 'Esperando al ejecutor local.' `
    -Fields @{
        taskId = $taskId
        projectId = $project.Id
        projectName = $project.Name
        mode = $Mode
        createdAt = $contract.createdAt
        startedAt = $null
        finishedAt = $null
        filesChanged = 0
        patchBytes = 0
        validationPassed = $null
        attempt = 0
        maxAttempts = 1
        errorCode = $null
    }

$worker = Join-Path $PSScriptRoot 'invoke-hermes-task.ps1'
if ($Wait) {
    & $worker -TaskId $taskId
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
else {
    $argumentLine = '-NoProfile -NonInteractive -ExecutionPolicy Bypass ' +
        "-File `"$worker`" -TaskId `"$taskId`""
    Start-Process `
        -FilePath 'powershell.exe' `
        -ArgumentList $argumentLine `
        -WorkingDirectory (Get-OrchestratorRoot) `
        -WindowStyle Hidden | Out-Null
}

Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
