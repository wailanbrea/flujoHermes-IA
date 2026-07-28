<#
.SYNOPSIS
Exercises Hermes process-tree termination and idempotent worktree cleanup.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

function Assert-Condition([bool]$Condition, [string]$Message) {
    if (-not $Condition) { throw $Message }
}

$source = Get-Content -LiteralPath (
    Join-Path $PSScriptRoot 'invoke-hermes-task.ps1'
) -Raw -Encoding UTF8
Assert-Condition `
    -Condition ($source -notmatch '\.Kill\(\$true\)') `
    -Message 'The worker still uses Process.Kill(Boolean).'
Assert-Condition `
    -Condition ($source -notmatch '--profile localai') `
    -Message 'The worker still loads the shared localai profile directly.'
Assert-Condition `
    -Condition ($source -match 'EnvironmentVariables\[''HERMES_HOME''\] = \$isolatedHermesHome') `
    -Message 'The worker does not isolate HERMES_HOME per task.'
Assert-Condition `
    -Condition ($source -match 'HERMES_WRITE_SAFE_ROOT=\$executionRoot') `
    -Message 'The per-task Hermes .env does not pin the worktree safe root.'

$fixtureRoot = Join-Path ([IO.Path]::GetTempPath()) (
    'hermes-process-test-' + [Guid]::NewGuid().ToString('N')
)
New-Item -ItemType Directory -Path $fixtureRoot | Out-Null
$fixture = Join-Path $fixtureRoot 'parent.ps1'
$childPidPath = Join-Path $fixtureRoot 'child.pid'
$fixtureBody = @'
param([string]$ChildPidPath)
$child = Start-Process ping.exe `
    -ArgumentList @('-t', '127.0.0.1') `
    -PassThru `
    -WindowStyle Hidden
[IO.File]::WriteAllText($ChildPidPath, [string]$child.Id)
Wait-Process -Id $child.Id
'@
[IO.File]::WriteAllText(
    $fixture,
    $fixtureBody,
    [Text.UTF8Encoding]::new($false)
)

$parent = $null
$childPid = $null
try {
    $parent = Start-Process powershell.exe `
        -ArgumentList @(
            '-NoProfile',
            '-NonInteractive',
            '-File',
            ('"{0}"' -f $fixture),
            '-ChildPidPath',
            ('"{0}"' -f $childPidPath)
        ) `
        -PassThru `
        -WindowStyle Hidden
    $deadline = [DateTime]::UtcNow.AddSeconds(10)
    while (-not (Test-Path -LiteralPath $childPidPath)) {
        if ([DateTime]::UtcNow -ge $deadline) {
            throw 'The process-tree fixture did not start its child in time.'
        }
        Start-Sleep -Milliseconds 100
    }
    $childPid = [int]([IO.File]::ReadAllText($childPidPath))
    Assert-Condition `
        -Condition ($null -ne (Get-Process -Id $childPid -ErrorAction SilentlyContinue)) `
        -Message 'The fixture child process was not running.'

    Stop-ProcessTree -ProcessId $parent.Id
    $parent.WaitForExit(5000) | Out-Null
    Assert-Condition `
        -Condition ($null -eq (Get-Process -Id $parent.Id -ErrorAction SilentlyContinue)) `
        -Message 'The fixture parent process survived cleanup.'
    Assert-Condition `
        -Condition ($null -eq (Get-Process -Id $childPid -ErrorAction SilentlyContinue)) `
        -Message 'The fixture child process survived cleanup.'
}
finally {
    if ($parent -and -not $parent.HasExited) {
        & taskkill.exe /PID $parent.Id /T /F 2>$null | Out-Null
    }
    if ($childPid -and (Get-Process -Id $childPid -ErrorAction SilentlyContinue)) {
        & taskkill.exe /PID $childPid /F 2>$null | Out-Null
    }
    if ($parent) { $parent.Dispose() }
    Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}

$orchestratorRoot = Get-OrchestratorRoot
$worktreeRoot = Get-HermesWorktreeRoot
$residualPath = Join-Path $worktreeRoot (
    'cleanup-test-' + [Guid]::NewGuid().ToString('N')
)
New-Item -ItemType Directory -Path $residualPath -Force | Out-Null
[IO.File]::WriteAllText(
    (Join-Path $residualPath 'marker.txt'),
    'test',
    [Text.UTF8Encoding]::new($false)
)
Remove-TaskWorktree `
    -ProjectRoot $orchestratorRoot `
    -WorktreePath $residualPath
Remove-TaskWorktree `
    -ProjectRoot $orchestratorRoot `
    -WorktreePath $residualPath
Assert-Condition `
    -Condition (-not (Test-Path -LiteralPath $residualPath)) `
    -Message 'Idempotent worktree cleanup left a residual directory.'

$outsidePath = Join-Path ([IO.Path]::GetTempPath()) 'outside-hermes-worktree'
$outsideRejected = $false
try {
    Remove-TaskWorktree `
        -ProjectRoot $orchestratorRoot `
        -WorktreePath $outsidePath
}
catch {
    $outsideRejected = $_.Exception.Message -like 'Refusing to remove*'
}
Assert-Condition `
    -Condition $outsideRejected `
    -Message 'Worktree cleanup accepted a path outside its runtime root.'

$exchangeId = 'hermes-20260728-010000-abcdef12'
$exchangePath = Get-TaskExchangeDirectory -TaskId $exchangeId
New-Item -ItemType Directory -Path $exchangePath -Force | Out-Null
[IO.File]::WriteAllText(
    (Join-Path $exchangePath 'marker.txt'),
    'test',
    [Text.UTF8Encoding]::new($false)
)
Remove-TaskExchange -TaskId $exchangeId
Assert-Condition `
    -Condition (-not (Test-Path -LiteralPath $exchangePath)) `
    -Message 'Exchange cleanup left a residual directory.'

Assert-Condition `
    -Condition (-not $worktreeRoot.StartsWith(
        $orchestratorRoot,
        [StringComparison]::OrdinalIgnoreCase
    )) `
    -Message 'Hermes worktrees still live under the source repository.'

'Hermes task lifecycle tests passed.'
