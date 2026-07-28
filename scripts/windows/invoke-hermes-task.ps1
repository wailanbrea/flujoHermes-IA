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

$phase = [string]$contract.phase
$toolsets = @($contract.toolsets)
$expectedToolset = switch ($phase) {
    'plan' { 'file' }
    'edit' { 'file' }
    'browser' { 'playwright' }
    default { throw 'Task contract contains an invalid execution phase.' }
}
if ($toolsets.Count -ne 1 -or $toolsets[0] -ne $expectedToolset) {
    throw 'Task contract toolsets do not match the execution phase.'
}
if (($phase -eq 'edit') -ne ($contract.mode -eq 'execute')) {
    throw 'Task contract phase and mode are inconsistent.'
}
$toolsetArgument = $expectedToolset
$patchPolicy = $contract.patchPolicy
$allowedFiles = @($patchPolicy.allowedFiles)
if ($phase -eq 'edit') {
    if (
        $allowedFiles.Count -eq 0 -or
        [int]$patchPolicy.maxAddedLines -lt 1 -or
        [int]$patchPolicy.maxRemovedLines -lt 0 -or
        [int]$patchPolicy.maxPatchBytes -lt 1024
    ) {
        throw 'Task contract contains an invalid patch policy.'
    }
}
elseif ($allowedFiles.Count -gt 0) {
    throw 'Non-edit phases cannot contain an allowed file list.'
}

$project = Get-AuthorizedProject -ProjectPath $contract.projectRoot
if ($project.Id -ne $contract.projectId) {
    throw 'Task project identity no longer matches the authorized catalog.'
}

