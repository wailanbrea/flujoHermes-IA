<#
.SYNOPSIS
Publishes a sanitized fixed-context budget for managed Hermes profiles.
#>
[CmdletBinding()]
param(
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$configPath = Join-Path $root 'config\hermes-brain.json'
$outputPath = Join-Path $root 'telemetry\runtime\hermes-prompt-budget.json'
$utf8 = [Text.UTF8Encoding]::new($false)

$config = [IO.File]::ReadAllText($configPath) | ConvertFrom-Json
$profiles = @($config.profiles)
if ($profiles.Count -eq 0) {
    throw 'Hermes Brain config has no managed profiles.'
}

if ($ValidateOnly) {
    [pscustomobject]@{
        valid = $true
        profiles = $profiles.Count
        output = 'telemetry/runtime/hermes-prompt-budget.json'
    } | ConvertTo-Json -Compress
    return
}

$hermesExecutable = (Get-Command hermes.exe -ErrorAction Stop).Source
$runs = [Collections.Generic.List[object]]::new()
foreach ($managedProfile in $profiles) {
    $profileName = [string]$managedProfile.runtimeId
    if ($profileName -notmatch '^[A-Za-z0-9_-]+$') {
        throw "Unsafe Hermes profile name: $profileName"
    }
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $hermesExecutable
    $startInfo.Arguments = "--profile `"$profileName`" prompt-size --json"
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    if (-not $process.Start()) {
        throw "Could not start prompt-size for $profileName."
    }
    $runs.Add([pscustomobject]@{
        profile = $managedProfile
        process = $process
        standardOutput = $process.StandardOutput.ReadToEndAsync()
        standardError = $process.StandardError.ReadToEndAsync()
    })
}

$measurements = [Collections.Generic.List[object]]::new()
try {
    foreach ($run in $runs) {
        $managedProfile = $run.profile
        $profileName = [string]$managedProfile.runtimeId
        try {
            if (-not $run.process.WaitForExit(20000)) {
                $run.process.Kill()
                throw 'prompt-size timed out'
            }
            $raw = $run.standardOutput.GetAwaiter().GetResult()
            $null = $run.standardError.GetAwaiter().GetResult()
            if ($run.process.ExitCode -ne 0) {
                throw "prompt-size exited with $($run.process.ExitCode)"
            }
            $value = $raw | ConvertFrom-Json
        $systemPromptBytes = [int64]$value.system_prompt.bytes
        $toolSchemaBytes = [int64]$value.tools.json_bytes
        $totalFixedBytes = $systemPromptBytes + $toolSchemaBytes
        $measurements.Add([pscustomobject]@{
            profile = $profileName
            mode = [string]$managedProfile.mode
            state = 'healthy'
            model = [string]$value.model
            tools = [int]$value.tools.count
            systemPromptBytes = $systemPromptBytes
            skillsIndexBytes = [int64]$value.skills_index.bytes
            toolSchemaBytes = $toolSchemaBytes
            totalFixedBytes = $totalFixedBytes
            estimatedFixedTokens = [int][Math]::Ceiling($totalFixedBytes / 4)
        })
        }
        catch {
            $measurements.Add([pscustomobject]@{
                profile = $profileName
                mode = [string]$managedProfile.mode
                state = 'unavailable'
                model = $null
                tools = 0
                systemPromptBytes = 0
                skillsIndexBytes = 0
                toolSchemaBytes = 0
                totalFixedBytes = 0
                estimatedFixedTokens = 0
            })
        }
    }
}
finally {
    foreach ($run in $runs) {
        if (-not $run.process.HasExited) {
            $run.process.Kill()
        }
        $run.process.Dispose()
    }
}

$available = @($measurements | Where-Object state -eq 'healthy')
$tokenValues = @($available | ForEach-Object estimatedFixedTokens)
$payload = [ordered]@{
    schemaVersion = 1
    generatedAt = [DateTimeOffset]::UtcNow.ToString('o')
    state = if ($available.Count -eq $profiles.Count) {
        'healthy'
    }
    elseif ($available.Count -gt 0) {
        'degraded'
    }
    else {
        'offline'
    }
    estimation = 'bytes-divided-by-four'
    summary = [ordered]@{
        configuredProfiles = $profiles.Count
        availableProfiles = $available.Count
        minimumEstimatedTokens = if ($tokenValues.Count) {
            ($tokenValues | Measure-Object -Minimum).Minimum
        }
        else {
            0
        }
        maximumEstimatedTokens = if ($tokenValues.Count) {
            ($tokenValues | Measure-Object -Maximum).Maximum
        }
        else {
            0
        }
    }
    profiles = @($measurements)
}

$directory = Split-Path -Parent $outputPath
[IO.Directory]::CreateDirectory($directory) | Out-Null
$temporaryPath = "$outputPath.$PID.tmp"
$backupPath = "$outputPath.$PID.bak"
try {
    [IO.File]::WriteAllText(
        $temporaryPath,
        (($payload | ConvertTo-Json -Depth 6) + "`n"),
        $utf8
    )
    if (Test-Path -LiteralPath $outputPath -PathType Leaf) {
        if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
            [IO.File]::Delete($backupPath)
        }
        [IO.File]::Replace($temporaryPath, $outputPath, $backupPath)
    }
    else {
        [IO.File]::Move($temporaryPath, $outputPath)
    }
}
finally {
    if (Test-Path -LiteralPath $temporaryPath -PathType Leaf) {
        [IO.File]::Delete($temporaryPath)
    }
    if (Test-Path -LiteralPath $backupPath -PathType Leaf) {
        [IO.File]::Delete($backupPath)
    }
}

$payload | ConvertTo-Json -Depth 6
