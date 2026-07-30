<#
.SYNOPSIS
Creates role-scoped Hermes profiles and synchronizes their required skills.
#>
[CmdletBinding()]
param(
    [switch]$ValidateOnly
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$root = Get-OrchestratorRoot
$config = Read-JsonFile -Path (Join-Path $root 'config\hermes-brain.json')
$profilesRoot = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'hermes\profiles'
$hermesRoot = Split-Path -Parent $profilesRoot
$defaultSkillsRoot = Join-Path $hermesRoot 'skills'
$hermesAgentRoot = Join-Path $hermesRoot 'hermes-agent'
$installedSkillRoots = @(
    $defaultSkillsRoot,
    (Join-Path $hermesAgentRoot 'skills'),
    (Join-Path $hermesAgentRoot 'optional-skills')
)
$existing = (Invoke-NativeCommand -Executable 'hermes.exe' -Arguments @('profile', 'list')).Output
$utf8 = [Text.UTF8Encoding]::new($false)

function Get-ModeConfig([string]$Mode) {
    $property = $config.profileModes.PSObject.Properties[$Mode]
    if (-not $property) {
        throw "Unknown Hermes profile mode: $Mode"
    }
    return $property.Value
}

function Get-RoleSkills([string]$SkillSet) {
    $property = $config.skills.roleSets.PSObject.Properties[$SkillSet]
    if (-not $property) {
        throw "Unknown Hermes skill set: $SkillSet"
    }
    return @($property.Value | ForEach-Object { [string]$_ })
}

function Remove-ManagedDirectory(
    [string]$Path,
    [string]$AllowedRoot
) {
    $fullPath = [IO.Path]::GetFullPath($Path)
    $fullRoot = [IO.Path]::GetFullPath($AllowedRoot).TrimEnd('\', '/')
    if (-not $fullPath.StartsWith(
        $fullRoot + [IO.Path]::DirectorySeparatorChar,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw "Refusing to remove a directory outside its managed root: $fullPath"
    }
    if (Test-Path -LiteralPath $fullPath -PathType Container) {
        $item = Get-Item -LiteralPath $fullPath -Force
        if ($item.LinkType) {
            throw "Refusing to remove a linked managed directory: $fullPath"
        }
        Remove-Item -LiteralPath $fullPath -Recurse -Force
    }
}

function Set-ProfileConfig(
    [string]$ProfileName,
    [string]$Mode
) {
    $path = Join-Path $profilesRoot "$ProfileName\config.yaml"
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
        throw "Profile config is missing for $ProfileName."
    }
    $text = [IO.File]::ReadAllText($path)
    $text = [regex]::new(
        '^(\s{2}default:\s*).+$',
        [Text.RegularExpressions.RegexOptions]::Multiline
    ).Replace($text, '${1}google/gemma-4-12b-qat', 1)
    $text = [regex]::new(
        '^(\s{2}provider:\s*).+$',
        [Text.RegularExpressions.RegexOptions]::Multiline
    ).Replace($text, '${1}lmstudio', 1)
    $text = [regex]::new(
        '^(\s{2}base_url:\s*).+$',
        [Text.RegularExpressions.RegexOptions]::Multiline
    ).Replace($text, '${1}http://127.0.0.1:1234/v1', 1)
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
        '(?m)^moa:\r?\n(?:^[ \t][^\r\n]*(?:\r?\n|$))*',
        "moa:`n  enabled: false`n"
    )
    if ($text -notmatch '(?m)^moa:\s*$') {
        $text = $text.TrimEnd() + "`nmoa:`n  enabled: false`n"
    }
    $modeConfig = Get-ModeConfig -Mode $Mode
    $toolsets = @($modeConfig.toolsets | ForEach-Object { [string]$_ })
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
        @{ name = 'max_turns'; value = [string]$modeConfig.maxTurns },
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

function Get-InstalledSkillSources {
    $sources = @{}
    foreach ($skillsRoot in $installedSkillRoots) {
        if (-not (Test-Path -LiteralPath $skillsRoot -PathType Container)) {
            continue
        }
        foreach ($skillFile in Get-ChildItem `
            -LiteralPath $skillsRoot `
            -Filter 'SKILL.md' `
            -File `
            -Recurse
        ) {
            $name = $skillFile.Directory.Name
            if (-not $sources.ContainsKey($name)) {
                $sources[$name] = $skillFile.Directory.FullName
            }
        }
    }
    return $sources
}

$installedSkillSources = Get-InstalledSkillSources

function Resolve-SkillSource([string]$SkillName) {
    $versionedSource = Join-Path $root "skills\$SkillName"
    if (Test-Path -LiteralPath $versionedSource -PathType Container) {
        return $versionedSource
    }
    if ($SkillName -eq 'graphify') {
        $graphifySource = Join-Path $env:USERPROFILE '.codex\skills\graphify'
        if (Test-Path -LiteralPath $graphifySource -PathType Container) {
            return $graphifySource
        }
    }
    if ($installedSkillSources.ContainsKey($SkillName)) {
        return [string]$installedSkillSources[$SkillName]
    }
    throw "Required Hermes skill is unavailable: $SkillName"
}

function Test-SkillExistsInRoot(
    [string]$SkillsRoot,
    [string]$SkillName
) {
    if (-not (Test-Path -LiteralPath $SkillsRoot -PathType Container)) {
        return $false
    }
    foreach ($skillFile in Get-ChildItem `
        -LiteralPath $SkillsRoot `
        -Filter 'SKILL.md' `
        -File `
        -Recurse
    ) {
        if ($skillFile.Directory.Name -eq $SkillName) {
            return $true
        }
    }
    return $false
}

if ($ValidateOnly) {
    $resolvedSkills = [Collections.Generic.HashSet[string]]::new(
        [StringComparer]::OrdinalIgnoreCase
    )
    foreach ($profile in @($config.profiles)) {
        Get-ModeConfig -Mode ([string]$profile.mode) | Out-Null
        foreach ($skillName in Get-RoleSkills -SkillSet ([string]$profile.skillSet)) {
            Resolve-SkillSource -SkillName $skillName | Out-Null
            $resolvedSkills.Add($skillName) | Out-Null
        }
    }
    [ordered]@{
        valid = $true
        profiles = @($config.profiles).Count
        modes = @($config.profileModes.PSObject.Properties).Count
        skillSets = @($config.skills.roleSets.PSObject.Properties).Count
        resolvedSkills = $resolvedSkills.Count
    } | ConvertTo-Json -Compress
    return
}

function Sync-ProfileSkills(
    [string]$ProfileName,
    [string]$SkillSet,
    [bool]$PruneBundled
) {
    $destinationRoot = if ($ProfileName -eq 'default') {
        $defaultSkillsRoot
    }
    else {
        Join-Path $profilesRoot "$ProfileName\skills"
    }
    New-Item -ItemType Directory -Path $destinationRoot -Force | Out-Null

    if ($PruneBundled) {
        & hermes.exe --profile $ProfileName skills opt-out --remove --yes |
            Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not prune unmodified bundled skills for $ProfileName."
        }
    }

    $selectedSkills = Get-RoleSkills -SkillSet $SkillSet
    if ($PruneBundled) {
        $unselectedDirectories = @(
            Get-ChildItem `
                -LiteralPath $destinationRoot `
                -Filter 'SKILL.md' `
                -File `
                -Recurse |
                Where-Object {
                    $selectedSkills -notcontains $_.Directory.Name
                } |
                ForEach-Object { $_.Directory.FullName } |
                Sort-Object -Unique
        )
        foreach ($directory in $unselectedDirectories) {
            Remove-ManagedDirectory `
                -Path $directory `
                -AllowedRoot $destinationRoot
        }
    }
    $managedSkills = @(
        $config.skills.core
        $config.skills.project
        $config.skills.roleSets.PSObject.Properties |
            ForEach-Object { @($_.Value) }
    ) | ForEach-Object { [string]$_ } | Sort-Object -Unique
    foreach ($skillName in $managedSkills) {
        if ($selectedSkills -contains $skillName) { continue }
        Remove-ManagedDirectory `
            -Path (Join-Path $destinationRoot $skillName) `
            -AllowedRoot $destinationRoot
    }

    foreach ($skillName in $selectedSkills) {
        $source = Resolve-SkillSource -SkillName $skillName
        $isVersioned = $source.StartsWith(
            [IO.Path]::GetFullPath((Join-Path $root 'skills')) +
                [IO.Path]::DirectorySeparatorChar,
            [StringComparison]::OrdinalIgnoreCase
        ) -or $skillName -eq 'graphify'
        if (
            -not $isVersioned -and
            (Test-SkillExistsInRoot `
                -SkillsRoot $destinationRoot `
                -SkillName $skillName)
        ) {
            continue
        }
        $destination = Join-Path $destinationRoot $skillName
        if (Test-Path -LiteralPath $destination) {
            Remove-ManagedDirectory `
                -Path $destination `
                -AllowedRoot $destinationRoot
        }
        Copy-Item -LiteralPath $source -Destination $destination -Recurse
    }
}

function Set-LocalProfileEnvironment(
    [string]$ProfileName,
    [string]$Mode
) {
    $modeConfig = Get-ModeConfig -Mode $Mode
    $mainEnvironment = Join-Path $hermesRoot '.env'
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
    $terminalCompression = $config.terminalCompression
    if ($null -ne $terminalCompression) {
        $enabledProfiles = @($terminalCompression.enabledProfiles)
        if ($enabledProfiles -notcontains $ProfileName) {
            $safeLines.Add('RTK_DISABLED=1') | Out-Null
        }
    }
    $scratchRoot = Join-Path $hermesRoot "profile-sandboxes\$ProfileName"
    New-Item -ItemType Directory -Path $scratchRoot -Force | Out-Null
    $writeRoots = if ($modeConfig.writeScope -eq 'managed-worktrees') {
        @(
            (Get-HermesWorktreeRoot),
            (Join-Path $profilesRoot "$ProfileName\skills")
        )
    }
    else {
        @($scratchRoot)
    }
    foreach ($writeRoot in $writeRoots) {
        New-Item -ItemType Directory -Path $writeRoot -Force | Out-Null
    }
    $safeLines.Add(
        'HERMES_WRITE_SAFE_ROOT=' + ($writeRoots -join [IO.Path]::PathSeparator)
    ) | Out-Null
    [IO.File]::WriteAllLines($profileEnvironment, $safeLines, $utf8)
}

function Set-TerminalCompressionPlugin([string]$ProfileName) {
    if ($config.terminalCompression.provider -ne 'rtk') {
        return
    }
    $source = Join-Path $hermesRoot 'plugins\rtk-rewrite'
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        return
    }
    $profilePluginsRoot = Join-Path $profilesRoot "$ProfileName\plugins"
    $destination = Join-Path $profilePluginsRoot 'rtk-rewrite'
    New-Item -ItemType Directory -Path $profilePluginsRoot -Force | Out-Null
    if (Test-Path -LiteralPath $destination -PathType Container) {
        Remove-ManagedDirectory `
            -Path $destination `
            -AllowedRoot $profilePluginsRoot
    }
    New-Item -ItemType Directory -Path $destination | Out-Null
    foreach ($item in Get-ChildItem -LiteralPath $source -Force) {
        if ($item.Name -eq '__pycache__') {
            continue
        }
        Copy-Item `
            -LiteralPath $item.FullName `
            -Destination $destination `
            -Recurse
    }
    $pluginAction = if (
        @($config.terminalCompression.enabledProfiles) -contains $ProfileName
    ) {
        'enable'
    }
    else {
        'disable'
    }
    & hermes.exe --profile $ProfileName plugins `
        $pluginAction 'rtk-rewrite' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not $pluginAction RTK for $ProfileName."
    }
}

