<#
.SYNOPSIS
Seals a director worktree into deterministic patch evidence without applying it.
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
$contract = Read-JsonFile -Path (Join-Path $taskDirectory 'contract.json')
$status = Get-TaskStatus -TaskDirectory $taskDirectory
if ($status.state -ne 'editing') {
    throw 'Only an editing task can be sealed.'
}
if ($contract.executor -ne 'managed-sandbox') {
    throw 'Only managed sandbox tasks use the evidence sealing flow.'
}
Assert-GraphPreflightEvidence -Evidence $contract.graphEvidence

$project = Get-AuthorizedProject -ProjectPath $contract.projectRoot
Assert-CleanGitRepository -ProjectRoot $project.Path
$worktreePath = [string]$status.worktreePath
if (-not (Test-Path -LiteralPath $worktreePath -PathType Container)) {
    throw 'The director worktree is missing.'
}

$untracked = @(& git.exe -C $worktreePath ls-files --others --exclude-standard)
if ($LASTEXITCODE -ne 0) {
    throw 'Git could not inspect untracked sandbox files.'
}
foreach ($path in $untracked) {
    & git.exe -C $worktreePath add -N -- ([string]$path)
    if ($LASTEXITCODE -ne 0) {
        throw 'Git could not include an untracked file in patch evidence.'
    }
}

$changedFiles = @(& git.exe -C $worktreePath diff --name-only HEAD)
if ($LASTEXITCODE -ne 0) {
    throw 'Git could not enumerate sandbox changes.'
}
$changedFiles = @($changedFiles | ForEach-Object {
    ([string]$_).Trim().Replace('\', '/')
} | Where-Object { $_ } | Sort-Object -Unique)

$violations = [Collections.Generic.List[string]]::new()
if ($changedFiles.Count -eq 0) {
    $violations.Add('no-files-changed')
}
$allowedFiles = @($contract.patchPolicy.allowedFiles)
foreach ($changedFile in $changedFiles) {
    if ($changedFile -notin $allowedFiles) {
        $violations.Add('file-outside-allowlist')
    }
}

$addedLines = 0
$removedLines = 0
$numstat = @(& git.exe -C $worktreePath diff --numstat HEAD)
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
if ($addedLines -gt [int]$contract.patchPolicy.maxAddedLines) {
    $violations.Add('added-lines-limit')
}
if ($removedLines -gt [int]$contract.patchPolicy.maxRemovedLines) {
    $violations.Add('removed-lines-limit')
}

$diffInfo = [Diagnostics.ProcessStartInfo]::new()
$diffInfo.FileName = 'git.exe'
$diffInfo.Arguments = "-C `"$($worktreePath.Replace('"', '\"'))`" diff --binary --full-index --no-ext-diff --no-color --unified=3 HEAD"
$diffInfo.UseShellExecute = $false
$diffInfo.CreateNoWindow = $true
$diffInfo.RedirectStandardOutput = $true
$diffInfo.RedirectStandardError = $true
$diffProcess = [Diagnostics.Process]::new()
$diffProcess.StartInfo = $diffInfo
try {
    if (-not $diffProcess.Start()) {
        throw 'Git diff process could not start.'
    }
    $rawPatch = $diffProcess.StandardOutput.ReadToEnd()
    $diffError = $diffProcess.StandardError.ReadToEnd()
    $diffProcess.WaitForExit()
    if ($diffProcess.ExitCode -ne 0) {
        throw "Git could not capture the director patch: $diffError"
    }
}
finally {
    $diffProcess.Dispose()
}

$utf8 = [Text.UTF8Encoding]::new($false)
$patchText = $rawPatch.Replace("`r`n", "`n").Replace("`r", "`n")
if ($patchText.Length -gt 0 -and -not $patchText.EndsWith("`n")) {
    $patchText += "`n"
}
$patchPath = Join-Path $taskDirectory 'changes.patch'
[IO.File]::WriteAllText($patchPath, $patchText, $utf8)
$patchBytes = (Get-Item -LiteralPath $patchPath).Length
if ([IO.File]::ReadAllBytes($patchPath) -contains [byte]13) {
    $violations.Add('patch-contains-cr')
}
if ($patchBytes -gt [int]$contract.patchPolicy.maxPatchBytes) {
    $violations.Add('patch-bytes-limit')
}
if ([bool]$contract.patchPolicy.forbidLiteralEscapedNewlines) {
    $hasEscapedNewline = @(($patchText -split "`n") | Where-Object {
        $_ -match '^\+(?!\+\+)' -and
        (Test-SuspiciousLiteralEscapedNewline -AddedLine $_.Substring(1))
    }).Count -gt 0
    if ($hasEscapedNewline) {
        $violations.Add('literal-escaped-newline')
    }
}
if ($patchBytes -gt 0) {
    & git.exe -C $project.Path apply --check $patchPath
    if ($LASTEXITCODE -ne 0) {
        $violations.Add('git-apply-check-failed')
    }
}

$uniqueViolations = @($violations | Sort-Object -Unique)
$patchSha256 = if ($patchBytes -gt 0) {
    Get-FileSha256 -Path $patchPath
}
else {
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
}
$generation = 1
if ($null -ne $status.sealGeneration) {
    $generation = [int]$status.sealGeneration + 1
}
$evidence = [ordered]@{
    schemaVersion = 2
    sealedAt = [DateTime]::UtcNow.ToString('o')
    sealGeneration = $generation
    executor = 'managed-sandbox'
    passed = $uniqueViolations.Count -eq 0
    files = @($changedFiles)
    additions = $addedLines
    removals = $removedLines
    patchBytes = $patchBytes
    patchSha256 = $patchSha256
    violations = $uniqueViolations
}
Write-JsonAtomic `
    -Path (Join-Path $taskDirectory 'patch-validation.json') `
    -Value $evidence

if (-not $evidence.passed) {
    Set-TaskStatus `
        -TaskDirectory $taskDirectory `
        -State 'blocked' `
        -Message 'Patch evidence failed policy.' `
        -Fields @{
            errorCode = 'patch-policy-failed'
            patchPolicyPassed = $false
            sealGeneration = $generation
        }
    throw "Patch policy failed: $($uniqueViolations -join ', ')."
}

Set-TaskStatus `
    -TaskDirectory $taskDirectory `
    -State 'sealed' `
    -Message 'Director patch sealed and awaiting review.' `
    -Fields @{
        finishedAt = [DateTime]::UtcNow.ToString('o')
        filesChanged = $changedFiles.Count
        patchBytes = $patchBytes
        addedLines = $addedLines
        removedLines = $removedLines
        patchPolicyPassed = $true
        sealGeneration = $generation
        errorCode = $null
        progressKind = 'sealed'
    }

Update-HermesBrainProjection
Get-TaskStatus -TaskDirectory $taskDirectory | ConvertTo-Json -Compress