$worktreePath = $null
$exchangeDirectory = $null
$stalled = $false
$taskUsageCaptured = $false
$taskUsageTokens = 0
$taskUsageAvoidedCostUsd = 0.0
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
        phase = $phase
        toolsets = @($toolsets)
        patchPolicy = $patchPolicy
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

    $toolInstruction = if ($toolsetArgument -eq 'playwright') {
        'Use only Playwright tools at http://127.0.0.1:4310 and ' +
        'http://127.0.0.1:4311; do not navigate elsewhere. '
    }
    else {
        'Use only file tools inside workspacePath; do not browse any URL. '
    }
    $prompt = "Apply these mandatory operating rules before the contract:`n`n" +
        $operatingPrompt.Trim() +
        "`n`nRead and execute the local task contract at `"" +
        $executionContractPath +
        '". Obey every boundary. Use the provided Graphify context before files. ' +
        'Your exact writable workspace is workspacePath; never use the source ' +
        'repository path. The contract and graph context are the only permitted ' +
        'read-only paths outside workspacePath. ' +
        $toolInstruction +
        'Do not access secrets, external networks, databases, deployments, or ' +
        'any other external path. Do not commit. Do not inspect .git metadata or ' +
        'infer any source repository path. Do not attempt terminal commands; ' +
        'the director runs validation independently. ' +
        'Finish with the required concise report.'
    $stdoutPath = Join-Path $taskDirectory 'hermes-final.txt'
    $stderrPath = Join-Path $taskDirectory 'hermes-error.txt'
    $argumentLine = 'chat -q "' +
        $prompt.Replace('"', '\"') +
        '" -Q -t ' +
        $toolsetArgument +
        ' --checkpoints --max-turns ' +
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
        $taskUsagePath = Join-Path $taskDirectory 'usage.json'
        & (Join-Path $PSScriptRoot 'export-hermes-insights.ps1') `
            -Days 3650 `
            -HermesHome $isolatedHermesHome `
            -OutputPath $taskUsagePath |
            Out-Null
        $taskUsage = Read-JsonFile -Path $taskUsagePath
        $taskUsageTokens = [int64]$taskUsage.overview.totalTokens
        $taskUsageAvoidedCostUsd = [double](
            $taskUsage.overview.avoidedGpt56SolCostUsd
        )
        $taskUsageCaptured = $true
    }
    catch {
        Write-Warning 'Per-task Hermes usage telemetry could not be captured.'
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
    $addedLines = 0
    $removedLines = 0
    $violations = [Collections.Generic.List[string]]::new()
    & git.exe -C $executionRoot add -N -- . 2>$null
    $changedFiles = @(
        & git.exe -C $executionRoot diff --name-only HEAD 2>$null
    )
    $normalizedChangedFiles = @($changedFiles | ForEach-Object {
        ([string]$_).Trim().Replace('\', '/')
    })
    $filesChanged = $normalizedChangedFiles.Count
    if ($contract.mode -eq 'analysis' -and $filesChanged -gt 0) {
        throw 'Hermes modified files during an analysis-only task.'
    }
    if ($contract.mode -eq 'execute') {
        if ($filesChanged -eq 0) {
            $violations.Add('no-files-changed')
        }
        foreach ($changedFile in $normalizedChangedFiles) {
            if ($changedFile -notin $allowedFiles) {
                $violations.Add('file-outside-allowlist')
            }
        }
        $numstat = @(& git.exe -C $executionRoot diff --numstat HEAD 2>$null)
        if ($LASTEXITCODE -ne 0) {
            throw 'Git could not calculate patch line metrics.'
        }
        foreach ($line in $numstat) {
            $parts = @(([string]$line) -split "`t", 3)
            if ($parts.Count -lt 3 -or $parts[0] -eq '-' -or $parts[1] -eq '-') {
                $violations.Add('binary-change')
                continue
            }
            $addedLines += [int]$parts[0]
            $removedLines += [int]$parts[1]
        }
        if ($addedLines -gt [int]$patchPolicy.maxAddedLines) {
            $violations.Add('added-lines-limit')
        }
        if ($removedLines -gt [int]$patchPolicy.maxRemovedLines) {
            $violations.Add('removed-lines-limit')
        }

        $patch = @(& git.exe -C $executionRoot diff --binary --no-ext-diff HEAD)
        if ($LASTEXITCODE -ne 0) {
            throw 'Git could not capture the Hermes patch.'
        }
        $patchPath = Join-Path $taskDirectory 'changes.patch'
        $patchText = (
            @($patch | ForEach-Object {
                ([string]$_).TrimEnd([char]13)
            }) -join "`n"
        ).TrimEnd() + "`n"
        [IO.File]::WriteAllText(
            $patchPath,
            $patchText,
            $utf8
        )
        $patchBytes = (Get-Item -LiteralPath $patchPath).Length
        if ($patchBytes -gt [int]$patchPolicy.maxPatchBytes) {
            $violations.Add('patch-bytes-limit')
        }
        if ([bool]$patchPolicy.forbidLiteralEscapedNewlines) {
            $hasEscapedNewline = @($patch | Where-Object {
                $_ -match '^\+(?!\+\+)' -and $_.Substring(1).Contains('\n')
            }).Count -gt 0
            if ($hasEscapedNewline) {
                $violations.Add('literal-escaped-newline')
            }
        }
    }

    $uniqueViolations = @($violations | Sort-Object -Unique)
    $patchValidation = [ordered]@{
        schemaVersion = 1
        passed = $uniqueViolations.Count -eq 0
        files = @($normalizedChangedFiles)
        additions = $addedLines
        removals = $removedLines
        patchBytes = $patchBytes
        violations = $uniqueViolations
    }
    Write-JsonAtomic `
        -Path (Join-Path $taskDirectory 'patch-validation.json') `
        -Value $patchValidation
    if (-not $patchValidation.passed) {
        throw "Hermes patch policy failed: $($uniqueViolations -join ', ')."
    }
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'awaiting-review' `
        -Message 'Resultado local listo para revision de Codex.' `
        -Fields @{
            finishedAt = [DateTime]::UtcNow.ToString('o')
            filesChanged = $filesChanged
            patchBytes = $patchBytes
            addedLines = $addedLines
            removedLines = $removedLines
            patchPolicyPassed = $true
            taskUsageCaptured = $taskUsageCaptured
            localTokens = $taskUsageTokens
            avoidedGpt56SolCostUsd = $taskUsageAvoidedCostUsd
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
            taskUsageCaptured = $taskUsageCaptured
            localTokens = $taskUsageTokens
            avoidedGpt56SolCostUsd = $taskUsageAvoidedCostUsd
            progressKind = if ($stalled) { 'stalled' } else { 'failed' }
        }
    Write-Error $safeMessage
    exit 1
}
