<#
.SYNOPSIS
Ensures that one exact project is available in Graphify before code exploration.

.DESCRIPTION
Uses the existing local or global graph when possible. If the project is missing,
builds an AST-only graph in the user's local Graphify cache, adds it to the global
graph, and optionally runs one bounded query. No semantic LLM extraction is used.

.PARAMETER ProjectPath
Exact project directory or a path inside a Git repository.

.PARAMETER Question
Optional codebase question to run after ensuring graph availability.

.PARAMETER Budget
Maximum Graphify query output budget. Defaults to 1200 tokens.

.PARAMETER Refresh
Incrementally refresh an existing local/cache graph before querying it.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$ProjectPath,

    [string]$Question,

    [ValidateRange(200, 4000)]
    [int]$Budget = 1200,

    [switch]$Refresh
)

$ErrorActionPreference = 'Stop'

function Get-ProjectRoot([string]$Path) {
    $resolved = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
        throw 'The project target must be an existing directory.'
    }

    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    try {
        $gitRoot = & git.exe -C $resolved rev-parse --show-toplevel 2>$null
        $gitExitCode = $LASTEXITCODE
    }
    finally {
        $ErrorActionPreference = $previousPreference
    }
    if ($gitExitCode -eq 0 -and $gitRoot) {
        return (Resolve-Path -LiteralPath $gitRoot.Trim()).Path
    }
    return $resolved
}

