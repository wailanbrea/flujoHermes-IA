Set-StrictMode -Version 2.0

function Get-OrchestratorRoot {
    return Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

function Get-HermesExternalRoot {
    $localAppData = [Environment]::GetFolderPath('LocalApplicationData')
    if (-not $localAppData) {
        throw 'LOCALAPPDATA is required for isolated Hermes runtime data.'
    }
    return Join-Path $localAppData 'local-ai-orchestrator'
}

function Get-HermesWorktreeRoot {
    return Join-Path (Get-HermesExternalRoot) 'hermes-worktrees'
}

function Get-HermesExchangeRoot {
    return Join-Path (Get-HermesExternalRoot) 'hermes-exchange'
}

function Get-TaskExchangeDirectory([string]$TaskId) {
    Assert-TaskId -TaskId $TaskId
    $root = [IO.Path]::GetFullPath((Get-HermesExchangeRoot)).TrimEnd('\')
    $resolved = [IO.Path]::GetFullPath((Join-Path $root $TaskId)).TrimEnd('\')
    if (-not $resolved.StartsWith(
        $root + '\',
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw 'Resolved exchange directory escaped the Hermes runtime root.'
    }
    return $resolved
}

# Process.Kill(Boolean) is unavailable in Windows PowerShell 5.1.
function Stop-ProcessTree(
    [int]$ProcessId,
    [int]$TimeoutMilliseconds = 10000
) {
    if ($ProcessId -le 0) {
        throw 'Stop-ProcessTree requires a positive process identifier.'
    }
    if (-not (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue)) {
        return
    }

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'taskkill.exe'
    $startInfo.Arguments = "/PID $ProcessId /T /F"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $taskkill = [Diagnostics.Process]::new()
    $taskkill.StartInfo = $startInfo
    try {
        if (-not $taskkill.Start()) {
            throw 'taskkill.exe could not be started.'
        }
        if (-not $taskkill.WaitForExit($TimeoutMilliseconds)) {
            $taskkill.Kill()
            $taskkill.WaitForExit()
            throw 'taskkill.exe did not finish within the cleanup timeout.'
        }
        $stdout = $taskkill.StandardOutput.ReadToEnd().Trim()
        $stderr = $taskkill.StandardError.ReadToEnd().Trim()
        $exitCode = $taskkill.ExitCode
    }
    finally {
        $taskkill.Dispose()
    }

    $exitDeadline = [DateTime]::UtcNow.AddSeconds(5)
    while (
        (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) -and
        [DateTime]::UtcNow -lt $exitDeadline
    ) {
        Start-Sleep -Milliseconds 100
    }
    if (Get-Process -Id $ProcessId -ErrorAction SilentlyContinue) {
        $detail = @($stderr, $stdout) |
            Where-Object { $_ } |
            Select-Object -First 1
        if ($detail) {
            $detail = ($detail -replace '[\r\n\t]+', ' ').Substring(
                0,
                [Math]::Min(120, ($detail -replace '[\r\n\t]+', ' ').Length)
            )
        }
        throw "Could not stop process tree $ProcessId (taskkill exit $exitCode): $detail"
    }
}

function Get-HermesRuntimeRoot {
    return Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\hermes-jobs'
}

# Windows PowerShell 5.1 writes a deserialized JSON array to the pipeline as one
# object rather than enumerating it, so `@(cmd | ConvertFrom-Json)` yields an
# array whose single element is itself the array. Assigning first, then wrapping,
# is what actually unrolls it. Property access on the un-unrolled form appears to
# work while exactly one item is present and silently breaks at two.
# Callers must wrap the result in @(...), matching how this codebase already
# collects native command output. Assigning first and then wrapping is what
# unrolls the array; wrapping the ConvertFrom-Json pipeline directly does not.
function ConvertFrom-JsonArray([string]$Json) {
    if (-not $Json -or -not $Json.Trim()) { return @() }
    $parsed = $Json | ConvertFrom-Json
    if ($null -eq $parsed) { return @() }
    return @($parsed)
}

# Windows PowerShell 5.1 turns any stderr output from a native executable into a
# terminating error while $ErrorActionPreference is 'Stop', even when the command
# succeeded. lms.exe reports normal progress on stderr, so its exit code is the
# only trustworthy signal.
function Invoke-NativeCommand(
    [string]$Executable,
    [string[]]$Arguments
) {
    $previous = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        $output = & $Executable @Arguments 2>&1
        $exitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previous
    }
    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = ($output | Out-String).Trim()
    }
}

# Single source of truth for the alias-to-model mapping. prepare-hermes-model.ps1
# loads the model and the worker pins it into the per-task profile; if the two
# ever disagreed, a task would silently run on a different model than the one
# that was prepared, and any comparison between models would be meaningless.
function Get-HermesModelKey([string]$Alias) {
    switch ($Alias) {
        'gemma' { return 'google/gemma-4-12b' }
        'qwen' { return 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive' }
        default { throw "Unknown Hermes model alias '$Alias'." }
    }
}

# Rewrites the top-level `model.default` and `fallback_model.model` entries so a
# task runs on exactly one known model. Pinning the fallback to the same key
# stops a mid-task provider switch from quietly contaminating the result.
function Set-HermesProfileModel(
    [string]$ConfigPath,
    [string]$ModelKey
) {
    $utf8 = [Text.UTF8Encoding]::new($false)
    $lines = [IO.File]::ReadAllLines($ConfigPath)
    $block = ''
    $defaultReplacements = 0
    $fallbackReplacements = 0
    for ($index = 0; $index -lt $lines.Length; $index++) {
        $line = $lines[$index]
        if ($line -match '^[^\s#]') {
            $block = ($line -split ':')[0].Trim()
            continue
        }
        if ($block -eq 'model' -and $line -match '^(\s+)default:\s') {
            $lines[$index] = "$($Matches[1])default: $ModelKey"
            $defaultReplacements += 1
        }
        elseif ($block -eq 'fallback_model' -and $line -match '^(\s+)model:\s') {
            $lines[$index] = "$($Matches[1])model: $ModelKey"
            $fallbackReplacements += 1
        }
    }
    if ($defaultReplacements -ne 1) {
        throw (
            'The Hermes profile does not declare exactly one model.default entry; ' +
            'refusing to run a task on an unverifiable model.'
        )
    }
    if ($fallbackReplacements -gt 1) {
        throw 'The Hermes profile declares more than one fallback model entry.'
    }
    [IO.File]::WriteAllText(
        $ConfigPath,
        (($lines -join "`n") + "`n"),
        $utf8
    )
}

# Hermes auto-installs a language server the first time a task touches a file it
# recognises, which reaches the npm registry. The execution contract declares
# externalNetwork as denied, so a task must not silently open that connection —
# and on a TypeScript project the install alone consumed the whole turn budget.
function Disable-HermesProfileLsp([string]$ConfigPath) {
    $utf8 = [Text.UTF8Encoding]::new($false)
    $lines = [Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]][IO.File]::ReadAllLines($ConfigPath))
    $blockIndex = -1
    $block = ''
    $sawEnabled = $false
    for ($index = 0; $index -lt $lines.Count; $index++) {
        $line = $lines[$index]
        if ($line -match '^[^\s#]') {
            $block = ($line -split ':')[0].Trim()
            if ($block -eq 'lsp') { $blockIndex = $index }
            continue
        }
        if ($block -ne 'lsp') { continue }
        if ($line -match '^(\s+)enabled:\s') {
            $lines[$index] = "$($Matches[1])enabled: false"
            $sawEnabled = $true
        }
        elseif ($line -match '^(\s+)install_strategy:\s') {
            $lines[$index] = "$($Matches[1])install_strategy: none"
        }
    }
    if ($blockIndex -lt 0) {
        $lines.Add('lsp:')
        $lines.Add('  enabled: false')
        $lines.Add('  install_strategy: none')
    }
    elseif (-not $sawEnabled) {
        $lines.Insert($blockIndex + 1, '  enabled: false')
    }
    [IO.File]::WriteAllText(
        $ConfigPath,
        (($lines -join "`n") + "`n"),
        $utf8
    )
}

# LM Studio is configured for explicit loading and exactly one language model at
# a time, so a mismatch here means the task would either stall or trigger an
# unsupervised load with unsafe defaults.
function Assert-HermesModelLoaded([string]$ModelKey) {
    try {
        $response = Invoke-RestMethod `
            -Uri 'http://127.0.0.1:1234/api/v0/models' `
            -TimeoutSec 10
    }
    catch {
        throw 'LM Studio is not reachable on 127.0.0.1:1234.'
    }
    $loaded = @($response.data | Where-Object {
        $_.state -eq 'loaded' -and $_.type -ne 'embeddings'
    })
    $match = @($loaded | Where-Object { $_.id -eq $ModelKey })
    if ($match.Count -ne 1) {
        $loadedNames = if ($loaded.Count -gt 0) {
            ($loaded | ForEach-Object { $_.id }) -join ', '
        }
        else { 'none' }
        throw (
            "The task requires '$ModelKey' but LM Studio has loaded: $loadedNames. " +
            'Run prepare-hermes-model.ps1 for the requested model first.'
        )
    }
}

function Get-GraphQueryCacheRoot {
    return Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\graph-cache'
}

# Set-StrictMode 2.0 throws on absent properties; runtime JSON is not guaranteed
# to carry every optional field, so all reads go through this accessor.
function Get-JsonProperty(
    [object]$Object,
    [string]$Name,
    $Default = $null
) {
    if ($null -eq $Object) { return $Default }
    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property -or $null -eq $property.Value) { return $Default }
    return $property.Value
}

