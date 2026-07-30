<#
.SYNOPSIS
Creates an isolated Git worktree for a cloud director without starting local AI.
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

    [Parameter(Mandatory)]
    [ValidateCount(1, 100)]
    [string[]]$AllowedFiles,

    [ValidateRange(1, 20000)]
    [int]$MaxAddedLines = 800,

    [ValidateRange(0, 20000)]
    [int]$MaxRemovedLines = 400,

    [ValidateRange(1024, 10485760)]
    [int]$MaxPatchBytes = 262144,

    [ValidateSet('Codex', 'Claude', 'Antigravity', 'OpenCode')]
    [string]$RequestedBy = 'Codex'
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$project = Get-AuthorizedProject -ProjectPath $ProjectPath
if ($project.GitScope -ne 'own') {
    throw 'A director sandbox requires a project-owned Git repository.'
}
Assert-CleanGitRepository -ProjectRoot $project.Path

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

$taskId = 'hermes-{0}-{1}' -f (
    [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss')
), ([Guid]::NewGuid().ToString('N').Substring(0, 8))
$taskDirectory = Get-TaskDirectory -TaskId $taskId
$worktreeRoot = Get-HermesWorktreeRoot
$worktreePath = Join-Path $worktreeRoot $taskId
$createdAt = [DateTime]::UtcNow.ToString('o')

New-Item -ItemType Directory -Path $taskDirectory -Force | Out-Null
New-Item -ItemType Directory -Path $worktreeRoot -Force | Out-Null

$contract = [ordered]@{
    schemaVersion = 2
    taskId = $taskId
    createdAt = $createdAt
    projectId = $project.Id
    projectName = $project.Name
    projectRoot = $project.Path
    requestedBy = $RequestedBy
    executor = 'director'
    objective = $Objective
    acceptanceCriteria = @($AcceptanceCriteria)
    constraints = @($Constraints)
    mode = 'execute'
    phase = 'edit'
    modificationAuthorized = $true
    patchPolicy = [ordered]@{
        allowedFiles = @($normalizedAllowedFiles)
        maxAddedLines = $MaxAddedLines
        maxRemovedLines = $MaxRemovedLines
        maxPatchBytes = $MaxPatchBytes
        forbidLiteralEscapedNewlines = $true
        binaryChanges = 'denied'
        lineEndings = 'lf'
    }
    executionPolicy = [ordered]@{
        author = $RequestedBy
        localAi = 'advisory-read-only'
        externalNetwork = 'director-controlled'
        secrets = 'denied'
        deployments = 'denied'
        databaseMutation = 'denied'
        commits = 'denied'
        graphFirst = $true
        isolatedWorktree = $true
    }
}

Write-JsonAtomic -Path (Join-Path $taskDirectory 'contract.json') -Value $contract
Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'isolated' `
    -Message 'Sandbox allocation started.' `
    -Fields @{
        taskId = $taskId
        projectId = $project.Id
        projectName = $project.Name
        requestedBy = $RequestedBy
        executor = 'director'
        mode = 'execute'
        phase = 'edit'
        createdAt = $createdAt
        worktreePath = $worktreePath
        worktreeActive = $false
        filesChanged = 0
        patchBytes = 0
        validationPassed = $null
        sealGeneration = 0
        errorCode = $null
        progressKind = 'isolated'
    }

try {
    & git.exe -C $project.Path worktree add --quiet --detach $worktreePath HEAD
    if ($LASTEXITCODE -ne 0) {
        throw 'Git could not create the isolated director worktree.'
    }
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'editing' `
        -Message 'Director sandbox ready.' `
        -Fields @{
            worktreePath = $worktreePath
            worktreeActive = $true
            progressKind = 'editing'
            startedAt = [DateTime]::UtcNow.ToString('o')
        }
}
catch {
    if (Test-Path -LiteralPath $worktreePath) {
        Remove-TaskWorktree -ProjectRoot $project.Path -WorktreePath $worktreePath
    }
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'blocked' `
        -Message 'Sandbox creation failed.' `
        -Fields @{ errorCode = 'sandbox-creation-failed'; worktreeActive = $false }
    throw
}

Update-HermesBrainProjection
[ordered]@{
    taskId = $taskId
    sandboxPath = $worktreePath
    projectName = $project.Name
    state = 'editing'
    requestedBy = $RequestedBy
} | ConvertTo-Json -Compress