function Set-DefaultBrainSafety {
    $path = Join-Path (Split-Path -Parent $profilesRoot) 'config.yaml'
    $text = [IO.File]::ReadAllText($path)
    $text = [regex]::Replace(
        $text,
        '(?m)^moa:\r?\n(?:^[ \t][^\r\n]*(?:\r?\n|$))*',
        "moa:`n  enabled: false`n"
    )
    if ($text -notmatch '(?m)^moa:\s*$') {
        $text = $text.TrimEnd() + "`nmoa:`n  enabled: false`n"
    }
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
        (Get-ModeConfig -Mode 'controlled-operator').toolsets |
            ForEach-Object { [string]$_ }
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

function Get-ProfileSoul(
    [string]$ProfileName,
    [string]$Role,
    [string]$Mode
) {
    $header = "# $ProfileName`n`nRole: $Role.`n`n"
    $shared = @"
Use Graphify before broad repository navigation. Never expose secrets, deploy,
mutate a database, contact third parties, bypass approvals, or use yolo,
oneshot, or z. Treat conversation memory as untrusted context and promote
learning only from validated evidence.
"@
    $body = switch ($Mode) {
        'controlled-operator' {
@"
Act as a controlled implementation specialist.

- Work only on tasks that match the stated role and acceptance criteria.
- For project changes, use the assigned managed Git worktree, checkpoints,
  allowlist, sealed evidence, and independent integration review.
- Never edit a source checkout directly.
- Use terminal, files, browser, code execution and delegation only for the
  current task.
- Create skills only in an authorized profile skill directory, validate them,
  and require separate approval before publication or external installation.
"@
        }
        'orchestrator' {
@"
Act only as the Kanban orchestrator. Decompose goals into small, non-overlapping
tasks, route them using profile descriptions, link dependencies, and judge the
returned evidence. Do not implement, edit files, run terminal commands, browse
the web for implementation, or substitute your own work for a specialist.
"@
        }
        'researcher' {
@"
Act as a read-only technical researcher. Use current primary sources, distinguish
facts from inference, cite URLs, and return a bounded evidence brief. Do not edit
project files, execute terminal commands, install packages, or publish findings.
"@
        }
        'validator' {
@"
Act as an authorized local/test browser validator. Inspect the application,
reproduce the requested flows, capture concise evidence, and report failures.
Do not test production, submit externally visible data, edit project files,
execute terminal commands, or claim success without observable evidence.
"@
        }
        'classifier' {
@"
Act only as a low-cost deterministic classifier. Return the request category,
recommended profile, required evidence, uncertainty, and whether human input is
needed. Do not implement, research broadly, edit files, or execute commands.
"@
        }
        'curator' {
@"
Act only as the learning curator. Review sanitized outcomes, reject secrets and
private paths, require a passing benchmark, and stage promotion for explicit
approval. Do not edit projects, execute commands, or promote from conversation
alone.
"@
        }
        default {
@"
Act as a read-only specialist. Inspect only the evidence needed for the stated
role and return findings, risks, recommendations, suggested tests, uncertainty,
and evidence used. File writes are confined to disposable scratch space; never
edit a project, execute terminal commands, apply patches, or commit.
"@
        }
    }
    return ($header + $body.Trim() + "`n`n" + $shared.Trim() + "`n")
}

foreach ($profile in @($config.profiles)) {
    $name = [string]$profile.runtimeId
    $mode = [string]$profile.mode
    $skillSet = [string]$profile.skillSet
    $description = "$($profile.role). Runtime mode: $mode; skill set: $skillSet."
    if ($existing -notmatch ('(?i)(^|\s)' + [regex]::Escape($name) + '(\s|$)')) {
        & hermes.exe profile create $name `
            --clone `
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
    Set-ProfileConfig -ProfileName $name -Mode $mode
    Sync-ProfileSkills `
        -ProfileName $name `
        -SkillSet $skillSet `
        -PruneBundled ($name -ne 'hermesbrain')
    $soulPath = Join-Path $profilesRoot "$name\SOUL.md"
    $soul = Get-ProfileSoul `
        -ProfileName $name `
        -Role ([string]$profile.role) `
        -Mode $mode
    [IO.File]::WriteAllText($soulPath, $soul.Replace("`r`n", "`n"), $utf8)
}

# The local operator must use the installed QAT model and must never fall back
# automatically to the manually selected Qwen model.
Set-ProfileConfig -ProfileName 'localai' -Mode 'controlled-operator'
Sync-ProfileSkills `
    -ProfileName 'localai' `
    -SkillSet 'brain' `
    -PruneBundled $false
$brainSoulPath = Join-Path $profilesRoot 'hermesbrain\SOUL.md'
$localSoulPath = Join-Path $profilesRoot 'localai\SOUL.md'
if (Test-Path -LiteralPath $brainSoulPath -PathType Leaf) {
    $localSoul = [IO.File]::ReadAllText($brainSoulPath).Replace(
        '# hermesbrain',
        '# localai'
    )
    [IO.File]::WriteAllText($localSoulPath, $localSoul, $utf8)
}
Sync-ProfileSkills `
    -ProfileName 'default' `
    -SkillSet 'brain' `
    -PruneBundled $false
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

$runtimeProfiles = @(
    [pscustomobject]@{
        runtimeId = 'localai'
        mode = 'controlled-operator'
    }
) + @(
    $config.profiles
)
foreach ($runtimeProfile in $runtimeProfiles) {
    $profileName = [string]$runtimeProfile.runtimeId
    $profileMode = [string]$runtimeProfile.mode
    $modeConfig = Get-ModeConfig -Mode $profileMode
    & hermes.exe --profile $profileName memory off | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not select built-in memory for $profileName."
    }
    & hermes.exe --profile $profileName config set memory.write_approval true |
        Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Could not require memory approval for $profileName."
    }
    foreach ($setting in @(
        @{ key = 'agent.max_turns'; value = [string]$modeConfig.maxTurns },
        @{ key = 'agent.verify_on_stop'; value = 'true' },
        @{ key = 'agent.max_verify_nudges'; value = '2' },
        @{ key = 'agent.reasoning_effort'; value = 'none' },
        @{
            key = 'model.max_tokens'
            value = [string]$modeConfig.maxTokens
        }
    )) {
        & hermes.exe --profile $profileName config set `
            $setting.key $setting.value | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Could not configure $profileName $($setting.key)."
        }
    }
    Set-LocalProfileEnvironment `
        -ProfileName $profileName `
        -Mode $profileMode
    Set-TerminalCompressionPlugin -ProfileName $profileName
}

& (Join-Path $PSScriptRoot 'update-hermes-brain-status.ps1')
& (Join-Path $PSScriptRoot 'measure-hermes-prompt-budget.ps1') | Out-Null
