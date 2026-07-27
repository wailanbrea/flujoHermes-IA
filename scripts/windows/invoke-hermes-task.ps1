<#
.SYNOPSIS
Executes one queued Hermes task in an isolated Git worktree.
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
$contractPath = Join-Path $taskDirectory 'contract.json'
$contract = Read-JsonFile -Path $contractPath
$status = Get-TaskStatus -TaskDirectory $taskDirectory
if ($status.state -ne 'queued') {
    throw 'Hermes worker only accepts queued tasks.'
}

$project = Get-AuthorizedProject -ProjectPath $contract.projectRoot
if ($project.Id -ne $contract.projectId) {
    throw 'Task project identity no longer matches the authorized catalog.'
}

$worktreePath = $null
try {
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'preparing' `
        -Message 'Preparando contexto y espacio aislado.' `
        -Fields @{
            attempt = 1
            startedAt = [DateTime]::UtcNow.ToString('o')
        }

    $globalGraph = Join-Path (
        [Environment]::GetFolderPath('UserProfile')
    ) '.graphify\global-graph.json'
    $graphQuestion = "[$($contract.projectId)] $($contract.objective)"
    $graphContext = & graphify.exe query $graphQuestion `
        --budget 1200 `
        --graph $globalGraph 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'Graphify could not prepare bounded project context.'
    }
    $utf8 = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText(
        (Join-Path $taskDirectory 'graph-context.txt'),
        (($graphContext | Out-String).Trim()),
        $utf8
    )

    $gitRoot = (& git.exe -C $project.Path rev-parse --show-toplevel).Trim()
    if ($LASTEXITCODE -ne 0) {
        throw 'Hermes delegation requires a valid Git root.'
    }
    $resolvedGitRoot = [IO.Path]::GetFullPath($gitRoot).TrimEnd('\')
    if (-not $resolvedGitRoot.Equals(
        $project.Path,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw 'Hermes delegation refuses inherited or nested Git roots.'
    }
    $worktreeRoot = Join-Path (
        Get-OrchestratorRoot
    ) 'telemetry\runtime\hermes-worktrees'
    New-Item -ItemType Directory -Path $worktreeRoot -Force | Out-Null
    $worktreePath = Join-Path $worktreeRoot $TaskId
    $previousErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & git.exe -C $project.Path worktree add --detach $worktreePath HEAD `
            2>$null
        $worktreeExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorPreference
    }
    if ($worktreeExitCode -ne 0) {
        throw 'Git could not create the isolated Hermes worktree.'
    }
    $executionRoot = $worktreePath

    $executionContract = [ordered]@{
        taskId = $contract.taskId
        projectId = $contract.projectId
        workspacePath = $executionRoot
        graphContextPath = Join-Path $taskDirectory 'graph-context.txt'
        objective = $contract.objective
        acceptanceCriteria = @($contract.acceptanceCriteria)
        constraints = @($contract.constraints)
        mode = $contract.mode
        policies = $contract.executionPolicy
        requiredFinalReport = @(
            'Outcome: PASS, FAIL, or BLOCKED',
            'Files changed and why',
            'Validation commands and results',
            'Residual risks'
        )
    }
    Write-JsonAtomic `
        -Path (Join-Path $taskDirectory 'execution-contract.json') `
        -Value $executionContract

    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'executing' `
        -Message 'Hermes esta trabajando con LM Studio.' `
        -Fields @{ worktreeActive = $true }

    $prompt = 'Read and execute the local task contract at "' +
        (Join-Path $taskDirectory 'execution-contract.json') +
        '". Obey every boundary. Use the provided Graphify context before files. ' +
        'Your exact writable workspace is workspacePath; never use the source ' +
        'repository path. The contract and graph context are the only permitted ' +
        'read-only paths outside workspacePath. Do not access secrets, networks, ' +
        'databases, deployments, or any other external path. Do not commit. ' +
        'Finish with the required concise report.'
    $stdoutPath = Join-Path $taskDirectory 'hermes-final.txt'
    $stderrPath = Join-Path $taskDirectory 'hermes-error.txt'
    $argumentLine = '--profile localai chat -q "' +
        $prompt.Replace('"', '\"') +
        '" -Q -t terminal,file,skills,todo --checkpoints --max-turns ' +
        [int]$contract.maxTurns +
        ' --source tool --no-restore-cwd'
    $processInfo = [Diagnostics.ProcessStartInfo]::new()
    $processInfo.FileName = 'hermes.exe'
    $processInfo.Arguments = $argumentLine
    $processInfo.WorkingDirectory = $executionRoot
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $processInfo
    if (-not $process.Start()) {
        throw 'Hermes process could not be started.'
    }
    $stdoutRead = $process.StandardOutput.ReadToEndAsync()
    $stderrRead = $process.StandardError.ReadToEndAsync()
    $completedInTime = $process.WaitForExit(
        [int]$contract.timeoutSeconds * 1000
    )
    if (-not $completedInTime) {
        $process.Kill($true)
    }
    $process.WaitForExit()
    $stdoutText = $stdoutRead.GetAwaiter().GetResult()
    $stderrText = $stderrRead.GetAwaiter().GetResult()
    $utf8NoBom = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($stdoutPath, $stdoutText, $utf8NoBom)
    [IO.File]::WriteAllText($stderrPath, $stderrText, $utf8NoBom)
    if (-not $completedInTime) {
        throw 'Hermes execution timed out.'
    }
    $hermesExitCode = $process.ExitCode
    if ($hermesExitCode -ne 0) {
        throw "Hermes returned exit code $hermesExitCode."
    }

    $sourceStatusAfter = @(& git.exe -C $project.Path status --porcelain)
    if ($LASTEXITCODE -ne 0 -or $sourceStatusAfter.Count -gt 0) {
        throw 'Hermes containment failed: the source repository changed.'
    }

    $filesChanged = 0
    $patchBytes = 0
    & git.exe -C $executionRoot add -N -- . 2>$null
    $changedFiles = @(
        & git.exe -C $executionRoot diff --name-only HEAD 2>$null
    )
    $filesChanged = $changedFiles.Count
    if ($contract.mode -eq 'analysis' -and $filesChanged -gt 0) {
        throw 'Hermes modified files during an analysis-only task.'
    }
    if ($contract.mode -eq 'execute') {
        $patch = & git.exe -C $executionRoot diff --binary --no-ext-diff HEAD
        if ($LASTEXITCODE -ne 0) {
            throw 'Git could not capture the Hermes patch.'
        }
        $patchPath = Join-Path $taskDirectory 'changes.patch'
        [IO.File]::WriteAllText(
            $patchPath,
            (($patch | Out-String).TrimEnd() + [Environment]::NewLine),
            $utf8
        )
        $patchBytes = (Get-Item -LiteralPath $patchPath).Length
    }

    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'awaiting-review' `
        -Message 'Resultado local listo para revision de Codex.' `
        -Fields @{
            finishedAt = [DateTime]::UtcNow.ToString('o')
            filesChanged = $filesChanged
            patchBytes = $patchBytes
            worktreePath = $worktreePath
            errorCode = $null
        }
}
catch {
    $originalError = $_
    $safeMessage = $originalError.Exception.Message -replace
        [regex]::Escape([string]$contract.projectRoot), '[project]'
    $safeMessage = ($safeMessage -replace '[\r\n\t]+', ' ').Substring(
        0,
        [Math]::Min(180, ($safeMessage -replace '[\r\n\t]+', ' ').Length)
    )
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'failed' `
        -Message 'La ejecucion local fallo; requiere revision.' `
        -Fields @{
            finishedAt = [DateTime]::UtcNow.ToString('o')
            errorCode = $safeMessage
            worktreePath = $worktreePath
        }
    Write-Error $safeMessage
    exit 1
}
