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

    [ValidateSet('plan', 'edit', 'browser')]
    [string]$Phase,

    [string[]]$AllowedFiles = @(),

    [ValidateRange(1, 10000)]
    [int]$MaxAddedLines = 400,

    [ValidateRange(0, 10000)]
    [int]$MaxRemovedLines = 200,

    [ValidateRange(1024, 10485760)]
    [int]$MaxPatchBytes = 262144,

    [switch]$ForbidLiteralEscapedNewlines,

    [ValidateRange(5, 80)]
    [int]$MaxTurns = 30,

    [ValidateRange(60, 3600)]
    [int]$TimeoutSeconds = 1200,

    [ValidateRange(60, 900)]
    [int]$NoProgressTimeoutSeconds = 180,

    [ValidateSet('Codex', 'Claude', 'Antigravity', 'OpenCode')]
    [string]$RequestedBy = 'Codex',

    [ValidateRange(1, 3)]
    [int]$Attempt = 1,

    [ValidateRange(1, 3)]
    [int]$MaxAttempts = 3,

    [string]$CorrectionOf = '',

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
if (-not $Phase) {
    $Phase = if ($Mode -eq 'execute') { 'edit' } else { 'plan' }
}
if ($Phase -eq 'edit' -and $Mode -ne 'execute') {
    throw 'The edit phase requires execute mode.'
}
if ($Phase -ne 'edit' -and $Mode -ne 'analysis') {
    throw 'Plan and browser phases require analysis mode.'
}
if ($Attempt -gt $MaxAttempts) {
    throw "Attempt ($Attempt) exceeds MaxAttempts ($MaxAttempts)."
}
$toolsets = switch ($Phase) {
    'browser' { @('playwright') }
    default { @('file') }
}
$normalizedAllowedFiles = @($AllowedFiles | ForEach-Object {
    $candidate = ([string]$_).Trim().Replace('\', '/')
    $segments = @($candidate.Split('/'))
    if (
        -not $candidate -or
        $candidate.StartsWith('/') -or
        $candidate -match '^[A-Za-z]:' -or
        $candidate -match '[*?]' -or
        $segments -contains '..' -or
        $segments -contains '.' -or
        $candidate -eq '.git' -or
        $candidate.StartsWith('.git/')
    ) {
        throw 'AllowedFiles contains an unsafe project-relative path.'
    }
    $candidate
} | Sort-Object -Unique)
if ($Phase -eq 'edit' -and $normalizedAllowedFiles.Count -eq 0) {
    throw 'The edit phase requires at least one allowed file.'
}
if ($Phase -ne 'edit' -and $normalizedAllowedFiles.Count -gt 0) {
    throw 'Only the edit phase accepts allowed files.'
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
    requestedBy = $RequestedBy
    objective = $Objective
    acceptanceCriteria = @($AcceptanceCriteria)
    constraints = @($Constraints)
    mode = $Mode
    phase = $Phase
    modificationAuthorized = $ModificationAuthorized.IsPresent
    maxTurns = $MaxTurns
    timeoutSeconds = $TimeoutSeconds
    noProgressTimeoutSeconds = $NoProgressTimeoutSeconds
    toolsets = @($toolsets)
    correctionOf = $CorrectionOf
    attempt = $Attempt
    maxAttempts = $MaxAttempts
    patchPolicy = [ordered]@{
        allowedFiles = @($normalizedAllowedFiles)
        maxAddedLines = $MaxAddedLines
        maxRemovedLines = $MaxRemovedLines
        maxPatchBytes = $MaxPatchBytes
        forbidLiteralEscapedNewlines = $ForbidLiteralEscapedNewlines.IsPresent
    }
    executionPolicy = [ordered]@{
        externalNetwork = 'denied'
        loopbackBrowser = '127.0.0.1:4310,127.0.0.1:4311'
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
        requestedBy = $RequestedBy
        mode = $Mode
        phase = $Phase
        createdAt = $contract.createdAt
        startedAt = $null
        finishedAt = $null
        filesChanged = 0
        patchBytes = 0
        validationPassed = $null
        attempt = $Attempt
        maxAttempts = $MaxAttempts
        errorCode = $null
        lastActivityAt = $null
        elapsedSeconds = 0
        noProgressSeconds = 0
        progressKind = 'queued'
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
