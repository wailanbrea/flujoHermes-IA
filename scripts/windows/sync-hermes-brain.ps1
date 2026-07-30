<#
.SYNOPSIS
Creates advisory Hermes profiles and synchronizes versioned Brain skills.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$root = Get-OrchestratorRoot
$config = Read-JsonFile -Path (Join-Path $root 'config\hermes-brain.json')
$profilesRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'hermes\profiles'
$existing = (Invoke-NativeCommand -Executable 'hermes.exe' -Arguments @('profile', 'list')).Output
$utf8 = [Text.UTF8Encoding]::new($false)

function Set-AdvisoryProfileConfig([string]$ProfileName) {
    $path = Join-Path $profilesRoot "$ProfileName\config.yaml"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Profile config is missing for $ProfileName."
    }
    $text = [IO.File]::ReadAllText($path)
    $text = [regex]::Replace(
        $text,
        '(?m)^(\s*default:\s*).+$',
        '${1}google/gemma-4-12b-qat',
        1
    )
    $text = [regex]::Replace(
        $text,
        '(?m)^fallback_model:\r?\n(?:^[ \t][^\r\n]*(?:\r?\n|$))*',
        "fallback_model:`n  provider: lmstudio`n  model: google/gemma-4-12b-qat`n  base_url: http://127.0.0.1:1234/v1`n"
    )
    if ($text -notmatch '(?m)^fallback_model:\s*$') {
        $text = $text.TrimEnd() +
            "`nfallback_model:`n  provider: lmstudio`n  model: google/gemma-4-12b-qat`n  base_url: http://127.0.0.1:1234/v1`n"
    }
    $text = [regex]::Replace(
        $text,
        '(?m)^platform_toolsets:\r?\n  cli:\r?\n(?:    - [^\r\n]*(?:\r?\n|$))*',
        "platform_toolsets:`n  cli:`n    - clarify`n    - kanban`n    - memory`n    - skills`n    - todo`n"
    )
    $text = [regex]::Replace(
        $text,
        '(?m)^mcp_servers:\r?\n(?:^[ \t][^\r\n]*(?:\r?\n|$))*',
        ''
    )
    if ($text -match '(?ms)^kanban:\r?\n') {
        if ($text -match '(?m)^\s+auto_decompose:') {
            $text = [regex]::Replace(
                $text,
                '(?m)^(\s+auto_decompose:\s*).+$',
                '${1}false'
            )
        }
        else {
            $text = $text -replace '(?m)^kanban:\s*$', "kanban:`n  auto_decompose: false"
        }
    }
    else {
        $text = $text.TrimEnd() + "`nkanban:`n  auto_decompose: false`n"
    }
    [IO.File]::WriteAllText($path, $text.Replace("`r`n", "`n"), $utf8)
}

function Sync-ProfileSkills([string]$ProfileName) {
    $destinationRoot = if ($ProfileName -eq 'default') {
        Join-Path (Split-Path -Parent $profilesRoot) 'skills'
    }
    else {
        Join-Path $profilesRoot "$ProfileName\skills"
    }
    New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null
    foreach ($skillName in @($config.skills.core + $config.skills.project)) {
        $source = Join-Path $root "skills\$skillName"
        if (-not (Test-Path -LiteralPath $source -PathType Container)) {
            if ($skillName -eq 'graphify') { continue }
            throw "Versioned skill is missing: $skillName"
        }
        $destination = Join-Path $destinationRoot $skillName
        if (Test-Path -LiteralPath $destination) {
            Remove-Item -LiteralPath $destination -Recurse -Force
        }
        Copy-Item -LiteralPath $source -Destination $destination -Recurse
    }
    $graphifySource = Join-Path $env:USERPROFILE '.codex\skills\graphify'
    if (Test-Path -LiteralPath $graphifySource -PathType Container) {
        $graphifyDestination = Join-Path $destinationRoot 'graphify'
        if (Test-Path -LiteralPath $graphifyDestination) {
            Remove-Item -LiteralPath $graphifyDestination -Recurse -Force
        }
        Copy-Item -LiteralPath $graphifySource -Destination $graphifyDestination -Recurse
    }
}

function Set-DefaultBrainSafety {
    $path = Join-Path (Split-Path -Parent $profilesRoot) 'config.yaml'
    $text = [IO.File]::ReadAllText($path)
    if ($text -match '(?m)^kanban:\s*$') {
        if ($text -match '(?m)^\s+auto_decompose:') {
            $text = [regex]::Replace(
                $text,
                '(?m)^(\s+auto_decompose:\s*).+$',
                '${1}false'
            )
        }
        else {
            $text = $text -replace '(?m)^kanban:\s*$', "kanban:`n  auto_decompose: false"
        }
    }
    else {
        $text = $text.TrimEnd() + "`nkanban:`n  auto_decompose: false`n"
    }
    if ($text -match '(?m)^curator:\s*$') {
        foreach ($entry in @(
            @{ name = 'consolidate'; value = 'false' },
            @{ name = 'prune_builtins'; value = 'false' }
        )) {
            if ($text -match ('(?m)^\s+' + $entry.name + ':')) {
                $text = [regex]::Replace(
                    $text,
                    ('(?m)^(\s+' + $entry.name + ':\s*).+$'),
                    ('${1}' + $entry.value)
                )
            }
            else {
                $text = $text -replace (
                    '(?m)^curator:\s*$'
                ), (
                    "curator:`n  $($entry.name): $($entry.value)"
                )
            }
        }
    }
    else {
        $text = $text.TrimEnd() +
            "`ncurator:`n  enabled: true`n  consolidate: false`n  prune_builtins: false`n"
    }
    [IO.File]::WriteAllText($path, $text.Replace("`r`n", "`n"), $utf8)
}

foreach ($profile in @($config.profiles)) {
    $name = [string]$profile.runtimeId
    $description = (
        "$($profile.role). Advisory only: returns findings, risks, " +
        'recommendations, suggested tests, uncertainty, and evidence; never edits.'
    )
    if ($existing -notmatch ('(?i)(^|\s)' + [regex]::Escape($name) + '(\s|$)')) {
        & hermes.exe profile create $name `
            --clone-from localai `
            --description $description | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not create Hermes profile $name."
        }
    }
    else {
        & hermes.exe profile describe $name --text $description | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not describe Hermes profile $name."
        }
    }
    Set-AdvisoryProfileConfig -ProfileName $name
    Sync-ProfileSkills -ProfileName $name
    $copiedEnvironment = Join-Path $profilesRoot "$name\.env"
    if (Test-Path -LiteralPath $copiedEnvironment -PathType Leaf) {
        Remove-Item -LiteralPath $copiedEnvironment -Force
    }
    $soulPath = Join-Path $profilesRoot "$name\SOUL.md"
    $soul = @"
# $name

Act only as a read-only specialist. Never edit files, execute terminal commands,
apply patches, commit, deploy, mutate databases, or request secrets.

Return one bounded brief with: findings, risks, recommendations, suggested tests,
uncertainty, and evidence used. If evidence is insufficient, say so.
"@
    [IO.File]::WriteAllText($soulPath, $soul.Replace("`r`n", "`n"), $utf8)
}

# The optional local advisor must use the actually installed QAT model and must
# never fall back automatically to the manually selected Qwen model.
Set-AdvisoryProfileConfig -ProfileName 'localai'
Sync-ProfileSkills -ProfileName 'localai'
Sync-ProfileSkills -ProfileName 'default'
Set-DefaultBrainSafety

& (Join-Path $PSScriptRoot 'update-hermes-brain-status.ps1')
