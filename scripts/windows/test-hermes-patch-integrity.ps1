[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) (
    'hermes-patch-test-' + [Guid]::NewGuid().ToString('N')
)
$repository = Join-Path $fixtureRoot 'repository'
$worktree = Join-Path $fixtureRoot 'worktree'
$taskDirectory = Join-Path $fixtureRoot 'task'
$utf8 = [Text.UTF8Encoding]::new($false)

try {
    New-Item -ItemType Directory -Path $repository, $taskDirectory | Out-Null
    & git.exe -C $repository init --quiet
    & git.exe -C $repository config user.email 'hermes-test@localhost'
    & git.exe -C $repository config user.name 'Hermes Test'
    [IO.File]::WriteAllText((Join-Path $repository 'sample.ts'), "alpha`n`n", $utf8)
    & git.exe -C $repository add sample.ts
    & git.exe -C $repository commit --quiet -m baseline
    & git.exe -C $repository worktree add --quiet --detach $worktree HEAD
    [IO.File]::WriteAllText(
        (Join-Path $worktree 'sample.ts'),
        "alpha`nconst text = `"first\nsecond`";`n`n",
        $utf8
    )

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = 'git.exe'
    $startInfo.Arguments = "-C `"$worktree`" diff --binary --no-ext-diff HEAD"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    try {
        Assert-Condition $process.Start() 'Git diff did not start.'
        $patchText = $process.StandardOutput.ReadToEnd()
        $process.WaitForExit()
        Assert-Condition ($process.ExitCode -eq 0) 'Git diff failed.'
    }
    finally {
        $process.Dispose()
    }
    $patchText = $patchText.Replace("`r`n", "`n").Replace("`r", "`n")
    $patchPath = Join-Path $taskDirectory 'changes.patch'
    [IO.File]::WriteAllText($patchPath, $patchText, $utf8)
    Assert-Condition `
        -Condition (-not ([IO.File]::ReadAllBytes($patchPath) -contains [byte]13)) `
        -Message 'Serialized patch contains CR bytes.'
    Assert-Condition `
        -Condition ($patchText -match "(?m)^ \r?$\n?$") `
        -Message 'Final empty context line was not preserved.'
    Assert-Condition `
        -Condition (-not (Test-SuspiciousLiteralEscapedNewline 'const text = "first\nsecond";')) `
        -Message 'A legitimate TypeScript string was rejected.'
    Assert-Condition `
        -Condition (Test-SuspiciousLiteralEscapedNewline 'const a = 1;\nconst b = 2;') `
        -Message 'A suspicious escaped source-line insertion was not detected.'

    $evidence = [ordered]@{
        schemaVersion = 1
        passed = $true
        patchBytes = (Get-Item -LiteralPath $patchPath).Length
        patchSha256 = Get-FileSha256 -Path $patchPath
        files = @('sample.ts')
        additions = 1
        removals = 0
        violations = @()
    }
    Write-JsonAtomic `
        -Path (Join-Path $taskDirectory 'patch-validation.json') `
        -Value $evidence
    Assert-CleanGitRepository -ProjectRoot $repository
    $validated = Assert-PatchEvidence `
        -ProjectRoot $repository `
        -TaskDirectory $taskDirectory
    Assert-Condition ([bool]$validated.passed) 'Valid patch evidence was rejected.'

    [IO.File]::AppendAllText($patchPath, "`n", $utf8)
    $mutationRejected = $false
    try {
        Assert-PatchEvidence -ProjectRoot $repository -TaskDirectory $taskDirectory | Out-Null
    }
    catch {
        $mutationRejected = $_.Exception.Message -eq 'Patch changed after validation.'
    }
    Assert-Condition $mutationRejected 'A changed patch hash was accepted.'

    [IO.File]::WriteAllBytes(
        (Join-Path $worktree 'binary.bin'),
        [byte[]](0, 1, 2, 0, 255)
    )
    [IO.File]::WriteAllText(
        (Join-Path $worktree 'outside.ts'),
        "export const outside = true;`n",
        $utf8
    )
    & git.exe -C $worktree add -N -- .
    $changedFiles = @(& git.exe -C $worktree diff --name-only HEAD)
    $numstat = @(& git.exe -C $worktree diff --numstat HEAD)
    Assert-Condition `
        (@($changedFiles | Where-Object { $_ -eq 'outside.ts' }).Count -eq 1) `
        'Git did not expose the path outside the allowlist.'
    Assert-Condition `
        (@($numstat | Where-Object { $_ -match "^-\t-\tbinary\.bin$" }).Count -eq 1) `
        'Git did not expose the binary change marker.'

    $worker = Get-Content -LiteralPath (
        Join-Path $PSScriptRoot 'invoke-hermes-task.ps1'
    ) -Raw
    Assert-Condition ($worker -match "binary-change") 'Binary patch rejection is missing.'
    Assert-Condition ($worker -match "file-outside-allowlist") 'Allowlist rejection is missing.'
    Assert-Condition ($worker -match "git-apply-check-failed") 'Patch check evidence is missing.'
}
finally {
    if (Test-Path -LiteralPath $repository) {
        & git.exe -C $repository worktree remove --force $worktree 2>$null
    }
    if (Test-Path -LiteralPath $fixtureRoot) {
        Remove-Item -LiteralPath $fixtureRoot -Recurse -Force
    }
}

'Hermes patch integrity tests passed.'