function Get-ProjectId([string]$Root) {
    $leaf = Split-Path -Leaf $Root
    $slug = $leaf.ToLowerInvariant() -replace '[^a-z0-9._-]+', '-'
    $slug = $slug.Trim('-', '.', '_')
    if (-not $slug) {
        $bytes = [Text.Encoding]::UTF8.GetBytes($Root.ToLowerInvariant())
        $sha = [Security.Cryptography.SHA256]::Create()
        try {
            $hash = $sha.ComputeHash($bytes)
        }
        finally {
            $sha.Dispose()
        }
        $hex = [BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant()
        return 'project-' + $hex.Substring(0, 10)
    }
    return $slug.Substring(0, [Math]::Min(64, $slug.Length))
}

function Get-PathFingerprint([string]$Root) {
    $normalized = $Root.TrimEnd('\').ToLowerInvariant()
    $bytes = [Text.Encoding]::UTF8.GetBytes($normalized)
    $sha = [Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash($bytes)
    }
    finally {
        $sha.Dispose()
    }
    $hex = [BitConverter]::ToString($hash).Replace('-', '').ToLowerInvariant()
    return $hex.Substring(0, 10)
}

function Test-GraphRoot(
    [string]$OutputDirectory,
    [string]$ExpectedRoot
) {
    $marker = Join-Path $OutputDirectory '.graphify_root'
    $graph = Join-Path $OutputDirectory 'graph.json'
    if (
        -not (Test-Path -LiteralPath $marker -PathType Leaf) -or
        -not (Test-Path -LiteralPath $graph -PathType Leaf)
    ) {
        return $false
    }
    try {
        $recorded = [IO.Path]::GetFullPath(
            (Get-Content -LiteralPath $marker -Raw -Encoding UTF8).Trim()
        ).TrimEnd('\')
        $expected = [IO.Path]::GetFullPath($ExpectedRoot).TrimEnd('\')
        return $recorded.Equals($expected, [StringComparison]::OrdinalIgnoreCase)
    }
    catch {
        return $false
    }
}

function Get-GraphStats(
    [string]$GraphPath,
    [string]$RepositoryId
) {
    $graph = Get-Content -LiteralPath $GraphPath -Raw -Encoding UTF8 |
        ConvertFrom-Json
    $nodes = if ($RepositoryId) {
        @($graph.nodes | Where-Object { $_.repo -eq $RepositoryId })
    }
    else {
        @($graph.nodes)
    }
    $edges = if ($RepositoryId) {
        @($graph.links | Where-Object {
            $_.source -like "${RepositoryId}::*" -and
            $_.target -like "${RepositoryId}::*"
        })
    }
    else {
        @($graph.links)
    }
    if ($nodes.Count -eq 0) {
        throw 'Graphify produced an empty graph; raw file exploration remains blocked.'
    }
    [pscustomobject]@{
        Nodes = $nodes.Count
        Edges = $edges.Count
    }
}

function Invoke-StructuralBuild(
    [string]$Root,
    [string]$OutputDirectory
) {
    $graphify = Get-Command graphify.exe -ErrorAction Stop
    $pythonRoot = Split-Path (Split-Path $graphify.Source -Parent) -Parent
    $python = Join-Path $pythonRoot 'python.exe'
    if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
        throw 'Graphify Python runtime is unavailable.'
    }

    $detectCode = @'
from graphify.detect import detect
from pathlib import Path
import json, sys
r = detect(Path(sys.argv[1]))
print(json.dumps({
    'total_files': r.get('total_files', 0),
    'total_words': r.get('total_words', 0),
    'skipped_sensitive': len(r.get('skipped_sensitive') or []),
}))
'@
    $detectRaw = & $python '-c' $detectCode $Root
    if ($LASTEXITCODE -ne 0 -or -not $detectRaw) {
        throw 'Graphify corpus detection failed; raw file exploration remains blocked.'
    }
    $detected = $detectRaw | ConvertFrom-Json
    if ($detected.total_files -eq 0) {
        throw 'No supported project files were found; raw exploration remains blocked.'
    }
    if ($detected.total_files -gt 500 -or $detected.total_words -gt 2000000) {
        throw "Project corpus is too large for automatic onboarding ($($detected.total_files) files). Narrow the authorized project root first."
    }

    New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
    $previousOutput = $env:GRAPHIFY_OUT
    $env:GRAPHIFY_OUT = $OutputDirectory
    $previousPreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $buildOutput = & $graphify.Source update $Root --no-cluster 2>&1
        $buildExitCode = $LASTEXITCODE
        if ($buildExitCode -ne 0) {
            $safe = (($buildOutput | Select-Object -Last 1) -join ' ') -replace
                [regex]::Escape($Root), '[project]'
            throw "Graphify structural extraction failed: $safe"
        }
    }
    finally {
        $ErrorActionPreference = $previousPreference
        if ($null -eq $previousOutput) {
            Remove-Item Env:GRAPHIFY_OUT -ErrorAction SilentlyContinue
        }
        else {
            $env:GRAPHIFY_OUT = $previousOutput
        }
    }

    [pscustomobject]@{
        SensitiveSkipped = [int]$detected.skipped_sensitive
        TotalFiles = [int]$detected.total_files
    }
}

$root = Get-ProjectRoot -Path $ProjectPath
$projectId = Get-ProjectId -Root $root
$graphifyCommand = Get-Command graphify.exe -ErrorAction Stop
$userProfile = [Environment]::GetFolderPath('UserProfile')
$globalGraph = Join-Path $userProfile '.graphify\global-graph.json'
$workspaceGraph = Join-Path $root 'graphify-out\graph.json'
$cacheDirectory = Join-Path $userProfile ".graphify\projects\$projectId"
$cacheGraph = Join-Path $cacheDirectory 'graph.json'
$cacheMatchesRoot = Test-GraphRoot `
    -OutputDirectory $cacheDirectory `
    -ExpectedRoot $root
$globalList = & $graphifyCommand.Source global list
$isGlobal = [bool]($globalList -match "^\s{2}$([regex]::Escape($projectId)):")

# A global tag alone cannot prove that two same-named folders are the same project.
# When no project-local/cache graph can establish identity, preserve the existing tag
# and use a stable path fingerprint for this root instead of overwriting it.
if (
    $isGlobal -and
    -not (Test-Path -LiteralPath $workspaceGraph -PathType Leaf) -and
    -not $cacheMatchesRoot
) {
    $projectId = "$projectId-$(Get-PathFingerprint -Root $root)"
    $cacheDirectory = Join-Path $userProfile ".graphify\projects\$projectId"
    $cacheGraph = Join-Path $cacheDirectory 'graph.json'
    $cacheMatchesRoot = Test-GraphRoot `
        -OutputDirectory $cacheDirectory `
        -ExpectedRoot $root
    $isGlobal = [bool](
        $globalList -match "^\s{2}$([regex]::Escape($projectId)):"
    )
}

$graphPath = $null
$source = $null
$action = 'already-indexed'
$skippedSensitive = $null

if (Test-Path -LiteralPath $workspaceGraph -PathType Leaf) {
    $graphPath = $workspaceGraph
    $source = 'workspace'
}
elseif ($cacheMatchesRoot) {
    $graphPath = $cacheGraph
    $source = 'local-cache'
}
elseif ($isGlobal -and (Test-Path -LiteralPath $globalGraph -PathType Leaf)) {
    $graphPath = $globalGraph
    $source = 'global'
}

if (-not $graphPath) {
    $build = Invoke-StructuralBuild -Root $root -OutputDirectory $cacheDirectory
    $skippedSensitive = $build.SensitiveSkipped
    $graphPath = $cacheGraph
    $source = 'local-cache'
    $action = 'indexed'
}
elseif ($Refresh) {
    $outputDirectory = if ($source -eq 'workspace') {
        Split-Path -Parent $graphPath
    }
    else {
        $cacheDirectory
    }
    $build = Invoke-StructuralBuild -Root $root -OutputDirectory $outputDirectory
    $skippedSensitive = $build.SensitiveSkipped
    $graphPath = Join-Path $outputDirectory 'graph.json'
    $source = if ($source -eq 'workspace') { 'workspace' } else { 'local-cache' }
    $action = 'refreshed'
}

$statsRepository = if ($source -eq 'global') { $projectId } else { $null }
$stats = Get-GraphStats -GraphPath $graphPath -RepositoryId $statsRepository
if (-not $isGlobal -or $action -in @('indexed', 'refreshed')) {
    $globalAdd = & $graphifyCommand.Source global add $graphPath --as $projectId 2>&1
    if ($LASTEXITCODE -ne 0) {
        throw 'The local graph was built, but registration in the global graph failed.'
    }
}

[pscustomobject]@{
    status = 'ready'
    action = $action
    project = $projectId
    source = $source
    nodes = $stats.Nodes
    edges = $stats.Edges
    sensitiveFilesSkipped = $skippedSensitive
    semanticModelUsed = $false
} | ConvertTo-Json -Compress

if ($Question) {
    Write-Output '--- GRAPH QUERY ---'
    & $graphifyCommand.Source query "[$projectId] $Question" `
        --budget $Budget `
        --graph $graphPath
    if ($LASTEXITCODE -ne 0) {
        throw 'The project is indexed, but the bounded graph query failed.'
    }
}
