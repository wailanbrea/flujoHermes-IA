<#
.SYNOPSIS
Discovers and structurally indexes projects under the managed local roots.

.DESCRIPTION
Detects project boundaries from repository and ecosystem markers, records Git
status, invokes Graphify's AST-only onboarding for each project, and writes an
atomic local catalog consumed by the observability dashboard. It never edits
project source files or sends source content to an external model.

.PARAMETER InventoryOnly
Discovers projects and Git state without invoking Graphify.

.PARAMETER Refresh
Refreshes graphs that are already registered.
#>
[CmdletBinding()]
param(
    [string[]]$Roots = @(
        'C:\xampp\php\www',
        'C:\Users\waila\StudioProjects',
        'C:\Users\waila\AndroidStudioProjects'
    ),

    [ValidateRange(1, 8)]
    [int]$MaximumDepth = 5,

    [switch]$InventoryOnly,

    [switch]$Refresh
)

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$catalogDirectory = Join-Path $workspace 'telemetry\runtime'
$catalogPath = Join-Path $catalogDirectory 'project-catalog.json'
$onboardingScript = Join-Path $PSScriptRoot 'ensure-project-graph.ps1'
$markers = @(
    '.git',
    'settings.gradle',
    'settings.gradle.kts',
    'composer.json',
    'package.json',
    'pyproject.toml',
    'pom.xml',
    'Cargo.toml',
    'pubspec.yaml',
    'firebase.json'
)
$excludedDirectories = @(
    '.git',
    '.gradle',
    '.idea',
    '.next',
    '.vinext',
    '.wrangler',
    'node_modules',
    'vendor',
    'build',
    'dist',
    'out',
    'target',
    'graphify-out',
    'backups'
)

function Get-RootAlias([string]$Root) {
    if ($Root -ieq 'C:\xampp\php\www') { return 'xampp-www' }
    if ($Root -ieq 'C:\Users\waila\StudioProjects') { return 'studio-projects' }
    if ($Root -ieq 'C:\Users\waila\AndroidStudioProjects') {
        return 'android-studio-projects'
    }
    return (Split-Path -Leaf $Root).ToLowerInvariant() -replace '[^a-z0-9]+', '-'
}

function Get-ProjectMarker([string]$Directory) {
    foreach ($marker in $markers) {
        if (Test-Path -LiteralPath (Join-Path $Directory $marker)) {
            return $marker
        }
    }
    if (
        Get-ChildItem -LiteralPath $Directory -File -Filter '*.sln' `
            -ErrorAction SilentlyContinue |
            Select-Object -First 1
    ) {
        return '*.sln'
    }
    return $null
}

function Get-ProjectDirectories([string]$ManagedRoot) {
    $resolvedRoot = (Resolve-Path -LiteralPath $ManagedRoot).Path.TrimEnd('\')
    $queue = [Collections.Generic.Queue[object]]::new()
    $queue.Enqueue([pscustomobject]@{ Path = $resolvedRoot; Depth = 0 })
    $projects = [Collections.Generic.List[object]]::new()

    while ($queue.Count -gt 0) {
        $entry = $queue.Dequeue()
        $marker = Get-ProjectMarker -Directory $entry.Path
        $isManagedRoot = $entry.Path -ieq $resolvedRoot
        $isContainerGitOnly = $isManagedRoot -and $marker -eq '.git'

        if ($marker -and -not $isContainerGitOnly) {
            $projects.Add([pscustomobject]@{
                Path = $entry.Path
                Marker = $marker
            })
            continue
        }

        if ($entry.Depth -ge $MaximumDepth) {
            continue
        }
        Get-ChildItem -LiteralPath $entry.Path -Directory -Force `
            -ErrorAction SilentlyContinue |
            Where-Object {
                $excludedDirectories -notcontains $_.Name -and
                -not $_.Name.StartsWith('.')
            } |
            ForEach-Object {
                $queue.Enqueue([pscustomobject]@{
                    Path = $_.FullName
                    Depth = $entry.Depth + 1
                })
            }
    }
    return @($projects)
}

