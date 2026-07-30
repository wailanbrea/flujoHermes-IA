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

function Set-ProfileConfig(
    [string]$ProfileName,
    [bool]$Interactive
) {
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
    $toolsets = if ($Interactive) {
        @(
            'browser',
            'clarify',
            'code_execution',
            'context_engine',
            'delegation',
            'file',
            'image_gen',
            'kanban',
            'memory',
            'session_search',
            'skills',
            'terminal',
            'todo',
            'vision',
            'web'
        )
    }
    else {
        @('clarify', 'kanban', 'memory', 'skills', 'todo')
    }
    $toolsetYaml = "platform_toolsets:`n  cli:`n" +
        (($toolsets | ForEach-Object { "    - $_" }) -join "`n") +
        "`n"
    $text = [regex]::Replace(
        $text,
        '(?m)^platform_toolsets:\r?\n  cli:\r?\n(?:    - [^\r\n]*(?:\r?\n|$))*',
        $toolsetYaml
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
    foreach ($setting in @(
        @{ name = 'max_turns'; value = '120' },
        @{ name = 'verify_on_stop'; value = 'true' },
        @{ name = 'max_verify_nudges'; value = '2' }
    )) {
        if ($text -match ('(?m)^  ' + $setting.name + ':')) {
            $text = [regex]::Replace(
                $text,
                ('(?m)^(  ' + $setting.name + ':\s*).+$'),
                ('${1}' + $setting.value)
            )
        }
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

function Set-LocalProfileEnvironment([string]$ProfileName) {
    $mainEnvironment = Join-Path (Split-Path -Parent $profilesRoot) '.env'
    $profileEnvironment = Join-Path $profilesRoot "$ProfileName\.env"
    $allowedKeys = @('LM_API_KEY', 'LM_BASE_URL')
    $safeLines = [Collections.Generic.List[string]]::new()
    $safeLines.Add('# Managed local-only environment for this isolated profile.') |
        Out-Null
    if (Test-Path -LiteralPath $mainEnvironment -PathType Leaf) {
        foreach ($line in [IO.File]::ReadAllLines($mainEnvironment)) {
            if ($line -notmatch '^\s*([A-Za-z_][A-Za-z0-9_]*)=') { continue }
            if ($allowedKeys -contains $Matches[1]) {
                $safeLines.Add($line) | Out-Null
            }
        }
    }
    [IO.File]::WriteAllLines($profileEnvironment, $safeLines, $utf8)
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
    $controlledToolsets = @(
        'browser',
        'clarify',
        'code_execution',
        'context_engine',
        'delegation',
        'file',
        'image_gen',
        'kanban',
        'memory',
        'session_search',
        'skills',
        'terminal',
        'todo',
        'vision',
        'web'
    )
    $controlledToolsetYaml = "platform_toolsets:`n  cli:`n" +
        (($controlledToolsets | ForEach-Object { "    - $_" }) -join "`n") +
        "`n"
    $text = [regex]::Replace(
        $text,
        '(?m)^platform_toolsets:\r?\n  cli:\r?\n(?:    - [^\r\n]*(?:\r?\n|$))*',
        $controlledToolsetYaml
    )
    foreach ($setting in @(
        @{ name = 'max_turns'; value = '120' },
        @{ name = 'verify_on_stop'; value = 'true' },
        @{ name = 'max_verify_nudges'; value = '2' }
    )) {
        if ($text -match ('(?m)^  ' + $setting.name + ':')) {
            $text = [regex]::Replace(
                $text,
                ('(?m)^(  ' + $setting.name + ':\s*).+$'),
                ('${1}' + $setting.value)
            )
        }
    }
    $managedSoul = @"
<!-- HERMES-BRAIN-CONTROLLED-OPERATOR:START -->
Act as the controlled local operator for the user. Answer ordinary questions,
research current facts with evidence, query Graphify before broad repository
navigation, and create skills only in authorized skill directories with
validation.

For project changes, work only inside an isolated Git worktree with checkpoints,
allowlists, sealed evidence, and explicit integration approval. Never bypass
dangerous-command prompts, use yolo, expose secrets, deploy, mutate databases, or
contact third parties without separate authorization. Conversation memory is
context, not validated learning.
<!-- HERMES-BRAIN-CONTROLLED-OPERATOR:END -->
"@
    $soulPath = Join-Path (Split-Path -Parent $profilesRoot) 'SOUL.md'
    $soulText = if (Test-Path -LiteralPath $soulPath -PathType Leaf) {
        [IO.File]::ReadAllText($soulPath)
    }
    else {
        "# default`n"
    }
    if ($soulText -match '(?s)<!-- HERMES-BRAIN-CONTROLLED-OPERATOR:START -->.*?<!-- HERMES-BRAIN-CONTROLLED-OPERATOR:END -->') {
        $soulText = [regex]::Replace(
            $soulText,
            '(?s)<!-- HERMES-BRAIN-CONTROLLED-OPERATOR:START -->.*?<!-- HERMES-BRAIN-CONTROLLED-OPERATOR:END -->',
            $managedSoul.Trim()
        )
    }
    else {
        $soulText = $soulText.TrimEnd() + "`n`n" + $managedSoul.Trim() + "`n"
    }
    [IO.File]::WriteAllText($path, $text.Replace("`r`n", "`n"), $utf8)
    [IO.File]::WriteAllText(
        $soulPath,
        $soulText.Replace("`r`n", "`n"),
        $utf8
    )
}

foreach ($profile in @($config.profiles)) {
    $name = [string]$profile.runtimeId
    $interactive = [string]$profile.mode -eq 'controlled-operator'
    $description = if ($interactive) {
        (
            "$($profile.role). Answers, researches, authors validated skills, " +
            'and performs project work only in evidence-gated sandboxes.'
        )
    }
    else {
        (
            "$($profile.role). Advisory only: returns findings, risks, " +
            'recommendations, suggested tests, uncertainty, and evidence; never edits.'
        )
    }
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
    Set-ProfileConfig -ProfileName $name -Interactive $interactive
    Sync-ProfileSkills -ProfileName $name
    $copiedEnvironment = Join-Path $profilesRoot "$name\.env"
    if (Test-Path -LiteralPath $copiedEnvironment -PathType Leaf) {
        Remove-Item -LiteralPath $copiedEnvironment -Force
    }
    $soulPath = Join-Path $profilesRoot "$name\SOUL.md"
    $soul = if ($interactive) {
        @"
# $name

Act as the controlled local operator for the user.

- Answer ordinary questions directly and state uncertainty.
- For current facts, research with web or browser tools and cite the evidence.
- For repository questions, resolve the project and query Graphify before broad
  file searches.
- For project changes, create or use an isolated Git worktree, enable
  checkpoints, respect the allowlist, seal evidence, and require approval before
  integration. Never edit the source checkout directly.
- Create or update skills only in an authorized skills directory. Use lowercase
  hyphenated names, concise SKILL.md instructions, valid metadata, and run the
  skill validator. Never publish or install a skill externally without explicit
  approval.
- Use terminal, files, code execution, browser, and delegation only for the
  user's stated task. Never bypass dangerous-command approvals or use yolo.
- Never expose secrets, deploy, mutate a database, or contact third parties
  without separate explicit authorization.
- Treat conversation memory as context, not validated learning. Promote learning
  only from completed tasks with reproducible evidence and an approved benchmark.
"@
    }
    else {
        @"
# $name

Act only as a read-only specialist. Never edit files, execute terminal commands,
apply patches, commit, deploy, mutate databases, or request secrets.

Return one bounded brief with: findings, risks, recommendations, suggested tests,
uncertainty, and evidence used. If evidence is insufficient, say so.
"@
    }
    [IO.File]::WriteAllText($soulPath, $soul.Replace("`r`n", "`n"), $utf8)
}

# The local operator must use the installed QAT model and must never fall back
# automatically to the manually selected Qwen model.
Set-ProfileConfig -ProfileName 'localai' -Interactive $true
Sync-ProfileSkills -ProfileName 'localai'
$brainSoulPath = Join-Path $profilesRoot 'hermesbrain\SOUL.md'
$localSoulPath = Join-Path $profilesRoot 'localai\SOUL.md'
if (Test-Path -LiteralPath $brainSoulPath -PathType Leaf) {
    $localSoul = [IO.File]::ReadAllText($brainSoulPath).Replace(
        '# hermesbrain',
        '# localai'
    )
    [IO.File]::WriteAllText($localSoulPath, $localSoul, $utf8)
}
Sync-ProfileSkills -ProfileName 'default'
Set-DefaultBrainSafety

& hermes.exe memory off | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Could not select built-in memory for the default profile.'
}
& hermes.exe config set memory.write_approval true | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw 'Could not require approval for default memory writes.'
}
foreach ($setting in @(
    @{ key = 'agent.max_turns'; value = '120' },
    @{ key = 'agent.verify_on_stop'; value = 'true' },
    @{ key = 'agent.max_verify_nudges'; value = '2' },
    @{ key = 'agent.reasoning_effort'; value = 'none' },
    @{ key = 'model.max_tokens'; value = '4096' }
)) {
    & hermes.exe config set $setting.key $setting.value | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not configure default $($setting.key)."
    }
}

