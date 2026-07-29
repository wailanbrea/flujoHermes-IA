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

function Remove-TaskExchange([string]$TaskId) {
    $resolved = Get-TaskExchangeDirectory -TaskId $TaskId
    if (Test-Path -LiteralPath $resolved) {
        Remove-Item -LiteralPath $resolved -Recurse -Force -ErrorAction Stop
    }
}