function Get-GitState([string]$ProjectPath) {
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        $inside = & git.exe -C $ProjectPath rev-parse --is-inside-work-tree 2>$null
        if ($LASTEXITCODE -ne 0 -or $inside -ne 'true') {
            return [pscustomobject]@{
                HasGit = $false
                Scope = 'none'
                Branch = $null
                Dirty = $false
            }
        }
        $gitRoot = (& git.exe -C $ProjectPath rev-parse --show-toplevel 2>$null |
            Select-Object -First 1)
        $resolvedProject = [IO.Path]::GetFullPath($ProjectPath).TrimEnd('\')
        $resolvedGitRoot = [IO.Path]::GetFullPath([string]$gitRoot).TrimEnd('\')
        $scope = if (
            $resolvedProject.Equals(
                $resolvedGitRoot,
                [StringComparison]::OrdinalIgnoreCase
            )
        ) { 'own' } else { 'inherited' }
        $branch = (& git.exe -C $ProjectPath branch --show-current 2>$null |
            Select-Object -First 1)
        $dirty = [bool](& git.exe -C $ProjectPath status --porcelain 2>$null |
            Select-Object -First 1)
        return [pscustomobject]@{
            HasGit = $scope -eq 'own'
            Scope = $scope
            Branch = if ($branch) { [string]$branch } else { 'detached' }
            Dirty = $dirty
        }
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
}

function Get-RelativeProjectPath(
    [string]$ManagedRoot,
    [string]$ProjectPath
) {
    $prefix = $ManagedRoot.TrimEnd('\') + '\'
    if ($ProjectPath.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        return $ProjectPath.Substring($prefix.Length)
    }
    return Split-Path -Leaf $ProjectPath
}

$discovered = [Collections.Generic.List[object]]::new()
foreach ($root in $Roots) {
    if (-not (Test-Path -LiteralPath $root -PathType Container)) {
        $discovered.Add([pscustomobject]@{
            ManagedRoot = $root
            RootAlias = Get-RootAlias -Root $root
            Path = $null
            Marker = $null
            DiscoveryError = 'managed-root-unavailable'
        })
        continue
    }
    $resolvedRoot = (Resolve-Path -LiteralPath $root).Path.TrimEnd('\')
    foreach ($project in Get-ProjectDirectories -ManagedRoot $resolvedRoot) {
        $discovered.Add([pscustomobject]@{
            ManagedRoot = $resolvedRoot
            RootAlias = Get-RootAlias -Root $resolvedRoot
            Path = $project.Path
            Marker = $project.Marker
            DiscoveryError = $null
        })
    }
}

$entries = [Collections.Generic.List[object]]::new()
foreach ($project in $discovered) {
    if ($project.DiscoveryError) {
        $entries.Add([pscustomobject]@{
            id = "unavailable-$($project.RootAlias)"
            name = $project.RootAlias
            rootAlias = $project.RootAlias
            relativePath = $null
            marker = $null
            hasGit = $null
            gitScope = 'unknown'
            gitBranch = $null
            gitDirty = $null
            graphStatus = 'failed'
            graphAction = $null
            nodeCount = 0
            edgeCount = 0
            largeCorpus = $null
            sensitiveFilesSkipped = $null
            error = $project.DiscoveryError
        })
        continue
    }

    $git = Get-GitState -ProjectPath $project.Path
    $relativePath = Get-RelativeProjectPath `
        -ManagedRoot $project.ManagedRoot `
        -ProjectPath $project.Path
    $name = Split-Path -Leaf $project.Path
    $graph = $null
    $graphError = $null

    if (-not $InventoryOnly) {
        try {
            $arguments = @{
                ProjectPath = $project.Path
                AllowLargeCorpus = $true
                ExactRoot = $true
                AllowMetadataOnly = $true
            }
            if ($Refresh) { $arguments.Refresh = $true }
            $raw = & $onboardingScript @arguments
            if ($LASTEXITCODE -ne 0) {
                throw 'Graphify onboarding returned a non-zero exit code.'
            }
            $graph = ($raw | Select-Object -First 1) | ConvertFrom-Json
        }
        catch {
            $graphError = $_.Exception.Message -replace
                [regex]::Escape($project.Path), '[project]'
        }
    }

    $entries.Add([pscustomobject]@{
        id = if ($graph) { $graph.project } else {
            ($name.ToLowerInvariant() -replace '[^a-z0-9._-]+', '-').Trim('-')
        }
        name = $name
        rootAlias = $project.RootAlias
        relativePath = $relativePath
        marker = $project.Marker
        hasGit = $git.HasGit
        gitScope = $git.Scope
        gitBranch = $git.Branch
        gitDirty = $git.Dirty
        graphStatus = if ($InventoryOnly) { 'inventory-only' } elseif ($graph) {
            if ($graph.metadataOnly) { 'metadata-only' } else { 'ready' }
        } else { 'failed' }
        graphAction = if ($graph) { $graph.action } else { $null }
        nodeCount = if ($graph) { $graph.nodes } else { 0 }
        edgeCount = if ($graph) { $graph.edges } else { 0 }
        largeCorpus = if ($graph) { $graph.largeCorpus } else { $null }
        sensitiveFilesSkipped = if ($graph) {
            $graph.sensitiveFilesSkipped
        } else { $null }
        error = $graphError
    })
}

$orderedEntries = @($entries | Sort-Object rootAlias, relativePath)
$catalog = [ordered]@{
    schemaVersion = 1
    generatedAt = [DateTime]::UtcNow.ToString('o')
    mode = if ($InventoryOnly) { 'inventory-only' } else { 'indexed' }
    roots = @($Roots | ForEach-Object {
        [ordered]@{
            alias = Get-RootAlias -Root $_
            available = Test-Path -LiteralPath $_ -PathType Container
        }
    })
    projects = $orderedEntries
    summary = [ordered]@{
        total = $orderedEntries.Count
        withGit = @($orderedEntries | Where-Object { $_.hasGit -eq $true }).Count
        inheritedGit = @($orderedEntries | Where-Object {
            $_.gitScope -eq 'inherited'
        }).Count
        withoutGit = @($orderedEntries | Where-Object {
            $_.gitScope -eq 'none'
        }).Count
        graphReady = @($orderedEntries | Where-Object {
            $_.graphStatus -in @('ready', 'metadata-only')
        }).Count
        failed = @($orderedEntries | Where-Object {
            $_.graphStatus -eq 'failed'
        }).Count
    }
}

New-Item -ItemType Directory -Path $catalogDirectory -Force | Out-Null
$temporaryCatalog = "$catalogPath.$([Guid]::NewGuid().ToString('N')).tmp"
try {
    $catalog | ConvertTo-Json -Depth 6 |
        Set-Content -LiteralPath $temporaryCatalog -Encoding UTF8
    Move-Item -LiteralPath $temporaryCatalog -Destination $catalogPath -Force
}
finally {
    if (Test-Path -LiteralPath $temporaryCatalog) {
        Remove-Item -LiteralPath $temporaryCatalog -Force
    }
}

$catalog.summary | ConvertTo-Json -Compress