function Assert-TaskId([string]$TaskId) {
    if ($TaskId -notmatch '^hermes-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$') {
        throw 'Invalid Hermes task identifier.'
    }
}

function Get-TaskDirectory([string]$TaskId) {
    Assert-TaskId -TaskId $TaskId
    $runtimeRoot = [IO.Path]::GetFullPath((Get-HermesRuntimeRoot)).TrimEnd('\')
    $taskDirectory = [IO.Path]::GetFullPath(
        (Join-Path $runtimeRoot $TaskId)
    ).TrimEnd('\')
    if (-not $taskDirectory.StartsWith(
        $runtimeRoot + '\',
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw 'Resolved task directory escaped the Hermes runtime root.'
    }
    return $taskDirectory
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required runtime file is missing: $(Split-Path -Leaf $Path)"
    }
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 |
        ConvertFrom-Json
}

function Write-JsonAtomic(
    [string]$Path,
    [object]$Value
) {
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    $utf8 = [Text.UTF8Encoding]::new($false)
    try {
        [IO.File]::WriteAllText(
            $temporary,
            ($Value | ConvertTo-Json -Depth 10),
            $utf8
        )
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Get-FileSha256([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'Cannot hash a missing file.'
    }
    return ([string](Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash).ToLowerInvariant()
}

function Get-SanitizedCorrectionFeedback([string]$Feedback) {
    if (-not $Feedback) {
        throw 'Correction feedback must be concrete and nonblank.'
    }
    $sanitized = ($Feedback -replace '[\x00-\x1F\x7F]+', ' ').Trim()
    $sanitized = $sanitized -replace '\s{2,}', ' '
    if (
        $sanitized.Length -lt 12 -or
        $sanitized -match '^(fix|fix it|try again|corrige|arregla|reintenta|mal)[.! ]*$'
    ) {
        throw 'Correction feedback must describe a concrete validation failure.'
    }
    if ($sanitized -match '(?i)(api[_-]?key|authorization|bearer|password|secret)\s*[:=]') {
        throw 'Correction feedback must not contain credentials or secrets.'
    }
    if ($sanitized.Length -gt 500) {
        $sanitized = $sanitized.Substring(0, 500).Trim()
    }
    return $sanitized
}

function Get-SanitizedValidationSummary([string]$Summary) {
    if (-not $Summary) {
        throw 'Validation summary must be concrete and nonblank.'
    }
    $sanitized = ($Summary -replace '[\x00-\x1F\x7F]+', ' ').Trim()
    $sanitized = $sanitized -replace '\s{2,}', ' '
    if (
        $sanitized.Length -lt 12 -or
        $sanitized -match '^(ok|pass|passed|bien|listo|todo ok)[.! ]*$'
    ) {
        throw 'Validation summary must name the commands actually run.'
    }
    if ($sanitized -match '(?i)(api[_-]?key|authorization|bearer|password|secret)\s*[:=]') {
        throw 'Validation summary must not contain credentials or secrets.'
    }
    if ($sanitized.Length -gt 500) {
        $sanitized = $sanitized.Substring(0, 500).Trim()
    }
    return $sanitized
}

# The dashboard-facing status is sanitized by design, so independent-validation
# evidence is persisted beside it instead of being silently dropped.
function Write-ValidationEvidence(
    [string]$TaskDirectory,
    [string]$Summary,
    [bool]$Passed,
    [string]$ReviewedBy
) {
    $record = [ordered]@{
        schemaVersion = 1
        recordedAt = [DateTime]::UtcNow.ToString('o')
        reviewedBy = $ReviewedBy
        passed = $Passed
        summary = Get-SanitizedValidationSummary -Summary $Summary
    }
    Write-JsonAtomic `
        -Path (Join-Path $TaskDirectory 'validation.json') `
        -Value $record
    return $record
}

function Test-SuspiciousLiteralEscapedNewline([string]$AddedLine) {
    if (-not $AddedLine.Contains('\n')) { return $false }
    $quote = [char]0
    $escaped = $false
    for ($index = 0; $index -lt $AddedLine.Length - 1; $index++) {
        $character = $AddedLine[$index]
        if ($escaped) {
            $escaped = $false
            continue
        }
        if ($quote -ne [char]0) {
            if ($character -eq '\') {
                $escaped = $true
            }
            elseif ($character -eq $quote) {
                $quote = [char]0
            }
            continue
        }
        if ($character -eq "'" -or $character -eq '"' -or $character -eq '`') {
            $quote = $character
            continue
        }
        if ($character -eq '\' -and $AddedLine[$index + 1] -eq 'n') {
            return $true
        }
    }
    return $false
}

function Assert-CleanGitRepository([string]$ProjectRoot) {
    $gitStatus = @(& git.exe -C $ProjectRoot status --porcelain)
    if ($LASTEXITCODE -ne 0 -or $gitStatus.Count -gt 0) {
        throw 'Source repository must be clean.'
    }
}

function Assert-PatchEvidence(
    [string]$ProjectRoot,
    [string]$TaskDirectory
) {
    $validationPath = Join-Path $TaskDirectory 'patch-validation.json'
    if (-not (Test-Path -LiteralPath $validationPath -PathType Leaf)) {
        throw 'Patch validation evidence is missing.'
    }
    $evidence = Read-JsonFile -Path $validationPath
    if (-not [bool]$evidence.passed) {
        throw 'Patch validation evidence did not pass.'
    }
    if (
        $evidence.patchBytes -isnot [ValueType] -or
        -not $evidence.patchSha256 -or
        ([string]$evidence.patchSha256) -notmatch '^[a-fA-F0-9]{64}$'
    ) {
        throw 'Patch validation evidence is incomplete.'
    }
    $patchPath = Join-Path $TaskDirectory 'changes.patch'
    if ([int64]$evidence.patchBytes -eq 0) {
        if (Test-Path -LiteralPath $patchPath -PathType Leaf) {
            if ((Get-Item -LiteralPath $patchPath).Length -ne 0) {
                throw 'Patch changed after validation.'
            }
        }
        return $evidence
    }
    if (-not (Test-Path -LiteralPath $patchPath -PathType Leaf)) {
        throw 'Validated patch is missing.'
    }
    if (
        (Get-Item -LiteralPath $patchPath).Length -ne [int64]$evidence.patchBytes -or
        (Get-FileSha256 -Path $patchPath) -ne ([string]$evidence.patchSha256).ToLowerInvariant()
    ) {
        throw 'Patch changed after validation.'
    }
    & git.exe -C $ProjectRoot apply --check $patchPath
    if ($LASTEXITCODE -ne 0) {
        throw 'Patch no longer passes git apply --check.'
    }
    return $evidence
}

function Get-ManagedRootPath([string]$Alias) {
    switch ($Alias) {
        'xampp-www' { return 'C:\xampp\php\www' }
        'studio-projects' { return 'C:\Users\waila\StudioProjects' }
        'android-studio-projects' {
            return 'C:\Users\waila\AndroidStudioProjects'
        }
        default { return $null }
    }
}

function Get-AuthorizedProject([string]$ProjectPath) {
    $resolved = (Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop).Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
        throw 'Hermes tasks require an existing project directory.'
    }
    $resolved = [IO.Path]::GetFullPath($resolved).TrimEnd('\')
    $orchestrator = [IO.Path]::GetFullPath(
        (Get-OrchestratorRoot)
    ).TrimEnd('\')
    if ($resolved.Equals(
        $orchestrator,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        return [pscustomobject]@{
            Id = 'local-ai-orchestrator'
            Name = 'local-ai-orchestrator'
            Path = $resolved
            GitScope = 'own'
        }
    }

    $catalogPath = Join-Path $orchestrator (
        'telemetry\runtime\project-catalog.json'
    )
    $catalog = Read-JsonFile -Path $catalogPath
    foreach ($project in $catalog.projects) {
        $managedRoot = Get-ManagedRootPath -Alias $project.rootAlias
        if (-not $managedRoot -or -not $project.relativePath) {
            continue
        }
        $candidate = [IO.Path]::GetFullPath(
            (Join-Path $managedRoot $project.relativePath)
        ).TrimEnd('\')
        if ($resolved.Equals(
            $candidate,
            [StringComparison]::OrdinalIgnoreCase
        )) {
            return [pscustomobject]@{
                Id = [string]$project.id
                Name = [string]$project.name
                Path = $resolved
                GitScope = [string]$project.gitScope
            }
        }
    }
    throw 'Project is not present in the authorized local catalog.'
}

# Launching is separated from queuing so a caller can validate and persist a task
# first, release any worktree it still holds, and only then start the worker. The
# worker's own `git worktree add` must never run while a cleanup is pruning.
function Start-HermesWorker([string]$TaskId) {
    Assert-TaskId -TaskId $TaskId
    if ($env:HERMES_TEST_DEFER_WORKER -eq '1') { return }
    $worker = Join-Path $PSScriptRoot 'invoke-hermes-task.ps1'
    $argumentLine = '-NoProfile -NonInteractive -ExecutionPolicy Bypass ' +
        "-File `"$worker`" -TaskId `"$TaskId`""
    Start-Process `
        -FilePath 'powershell.exe' `
        -ArgumentList $argumentLine `
        -WorkingDirectory (Get-OrchestratorRoot) `
        -WindowStyle Hidden | Out-Null
}

# A stalled or timed-out run used to throw before the diff was ever computed, so
# the director was told "0 files changed" when that number had never been
# measured and real work could be sitting in the worktree. This records what the
# model actually produced. It is written to partial.patch, never changes.patch,
# because it has passed no policy check and must never be applied by Approve.
function Save-PartialWorkEvidence(
    [string]$ExecutionRoot,
    [string]$TaskDirectory
) {
    $summary = [pscustomobject]@{
        Files = 0
        PatchBytes = 0
        Captured = $false
    }
    try {
        & git.exe -C $ExecutionRoot add -N -- . 2>$null | Out-Null
        $changed = @(
            & git.exe -C $ExecutionRoot diff --name-only HEAD 2>$null
        ) | Where-Object { $_ }
        if ($LASTEXITCODE -ne 0) { return $summary }
        $summary.Files = $changed.Count
        if ($changed.Count -eq 0) {
            $summary.Captured = $true
            return $summary
        }

        $info = [Diagnostics.ProcessStartInfo]::new()
        $info.FileName = 'git.exe'
        $info.Arguments = "-C `"$($ExecutionRoot.Replace('"', '\"'))`" " +
            'diff --binary --no-ext-diff HEAD'
        $info.UseShellExecute = $false
        $info.CreateNoWindow = $true
        $info.RedirectStandardOutput = $true
        $info.RedirectStandardError = $true
        $process = [Diagnostics.Process]::new()
        $process.StartInfo = $info
        try {
            if (-not $process.Start()) { return $summary }
            $raw = $process.StandardOutput.ReadToEnd()
            $process.StandardError.ReadToEnd() | Out-Null
            $process.WaitForExit()
            if ($process.ExitCode -ne 0) { return $summary }
        }
        finally {
            $process.Dispose()
        }

        $text = $raw.Replace("`r`n", "`n").Replace("`r", "`n")
        if ($text.Length -gt 0 -and -not $text.EndsWith("`n")) { $text += "`n" }
        $path = Join-Path $TaskDirectory 'partial.patch'
        [IO.File]::WriteAllText($path, $text, [Text.UTF8Encoding]::new($false))
        $summary.PatchBytes = (Get-Item -LiteralPath $path).Length
        $summary.Captured = $true
    }
    catch {
        # Salvage is best-effort; the underlying failure is what gets reported.
    }
    return $summary
}

function Get-TaskStatus([string]$TaskDirectory) {
    return Read-JsonFile -Path (Join-Path $TaskDirectory 'status.json')
}

function Set-TaskStatus(
    [string]$TaskDirectory,
    [string]$State,
    [string]$Message,
    [hashtable]$Fields = @{}
) {
    $path = Join-Path $TaskDirectory 'status.json'
    $current = if (Test-Path -LiteralPath $path) {
        Read-JsonFile -Path $path
    }
    else {
        [pscustomobject]@{}
    }
    $values = [ordered]@{}
    foreach ($property in $current.PSObject.Properties) {
        $values[$property.Name] = $property.Value
    }
    $values.state = $State
    $values.message = $Message
    $values.updatedAt = [DateTime]::UtcNow.ToString('o')
    foreach ($key in $Fields.Keys) {
        $values[$key] = $Fields[$key]
    }
    @($values.Keys) | Where-Object {
        $_ -match '(?i)(feedback|prompt|response|session.?id|tool.?arguments?|validationSummary|objective|acceptanceCriteria|constraints)'
    } | ForEach-Object {
        $values.Remove($_)
    }
    Write-JsonAtomic -Path $path -Value $values
}

function Remove-TaskWorktree(
    [string]$ProjectRoot,
    [string]$WorktreePath
) {
    if (-not $WorktreePath) { return }
    $runtimeRoots = @(
        [IO.Path]::GetFullPath((Get-HermesWorktreeRoot)).TrimEnd('\'),
        [IO.Path]::GetFullPath(
        (Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\hermes-worktrees')
        ).TrimEnd('\')
    )
    $resolved = [IO.Path]::GetFullPath($WorktreePath).TrimEnd('\')
    $insideRuntime = $false
    foreach ($runtimeRoot in $runtimeRoots) {
        if ($resolved.StartsWith(
            $runtimeRoot + '\',
            [StringComparison]::OrdinalIgnoreCase
        )) {
            $insideRuntime = $true
            break
        }
    }
    if (-not $insideRuntime) {
        throw 'Refusing to remove a worktree outside the Hermes runtime root.'
    }

    if (Test-Path -LiteralPath $resolved) {
        $previousErrorPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = 'Continue'
            & git.exe -C $ProjectRoot worktree remove --force $resolved 2>$null
        }
        finally {
            $ErrorActionPreference = $previousErrorPreference
        }

        if (Test-Path -LiteralPath $resolved) {
            $lastError = $null
            foreach ($attempt in 1..4) {
                try {
                    Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
                    break
                }
                catch {
                    $lastError = $_.Exception.Message
                    if ($attempt -lt 4) {
                        Start-Sleep -Milliseconds 500
                    }
                }
            }
            if (Test-Path -LiteralPath $resolved) {
                throw "Could not remove the isolated Hermes worktree after 4 attempts: $lastError"
            }
        }
    }

    $previousErrorPreference = $ErrorActionPreference
    try {
        $ErrorActionPreference = 'Continue'
        & git.exe -C $ProjectRoot worktree prune 2>$null
        $pruneExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousErrorPreference
    }
    if ($pruneExitCode -ne 0) {
        throw 'Git could not prune isolated Hermes worktree metadata.'
    }
}

# Director-facing digest. The whole point is a bounded, predictable context cost:
# every list below is capped so a large patch can never flood the director.
$script:BriefMaxFiles = 40
$script:BriefMaxHunks = 60
$script:BriefMaxReportChars = 1200

function Get-PatchDigest([string]$PatchPath) {
    $digest = [ordered]@{
        files = @()
        hunks = @()
        filesTruncated = $false
        hunksTruncated = $false
    }
    if (-not (Test-Path -LiteralPath $PatchPath -PathType Leaf)) {
        return $digest
    }
    $files = [Collections.Generic.List[object]]::new()
    $hunks = [Collections.Generic.List[string]]::new()
    $current = $null
    foreach ($line in [IO.File]::ReadAllLines($PatchPath)) {
        if ($line.StartsWith('diff --git ')) {
            $path = $line -replace '^diff --git a/(.+?) b/.+$', '$1'
            $current = [ordered]@{ path = $path; added = 0; removed = 0 }
            $files.Add($current)
            continue
        }
        if ($line.StartsWith('@@')) {
            if ($hunks.Count -lt $script:BriefMaxHunks) {
                $header = $line
                if ($header.Length -gt 120) {
                    $header = $header.Substring(0, 120)
                }
                $owner = if ($current) { $current.path } else { '?' }
                $hunks.Add("$owner $header")
            }
            else {
                $digest.hunksTruncated = $true
            }
            continue
        }
        if (-not $current) { continue }
        if ($line.StartsWith('+') -and -not $line.StartsWith('+++')) {
            $current.added += 1
        }
        elseif ($line.StartsWith('-') -and -not $line.StartsWith('---')) {
            $current.removed += 1
        }
    }
    if ($files.Count -gt $script:BriefMaxFiles) {
        $digest.filesTruncated = $true
        $digest.files = @($files | Select-Object -First $script:BriefMaxFiles)
    }
    else {
        $digest.files = @($files)
    }
    $digest.hunks = @($hunks)
    return $digest
}

function Get-ReportDigest([string]$ReportPath) {
    $digest = [ordered]@{
        outcome = 'unknown'
        tail = ''
        sourceBytes = 0
        truncated = $false
    }
    if (-not (Test-Path -LiteralPath $ReportPath -PathType Leaf)) {
        return $digest
    }
    $digest.sourceBytes = (Get-Item -LiteralPath $ReportPath).Length
    $text = ([IO.File]::ReadAllText($ReportPath))
    # Hermes writes a coloured TTY stream; the escape sequences are pure noise in
    # the director's context. `e is PowerShell 6+, so the character is explicit.
    $escape = [char]27
    $text = ($text -replace "$escape\[[0-9;]*[A-Za-z]", '').Trim()
    if (-not $text) { return $digest }
    $match = [regex]::Match($text, '(?im)^\s*outcome\s*:\s*(PASS|FAIL|BLOCKED)')
    if ($match.Success) {
        $digest.outcome = $match.Groups[1].Value.ToUpperInvariant()
    }
    # The required report is emitted last, so the tail carries the conclusion.
    if ($text.Length -gt $script:BriefMaxReportChars) {
        $digest.truncated = $true
        $text = $text.Substring($text.Length - $script:BriefMaxReportChars)
    }
    $digest.tail = ($text -replace '[\x00-\x08\x0B\x0C\x0E-\x1F]+', ' ')
    return $digest
}

function Get-HermesTaskBrief([string]$TaskId) {
    $taskDirectory = Get-TaskDirectory -TaskId $TaskId
    $status = Get-TaskStatus -TaskDirectory $taskDirectory
    $contract = Read-JsonFile -Path (Join-Path $taskDirectory 'contract.json')
    $patchPath = Join-Path $taskDirectory 'changes.patch'
    $reportPath = Join-Path $taskDirectory 'hermes-final.txt'

    $patchValidation = $null
    $validationPath = Join-Path $taskDirectory 'patch-validation.json'
    if (Test-Path -LiteralPath $validationPath -PathType Leaf) {
        $patchValidation = Read-JsonFile -Path $validationPath
    }

    $sourceArtifactBytes = 0
    foreach ($artifact in @(
        $patchPath,
        $reportPath,
        (Join-Path $taskDirectory 'contract.json'),
        (Join-Path $taskDirectory 'usage.json'),
        (Join-Path $taskDirectory 'status.json')
    )) {
        if (Test-Path -LiteralPath $artifact -PathType Leaf) {
            $sourceArtifactBytes += (Get-Item -LiteralPath $artifact).Length
        }
    }

    $state = [string](Get-JsonProperty -Object $status -Name 'state' -Default 'unknown')
    $errorCode = Get-JsonProperty -Object $status -Name 'errorCode'
    $nextAction = switch ($state) {
        'awaiting-review' {
            'Review the hunks below; read changes.patch only if they are ' +
            'insufficient. Then review-hermes-task.ps1 -Decision Approve.'
        }
        'validating' {
            'Run build, linters and tests independently, then ' +
            'review-hermes-task.ps1 -Decision Complete.'
        }
        'failed' {
            $salvage = [int](
                Get-JsonProperty -Object $status -Name 'partialFilesChanged' -Default 0
            )
            if ($salvage -gt 0) {
                "Inspect errorCode '$errorCode'. The run left $salvage changed " +
                'file(s) in partial.patch, unvalidated: read it to judge whether ' +
                'the work is worth a RequestChanges with concrete feedback.'
            }
            else {
                "Inspect errorCode '$errorCode'. Use -Decision RequestChanges " +
                'with concrete feedback, or narrow the contract.'
            }
        }
        'blocked' { 'Attempts exhausted. Re-scope the contract manually.' }
        'completed' { 'Nothing pending.' }
        'correction-requested' { 'A child task is running; wait on childTaskId.' }
        'queued' { 'Not started yet; wait instead of polling.' }
        'preparing' { 'Still running; wait instead of polling.' }
        'executing' { 'Still running; wait instead of polling.' }
        # 'rejected' is a legacy state the dashboard maps to 'blocked'. Reporting
        # an unrecognised state as "still running" would be a false progress claim.
        default { "Unrecognised state '$state'; inspect status.json directly." }
    }

    $brief = [ordered]@{
        schemaVersion = 1
        taskId = $TaskId
        state = $state
        errorCode = $errorCode
        projectId = [string](Get-JsonProperty -Object $contract -Name 'projectId' -Default '')
        phase = [string](Get-JsonProperty -Object $contract -Name 'phase' -Default '')
        mode = [string](Get-JsonProperty -Object $contract -Name 'mode' -Default '')
        model = [string](Get-JsonProperty -Object $contract -Name 'model' -Default 'unknown')
        attempt = [int](Get-JsonProperty -Object $status -Name 'attempt' -Default 1)
        maxAttempts = [int](Get-JsonProperty -Object $status -Name 'maxAttempts' -Default 3)
        childTaskId = Get-JsonProperty -Object $status -Name 'childTaskId'
        elapsedSeconds = [int](Get-JsonProperty -Object $status -Name 'elapsedSeconds' -Default 0)
        filesChanged = [int](Get-JsonProperty -Object $status -Name 'filesChanged' -Default 0)
        patchBytes = [int](Get-JsonProperty -Object $status -Name 'patchBytes' -Default 0)
        patchPolicyPassed = Get-JsonProperty -Object $patchValidation -Name 'passed'
        violations = @(Get-JsonProperty -Object $patchValidation -Name 'violations' -Default @())
        localTokens = [int64](Get-JsonProperty -Object $status -Name 'localTokens' -Default 0)
        partialFilesChanged = [int](
            Get-JsonProperty -Object $status -Name 'partialFilesChanged' -Default 0
        )
        partialPatchBytes = [int](
            Get-JsonProperty -Object $status -Name 'partialPatchBytes' -Default 0
        )
        patch = Get-PatchDigest -PatchPath $patchPath
        report = Get-ReportDigest -ReportPath $reportPath
        sourceArtifactBytes = $sourceArtifactBytes
        nextAction = $nextAction
    }
    return $brief
}

function Remove-TaskExchange([string]$TaskId) {
    $resolved = Get-TaskExchangeDirectory -TaskId $TaskId
    if (Test-Path -LiteralPath $resolved) {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
    }
}
