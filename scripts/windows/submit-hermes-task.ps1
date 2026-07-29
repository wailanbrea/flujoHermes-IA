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

    # A patch the director has to read is a direct context cost: 256 KB is roughly
    # 65k tokens, which cancels out the saving delegation is meant to produce.
    # Raise it deliberately per task when a change genuinely needs more room.
    [ValidateRange(1024, 10485760)]
    [int]$MaxPatchBytes = 32768,

    # A literal \n outside a quoted string is never valid source, and models
    # emit them when they lose track of escaping mid-edit. The check was opt-in,
    # so a contract that forgot it accepted a patch that could not compile.
    [switch]$AllowLiteralEscapedNewlines,

    # The worker clamps this to 18. Accepting more here told a director it had a
    # bigger budget than the run would actually get, so the ceiling is stated
    # where it is asked for.
    [ValidateRange(5, 18)]
    [int]$MaxTurns = 18,

    [ValidateRange(60, 3600)]
    [int]$TimeoutSeconds = 1200,

    [ValidateRange(60, 900)]
    [int]$NoProgressTimeoutSeconds = 180,

    # How long an edit-phase task may keep reading before its first write. Reading
    # refreshes the activity clock, so this needs its own budget, but it must be
    # generous enough for a slow model to finish reading a large file.
    [ValidateRange(60, 1800)]
    [int]$ReadOnlyStallSeconds = 300,

    [ValidateSet('Codex', 'Claude', 'Antigravity', 'OpenCode')]
    [string]$RequestedBy = 'Codex',

    # Pins the task to one prepared model. Recorded in the contract so a result
    # can always be attributed to the model that actually produced it.
    [ValidateSet('gemma', 'gemma-qat', 'qwen')]
    [string]$Model = 'gemma',

    [ValidateRange(1, 3)]
    [int]$Attempt = 1,

    [ValidateRange(1, 3)]
    [int]$MaxAttempts = 3,

    [string]$CorrectionOf = '',

    [switch]$ModificationAuthorized,

    [switch]$Wait,

    # -Wait blocks for up to TimeoutSeconds. An AI director's tool calls cap out
    # around 600 s, so a long -Wait cannot return and forces token-costly status
    # polling instead. Use wait-hermes-task.ps1, or opt in from a real terminal.
    [switch]$AllowLongWait,

    # Validates and queues the task without starting the worker, so the caller can
    # finish releasing Git resources before Start-HermesWorker is invoked.
    [switch]$DeferWorker
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
if ($Wait -and $TimeoutSeconds -gt 570 -and -not $AllowLongWait) {
    throw (
        'A blocking -Wait of ' + $TimeoutSeconds + 's exceeds the tool-call ' +
        'budget of an AI director. Submit without -Wait and follow with ' +
        'wait-hermes-task.ps1, or pass -AllowLongWait from an interactive shell.'
    )
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
    model = $Model
    modelKey = Get-HermesModelKey -Alias $Model
    objective = $Objective
    acceptanceCriteria = @($AcceptanceCriteria)
    constraints = @($Constraints)
    mode = $Mode
    phase = $Phase
    modificationAuthorized = $ModificationAuthorized.IsPresent
    maxTurns = $MaxTurns
    timeoutSeconds = $TimeoutSeconds
    noProgressTimeoutSeconds = $NoProgressTimeoutSeconds
    readOnlyStallSeconds = $ReadOnlyStallSeconds
    toolsets = @($toolsets)
    correctionOf = $CorrectionOf
    attempt = $Attempt
    maxAttempts = $MaxAttempts
    patchPolicy = [ordered]@{
        allowedFiles = @($normalizedAllowedFiles)
        maxAddedLines = $MaxAddedLines
        maxRemovedLines = $MaxRemovedLines
        maxPatchBytes = $MaxPatchBytes
        forbidLiteralEscapedNewlines = -not $AllowLiteralEscapedNewlines.IsPresent
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
        model = $Model
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

if ($Wait) {
    $worker = Join-Path $PSScriptRoot 'invoke-hermes-task.ps1'
    & $worker -TaskId $taskId
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
elseif (-not $DeferWorker) {
    Start-HermesWorker -TaskId $taskId
}

Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