$runtimeProfiles = @('localai') + @(
    $config.profiles | ForEach-Object { [string]$_.runtimeId }
)
foreach ($profileName in $runtimeProfiles) {
    & hermes.exe --profile $profileName memory off | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not select built-in memory for $profileName."
    }
    & hermes.exe --profile $profileName config set memory.write_approval true |
        Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not require memory approval for $profileName."
    }
    $profileMaxTurns = if ($profileName -in @('localai', 'hermesbrain')) {
        '120'
    }
    else {
        '40'
    }
    foreach ($setting in @(
        @{ key = 'agent.max_turns'; value = $profileMaxTurns },
        @{ key = 'agent.verify_on_stop'; value = 'true' },
        @{ key = 'agent.max_verify_nudges'; value = '2' },
        @{ key = 'agent.reasoning_effort'; value = 'none' },
        @{
            key = 'model.max_tokens'
            value = if ($profileName -in @('localai', 'hermesbrain')) {
                '4096'
            }
            else {
                '2048'
            }
        }
    )) {
        & hermes.exe --profile $profileName config set `
            $setting.key $setting.value | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not configure $profileName $($setting.key)."
        }
    }
    Set-LocalProfileEnvironment -ProfileName $profileName
}

& (Join-Path $PSScriptRoot 'update-hermes-brain-status.ps1')
