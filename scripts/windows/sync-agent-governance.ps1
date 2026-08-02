<#
.SYNOPSIS
Synchronizes the canonical local-AI governance policy into global agent files.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$orchestratorRoot = [IO.Path]::GetFullPath(
    (Join-Path $PSScriptRoot '..\..')
).TrimEnd('\')
$policyPath = Join-Path $orchestratorRoot 'config\agent-governance.md'
if (-not (Test-Path -LiteralPath $policyPath -PathType Leaf)) {
    throw "Canonical governance policy not found: $policyPath"
}

$utf8NoBom = [Text.UTF8Encoding]::new($false)
$policy = [IO.File]::ReadAllText($policyPath, [Text.Encoding]::UTF8).Trim()
$startMarker = '<!-- LOCAL_AI_GOVERNANCE:START -->'
$endMarker = '<!-- LOCAL_AI_GOVERNANCE:END -->'

function Set-ManagedPolicyBlock {
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [Parameter(Mandatory)]
        [string]$AgentName
    )

    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $existing = if (Test-Path -LiteralPath $Path -PathType Leaf) {
        [IO.File]::ReadAllText($Path, [Text.Encoding]::UTF8)
    }
    else {
        ''
    }
    $managed = @"
$startMarker

## Politica local compartida para $AgentName

$policy

$endMarker
"@
    $pattern = '(?s)' + [regex]::Escape($startMarker) + '.*?' +
        [regex]::Escape($endMarker)
    $updated = if ([regex]::IsMatch($existing, $pattern)) {
        [regex]::Replace($existing, $pattern, $managed)
    }
    elseif ([string]::IsNullOrWhiteSpace($existing)) {
        $managed
    }
    else {
        $existing.TrimEnd() + [Environment]::NewLine +
            [Environment]::NewLine + $managed
    }

    $temporaryPath = "$Path.tmp-$([Guid]::NewGuid().ToString('N'))"
    [IO.File]::WriteAllText(
        $temporaryPath,
        $updated.TrimEnd() + [Environment]::NewLine,
        $utf8NoBom
    )
    Move-Item -LiteralPath $temporaryPath -Destination $Path -Force
}

Set-ManagedPolicyBlock `
    -Path (Join-Path $env:USERPROFILE '.claude\CLAUDE.md') `
    -AgentName 'Claude Code'
Set-ManagedPolicyBlock `
    -Path (Join-Path $env:USERPROFILE '.gemini\GEMINI.md') `
    -AgentName 'Google Antigravity'
Set-ManagedPolicyBlock `
    -Path (Join-Path $env:USERPROFILE '.config\opencode\AGENTS.md') `
    -AgentName 'OpenCode'
Set-ManagedPolicyBlock `
    -Path (Join-Path $env:USERPROFILE '.codex\AGENTS.md') `
    -AgentName 'Codex'

# Synchronize all Hermes native profiles SOUL.md files
$hermesProfilesDir = Join-Path $env:LOCALAPPDATA 'hermes\profiles'
if (Test-Path -LiteralPath $hermesProfilesDir -PathType Container) {
    Get-ChildItem -Path $hermesProfilesDir -Filter 'SOUL.md' -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
        $profileName = $_.Directory.Name
        Set-ManagedPolicyBlock -Path $_.FullName -AgentName "Hermes Profile ($profileName)"
    }
}

[pscustomobject]@{
    policy = $policyPath
    claude = Join-Path $env:USERPROFILE '.claude\CLAUDE.md'
    antigravity = Join-Path $env:USERPROFILE '.gemini\GEMINI.md'
    openCode = Join-Path $env:USERPROFILE '.config\opencode\AGENTS.md'
    codex = Join-Path $env:USERPROFILE '.codex\AGENTS.md'
    hermesProfilesSynced = (Test-Path -LiteralPath $hermesProfilesDir)
} | ConvertTo-Json -Compress
