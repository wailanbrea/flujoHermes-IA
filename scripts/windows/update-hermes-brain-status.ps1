<#
.SYNOPSIS
Refreshes the sanitized Hermes inventory and cached TRAMA Brain snapshot.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$root = Get-OrchestratorRoot
$runtime = Join-Path $root 'telemetry\runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null
$brainConfig = Read-JsonFile -Path (Join-Path $root 'config\hermes-brain.json')

function Invoke-HermesSafe([string[]]$Arguments) {
    $result = Invoke-NativeCommand -Executable 'hermes.exe' -Arguments $Arguments
    return [pscustomobject]@{
        ok = $result.ExitCode -eq 0
        text = ([string]$result.Output -replace '[\r\n\t]+', ' ').Trim()
    }
}

function Get-InstalledProfileSkillNames([string]$ProfileRoot) {
    $skillsRoot = Join-Path $ProfileRoot 'skills'
    if (-not (Test-Path -LiteralPath $skillsRoot -PathType Container)) {
        return @()
    }
    return @(
        Get-ChildItem `
            -LiteralPath $skillsRoot `
            -Filter 'SKILL.md' `
            -File `
            -Recurse |
            ForEach-Object { $_.Directory.Name } |
            Sort-Object -Unique
    )
}

$profileList = Invoke-HermesSafe -Arguments @('profile', 'list')
$curator = Invoke-HermesSafe -Arguments @('curator', 'status')
$kanban = Invoke-HermesSafe -Arguments @('kanban', 'stats')
$moa = Invoke-HermesSafe -Arguments @('moa', 'list')

$configuredProfiles = @($brainConfig.profiles)
$presentProfiles = @($configuredProfiles | Where-Object {
    $profileList.ok -and
    $profileList.text -match (
        '(?i)(^|\s)' + [regex]::Escape([string]$_.runtimeId) + '(\s|$)'
    )
} | ForEach-Object { [string]$_.id })
$presentOperatorCount = @($configuredProfiles | Where-Object {
    $mode = $brainConfig.profileModes.PSObject.Properties[[string]$_.mode].Value
    $presentProfiles -contains [string]$_.id -and
    [string]$mode.writeScope -eq 'managed-worktrees'
}).Count
$presentAdvisoryCount = @($presentProfiles).Count - $presentOperatorCount
$configuredSkills = @($brainConfig.skills.core + $brainConfig.skills.project)
$hermesRoot = Join-Path (
    [Environment]::GetFolderPath('LocalApplicationData')
) 'hermes'
$profileSkillInventory = @($configuredProfiles | ForEach-Object {
    $profile = $_
    $profileRoot = Join-Path (Join-Path $hermesRoot 'profiles') ([string]$profile.runtimeId)
    $required = @($brainConfig.skills.roleSets.PSObject.Properties[
        [string]$profile.skillSet
    ].Value)
    $installed = @(Get-InstalledProfileSkillNames -ProfileRoot $profileRoot)
    $present = @($required | Where-Object {
        $installed -contains [string]$_
    })
    $approval = Invoke-HermesSafe -Arguments @(
        '--profile',
        [string]$profile.runtimeId,
        'config',
        'get',
        'skills.write_approval'
    )
    [ordered]@{
        profileId = [string]$profile.id
        runtimeId = [string]$profile.runtimeId
        configured = $required.Count
        present = $present.Count
        presentSkills = @($present)
        missing = @($required | Where-Object { $_ -notin $present })
        writeApproval = $approval.ok -and $approval.text -eq 'true'
        state = if (
            $present.Count -eq $required.Count -and
            $approval.ok -and
            $approval.text -eq 'true'
        ) { 'healthy' } else { 'degraded' }
    }
})
$presentSkills = @(
    $profileSkillInventory |
        ForEach-Object { @($_.presentSkills) } |
        Sort-Object -Unique
)
$skillsHealthy = @($profileSkillInventory | Where-Object {
    $_.state -ne 'healthy'
}).Count -eq 0

$inventory = [ordered]@{
    schemaVersion = 1
    generatedAt = [DateTime]::UtcNow.ToString('o')
    profilesState = if ($presentProfiles.Count -eq $configuredProfiles.Count) { 'healthy' } else { 'degraded' }
    profiles = @($presentProfiles)
    operatorCount = $presentOperatorCount
    advisoryCount = $presentAdvisoryCount
    skillsState = if ($skillsHealthy) { 'healthy' } else { 'degraded' }
    skills = @($presentSkills)
    configuredSkillCount = $configuredSkills.Count
    profileSkills = $profileSkillInventory
    curator = [ordered]@{
        state = if ($curator.ok) { 'healthy' } else { 'offline' }
        consolidation = if ($curator.text -match '(?i)consolidation off|consolidate:\s+off') { 'off' } else { 'unknown' }
    }
    kanban = [ordered]@{
        state = if ($kanban.ok) { 'healthy' } else { 'offline' }
        manualDecomposition = $true
    }
    moa = [ordered]@{
        state = if ($moa.ok) { 'healthy' } else { 'offline' }
        active = $moa.text -notmatch '(?i)active in config:\s*\(off\)'
        optional = $true
    }
}
Write-JsonAtomic `
    -Path (Join-Path $runtime 'hermes-brain-inventory.json') `
    -Value $inventory

$previousPythonPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = Join-Path $root 'src'
    & py.exe -3 -m hermes_brain.cli build-status `
        --repo $root `
        --output (Join-Path $runtime 'hermes-brain-status.json') | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw 'Hermes Brain status generation failed.'
    }
}
finally {
    $env:PYTHONPATH = $previousPythonPath
}

Get-Content -LiteralPath (Join-Path $runtime 'hermes-brain-status.json') -Raw
