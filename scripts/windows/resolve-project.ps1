<#
.SYNOPSIS
Resolves an authorized project by name fragment without reading the whole catalog.

.DESCRIPTION
telemetry\runtime\project-catalog.json is ~34 KB across 39 projects. A director
that reads it whole to find one path spends roughly nine thousand tokens on a
lookup. This returns only the matching rows, already resolved to absolute paths
and annotated with the Git scope that decides whether delegation is even legal.

.PARAMETER Name
Fragment matched case-insensitively against the project id, display name and
relative path. An exact id match always wins on its own.

.PARAMETER MaxResults
Upper bound on returned rows. Ambiguous fragments report the total count so the
caller can narrow the search instead of widening the read.

.PARAMETER OwnGitOnly
Returns only projects with their own Git repository, the sole scope Hermes
delegation accepts.

.PARAMETER AsJson
Emits one compact JSON object instead of the terser text rows.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateNotNullOrEmpty()]
    [string]$Name,

    [ValidateRange(1, 20)]
    [int]$MaxResults = 5,

    [switch]$OwnGitOnly,

    [switch]$AsJson
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'hermes-task-common.ps1')

$catalogPath = Join-Path (Get-OrchestratorRoot) (
    'telemetry\runtime\project-catalog.json'
)
$catalog = Read-JsonFile -Path $catalogPath
$needle = $Name.Trim().ToLowerInvariant()
if (-not $needle) {
    throw 'A project name fragment is required.'
}

$candidates = [Collections.Generic.List[object]]::new()

# Get-AuthorizedProject accepts the orchestrator itself, but it is not a catalog
# row, so it has to be offered here too or the lookup silently omits a valid
# delegation target.
$orchestratorRoot = Get-OrchestratorRoot
$orchestratorId = 'local-ai-orchestrator'
if ($orchestratorId.Contains($needle)) {
    $candidates.Add([pscustomobject]@{
        Exact = ($orchestratorId -eq $needle)
        Id = $orchestratorId
        Name = $orchestratorId
        Path = [IO.Path]::GetFullPath($orchestratorRoot).TrimEnd('\')
        GitScope = 'own'
        GraphStatus = 'ready'
        Nodes = 0
        Exists = (Test-Path -LiteralPath $orchestratorRoot -PathType Container)
    })
}

foreach ($project in $catalog.projects) {
    $id = [string](Get-JsonProperty -Object $project -Name 'id' -Default '')
    $displayName = [string](Get-JsonProperty -Object $project -Name 'name' -Default '')
    $relativePath = [string](Get-JsonProperty -Object $project -Name 'relativePath' -Default '')
    $gitScope = [string](Get-JsonProperty -Object $project -Name 'gitScope' -Default 'none')
    if ($OwnGitOnly -and $gitScope -ne 'own') { continue }

    $haystack = @($id, $displayName, $relativePath) |
        ForEach-Object { ([string]$_).ToLowerInvariant() }
    $exact = ($id.ToLowerInvariant() -eq $needle)
    $matched = $exact -or @($haystack | Where-Object {
        $_ -and $_.Contains($needle)
    }).Count -gt 0
    if (-not $matched) { continue }

    $managedRoot = Get-ManagedRootPath -Alias (
        [string](Get-JsonProperty -Object $project -Name 'rootAlias' -Default '')
    )
    $absolutePath = if ($managedRoot -and $relativePath) {
        [IO.Path]::GetFullPath((Join-Path $managedRoot $relativePath)).TrimEnd('\')
    }
    else { '' }

    $candidates.Add([pscustomobject]@{
        Exact = $exact
        Id = $id
        Name = $displayName
        Path = $absolutePath
        GitScope = $gitScope
        GraphStatus = [string](Get-JsonProperty -Object $project -Name 'graphStatus' -Default 'unknown')
        Nodes = [int](Get-JsonProperty -Object $project -Name 'nodeCount' -Default 0)
        Exists = [bool]($absolutePath -and (Test-Path -LiteralPath $absolutePath -PathType Container))
    })
}

$exactMatches = @($candidates | Where-Object { $_.Exact })
if ($exactMatches.Count -eq 1) {
    $candidates = [Collections.Generic.List[object]]::new()
    $candidates.Add($exactMatches[0])
}

if ($candidates.Count -eq 0) {
    throw (
        "No authorized project matches '$Name'. Refresh the catalog with " +
        'index-project-roots.ps1, or try a shorter fragment. Do not fall back ' +
        'to a broad disk search.'
    )
}

$total = $candidates.Count
$rows = @($candidates | Sort-Object -Property @{
    Expression = { -not $_.Exact }
}, 'Id' | Select-Object -First $MaxResults)

if ($AsJson) {
    [pscustomobject]@{
        query = $Name
        totalMatches = $total
        returned = $rows.Count
        truncated = ($total -gt $rows.Count)
        projects = @($rows | ForEach-Object {
            [ordered]@{
                id = $_.Id
                name = $_.Name
                path = $_.Path
                gitScope = $_.GitScope
                graphStatus = $_.GraphStatus
                nodes = $_.Nodes
                exists = $_.Exists
                delegable = ($_.GitScope -eq 'own' -and $_.Exists)
            }
        })
    } | ConvertTo-Json -Depth 5 -Compress
    return
}

foreach ($row in $rows) {
    $flags = @()
    if (-not $row.Exists) { $flags += 'missing-path' }
    if ($row.GitScope -ne 'own') { $flags += 'no-delegation' }
    $suffix = if ($flags.Count -gt 0) { ' [' + ($flags -join ',') + ']' } else { '' }
    Write-Output (
        '{0}  git={1}  graph={2}({3} nodes)  {4}{5}' -f
            $row.Id, $row.GitScope, $row.GraphStatus, $row.Nodes, $row.Path, $suffix
    )
}
if ($total -gt $rows.Count) {
    Write-Output (
        "... {0} more matches; narrow the fragment instead of listing them." -f
            ($total - $rows.Count)
    )
}
