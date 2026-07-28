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
$exchangeDirectory = $null
$stalled = $false
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
    $worktreeRoot = Get-HermesWorktreeRoot
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
    $exchangeDirectory = Get-TaskExchangeDirectory -TaskId $TaskId
    New-Item -ItemType Directory -Path $exchangeDirectory -Force | Out-Null
    $localAiProfilePath = Join-Path (
        [Environment]::GetFolderPath('LocalApplicationData')
    ) 'hermes\profiles\localai'
    $localAiConfigPath = Join-Path $localAiProfilePath 'config.yaml'
    if (-not (Test-Path -LiteralPath $localAiConfigPath -PathType Leaf)) {
        throw 'The isolated localai Hermes profile is not configured.'
    }
    $isolatedHermesHome = Join-Path (
        Join-Path $exchangeDirectory 'profiles'
    ) $TaskId
    New-Item -ItemType Directory -Path $isolatedHermesHome -Force | Out-Null
    [IO.File]::Copy(
        $localAiConfigPath,
        (Join-Path $isolatedHermesHome 'config.yaml'),
        $false
    )
    [IO.File]::WriteAllText(
        (Join-Path $isolatedHermesHome '.env'),
        "HERMES_WRITE_SAFE_ROOT=$executionRoot`n",
        $utf8
    )
    $operatingPromptPath = Join-Path (Get-OrchestratorRoot) 'config\hermes-operating-prompt.md'
    if (-not (Test-Path -LiteralPath $operatingPromptPath -PathType Leaf)) {
        throw 'The versioned Hermes operating prompt is missing.'
    }
    $operatingPrompt = [IO.File]::ReadAllText($operatingPromptPath, $utf8)
    $graphContextPath = Join-Path $exchangeDirectory 'graph-context.txt'
    [IO.File]::WriteAllText(
        $graphContextPath,
        (($graphContext | Out-String).Trim()),
        $utf8
    )

    $executionContract = [ordered]@{
        taskId = $contract.taskId
        projectId = $contract.projectId
        workspacePath = $executionRoot
        graphContextPath = $graphContextPath
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
    $executionContractPath = Join-Path $exchangeDirectory 'execution-contract.json'
    Write-JsonAtomic `
        -Path $executionContractPath `
        -Value $executionContract

    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'executing' `
        -Message 'Hermes esta trabajando con LM Studio.' `
        -Fields @{
            worktreeActive = $true
            lastActivityAt = [DateTime]::UtcNow.ToString('o')
            elapsedSeconds = 0
            noProgressSeconds = 0
            progressKind = 'starting'
        }

    $prompt = "Apply these mandatory operating rules before the contract:`n`n" +
        $operatingPrompt.Trim() +
        "`n`nRead and execute the local task contract at `"" +
        $executionContractPath +
        '". Obey every boundary. Use the provided Graphify context before files. ' +
        'Your exact writable workspace is workspacePath; never use the source ' +
        'repository path. The contract and graph context are the only permitted ' +
        'read-only paths outside workspacePath. Browser access is allowed only ' +
        'to http://127.0.0.1:4310 and http://127.0.0.1:4311 for local visual ' +
        'validation. Do not access secrets, external networks, ' +
        'databases, deployments, or any other external path. Do not commit. ' +
        'Do not inspect .git metadata or infer any source repository path. ' +
        'Use only the file and Playwright tools provided. Do not attempt terminal ' +
        'commands; ' +
        'the director runs validation independently. ' +
        'Finish with the required concise report.'
    $stdoutPath = Join-Path $taskDirectory 'hermes-final.txt'
    $stderrPath = Join-Path $taskDirectory 'hermes-error.txt'
    $argumentLine = 'chat -q "' +
        $prompt.Replace('"', '\"') +
        '" -Q -t file,playwright --checkpoints --max-turns ' +
        [int]$contract.maxTurns +
        ' --source tool --no-restore-cwd --ignore-rules'
    $processInfo = [Diagnostics.ProcessStartInfo]::new()
    $processInfo.FileName = 'hermes.exe'
    $processInfo.Arguments = $argumentLine
    $processInfo.WorkingDirectory = $executionRoot
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $processInfo.EnvironmentVariables['HERMES_HOME'] = $isolatedHermesHome
    $processInfo.EnvironmentVariables['HERMES_WRITE_SAFE_ROOT'] = $executionRoot
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $processInfo
    if (-not $process.Start()) {
        throw 'Hermes process could not be started.'
    }
    $stdoutRead = $process.StandardOutput.ReadToEndAsync()
    $stderrRead = $process.StandardError.ReadToEndAsync()
    $completedInTime = $false
    $hermesExitCode = $null
    try {
        $startedAt = [DateTime]::UtcNow
        $lastActivityAt = $startedAt
        $lastCpu = [TimeSpan]::Zero
        $workspaceFingerprint = ''
        $agentLogPath = Join-Path $isolatedHermesHome 'logs\agent.log'
        $lastAgentLogLength = if (Test-Path -LiteralPath $agentLogPath) {
            (Get-Item -LiteralPath $agentLogPath).Length
        }
        else { 0 }
        $absoluteDeadline = $startedAt.AddSeconds([int]$contract.timeoutSeconds)
        $noProgressLimit = [int]$contract.noProgressTimeoutSeconds
        while (-not $process.WaitForExit(5000)) {
            $now = [DateTime]::UtcNow
            $process.Refresh()
            $cpu = $process.TotalProcessorTime
            $progressKind = 'waiting-model'
            if (($cpu - $lastCpu).TotalMilliseconds -ge 100) {
                $lastActivityAt = $now
                $lastCpu = $cpu
                $progressKind = 'agent-cpu'
            }
            if (Test-Path -LiteralPath $agentLogPath) {
                $agentLogLength = (Get-Item -LiteralPath $agentLogPath).Length
                if ($agentLogLength -gt $lastAgentLogLength) {
                    $lastAgentLogLength = $agentLogLength
                    $lastActivityAt = $now
                    $progressKind = 'agent-event'
                }
            }
            $currentFingerprint = (
                @(& git.exe -C $executionRoot status --porcelain) -join "`n"
            ) + '|' + (
                @(& git.exe -C $executionRoot diff --numstat HEAD) -join "`n"
            )
            if ($currentFingerprint -ne $workspaceFingerprint) {
                $workspaceFingerprint = $currentFingerprint
                if ($currentFingerprint) {
                    $lastActivityAt = $now
                    $progressKind = 'workspace-change'
                }
            }
            $elapsedSeconds = [int][Math]::Floor(($now - $startedAt).TotalSeconds)
            $noProgressSeconds = [int][Math]::Floor(
                ($now - $lastActivityAt).TotalSeconds
            )
            Set-TaskStatus `
                -TaskDirectory $taskDirectory `
                -State 'executing' `
                -Message 'Hermes esta trabajando con LM Studio.' `
                -Fields @{
                    lastActivityAt = $lastActivityAt.ToString('o')
                    elapsedSeconds = $elapsedSeconds
                    noProgressSeconds = $noProgressSeconds
                    progressKind = $progressKind
                }
            if ($noProgressSeconds -ge $noProgressLimit) {
                $stalled = $true
                break
            }
            if ($now -ge $absoluteDeadline) {
                break
            }
        }
        $completedInTime = $process.HasExited
        if (-not $completedInTime) {
            Stop-ProcessTree -ProcessId $process.Id
            if (-not $process.WaitForExit(5000)) {
                throw 'Hermes did not exit after its process tree was terminated.'
            }
        }
        $process.WaitForExit()
        $hermesExitCode = $process.ExitCode
        $stdoutText = $stdoutRead.GetAwaiter().GetResult()
        $stderrText = $stderrRead.GetAwaiter().GetResult()
    }
    finally {
        $process.Dispose()
    }
    $utf8NoBom = [Text.UTF8Encoding]::new($false)
    [IO.File]::WriteAllText($stdoutPath, $stdoutText, $utf8NoBom)
    [IO.File]::WriteAllText($stderrPath, $stderrText, $utf8NoBom)
    try {
        & (Join-Path $PSScriptRoot 'export-hermes-insights.ps1') `
            -Days 3650 |
            Out-Null
    }
    catch {
        Write-Warning 'Hermes Insights telemetry could not be refreshed.'
    }
    if ($stalled) {
        throw 'Hermes execution stalled without observable progress.'
    }
    if (-not $completedInTime) {
        throw 'Hermes execution timed out.'
    }
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
            progressKind = 'awaiting-review'
            elapsedSeconds = [int][Math]::Floor(
                ([DateTime]::UtcNow - $startedAt).TotalSeconds
            )
            noProgressSeconds = 0
        }
}
catch {
    $originalError = $_
    $safeMessage = $originalError.Exception.Message -replace
        [regex]::Escape([string]$contract.projectRoot), '[project]'
    if ($exchangeDirectory) {
        $safeMessage = $safeMessage -replace
            [regex]::Escape([string]$exchangeDirectory), '[exchange]'
    }
    if ($worktreePath) {
        $safeMessage = $safeMessage -replace
            [regex]::Escape([string]$worktreePath), '[workspace]'
    }
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
            progressKind = if ($stalled) { 'stalled' } else { 'failed' }
        }
    Write-Error $safeMessage
    exit 1
}
