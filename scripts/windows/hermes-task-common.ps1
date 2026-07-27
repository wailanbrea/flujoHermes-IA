Set-StrictMode -Version 2.0

function Get-OrchestratorRoot {
    return Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
}

function Get-HermesRuntimeRoot {
    return Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\hermes-jobs'
}

function Assert-TaskId([string]$TaskId) {
    if ($TaskId -notmatch '^hermes-[0-9]{8}-[0-9]{6}-[a-f0-9]{8}$') {
        throw 'Invalid Hermes task identifier.'
    }
}

function Get-TaskDirectory([string]$TaskId) {
    Assert-TaskId -TaskId $TaskId
    $runtimeRoot = [IO.Path]::GetFullPath((Get-HermesRuntimeRoot)).TrimEnd('\')
    $taskDirectory = [IO.Path]::GetFullPath(
        (Join-Path $runtimeRoot $TaskId)
    ).TrimEnd('\')
    if (-not $taskDirectory.StartsWith(
        $runtimeRoot + '\',
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw 'Resolved task directory escaped the Hermes runtime root.'
    }
    return $taskDirectory
}

function Read-JsonFile([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required runtime file is missing: $(Split-Path -Leaf $Path)"
    }
    return Get-Content -LiteralPath $Path -Raw -Encoding UTF8 |
        ConvertFrom-Json
}

function Write-JsonAtomic(
    [string]$Path,
    [object]$Value
) {
    $directory = Split-Path -Parent $Path
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
    $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
    $utf8 = [Text.UTF8Encoding]::new($false)
    try {
        [IO.File]::WriteAllText(
            $temporary,
            ($Value | ConvertTo-Json -Depth 10),
            $utf8
        )
        Move-Item -LiteralPath $temporary -Destination $Path -Force
    }
    finally {
        if (Test-Path -LiteralPath $temporary) {
            Remove-Item -LiteralPath $temporary -Force
        }
    }
}

function Get-ManagedRootPath([string]$Alias) {
    switch ($Alias) {
        'xampp-www' { return 'C:\xampp\php\www' }
        'studio-projects' { return 'C:\Users\waila\StudioProjects' }
        'android-studio-projects' {
            return 'C:\Users\waila\AndroidStudioProjects'
        }
        default { return $null }
    }
}

function Get-AuthorizedProject([string]$ProjectPath) {
    $resolved = (Resolve-Path -LiteralPath $ProjectPath -ErrorAction Stop).Path
    if (-not (Test-Path -LiteralPath $resolved -PathType Container)) {
        throw 'Hermes tasks require an existing project directory.'
    }
    $resolved = [IO.Path]::GetFullPath($resolved).TrimEnd('\')
    $orchestrator = [IO.Path]::GetFullPath(
        (Get-OrchestratorRoot)
    ).TrimEnd('\')
    if ($resolved.Equals(
        $orchestrator,
        [StringComparison]::OrdinalIgnoreCase
    )) {
        return [pscustomobject]@{
            Id = 'local-ai-orchestrator'
            Name = 'local-ai-orchestrator'
            Path = $resolved
            GitScope = 'own'
        }
    }

    $catalogPath = Join-Path $orchestrator (
        'telemetry\runtime\project-catalog.json'
    )
    $catalog = Read-JsonFile -Path $catalogPath
    foreach ($project in $catalog.projects) {
        $managedRoot = Get-ManagedRootPath -Alias $project.rootAlias
        if (-not $managedRoot -or -not $project.relativePath) {
            continue
        }
        $candidate = [IO.Path]::GetFullPath(
            (Join-Path $managedRoot $project.relativePath)
        ).TrimEnd('\')
        if ($resolved.Equals(
            $candidate,
            [StringComparison]::OrdinalIgnoreCase
        )) {
            return [pscustomobject]@{
                Id = [string]$project.id
                Name = [string]$project.name
                Path = $resolved
                GitScope = [string]$project.gitScope
            }
        }
    }
    throw 'Project is not present in the authorized local catalog.'
}

function Get-TaskStatus([string]$TaskDirectory) {
    return Read-JsonFile -Path (Join-Path $TaskDirectory 'status.json')
}

function Set-TaskStatus(
    [string]$TaskDirectory,
    [string]$State,
    [string]$Message,
    [hashtable]$Fields = @{}
) {
    $path = Join-Path $TaskDirectory 'status.json'
    $current = if (Test-Path -LiteralPath $path) {
        Read-JsonFile -Path $path
    }
    else {
        [pscustomobject]@{}
    }
    $values = [ordered]@{}
    foreach ($property in $current.PSObject.Properties) {
        $values[$property.Name] = $property.Value
    }
    $values.state = $State
    $values.message = $Message
    $values.updatedAt = [DateTime]::UtcNow.ToString('o')
    foreach ($key in $Fields.Keys) {
        $values[$key] = $Fields[$key]
    }
    Write-JsonAtomic -Path $path -Value $values
}

function Remove-TaskWorktree(
    [string]$ProjectRoot,
    [string]$WorktreePath
) {
    if (-not $WorktreePath) { return }
    $runtimeRoot = [IO.Path]::GetFullPath(
        (Join-Path (Get-OrchestratorRoot) 'telemetry\runtime\hermes-worktrees')
    ).TrimEnd('\')
    $resolved = [IO.Path]::GetFullPath($WorktreePath).TrimEnd('\')
    if (-not $resolved.StartsWith(
        $runtimeRoot + '\',
        [StringComparison]::OrdinalIgnoreCase
    )) {
        throw 'Refusing to remove a worktree outside the Hermes runtime root.'
    }
    if (Test-Path -LiteralPath $resolved) {
        & git.exe -C $ProjectRoot worktree remove --force $resolved 2>$null
        if ($LASTEXITCODE -ne 0) {
            throw 'Git could not remove the isolated Hermes worktree.'
        }
    }
    & git.exe -C $ProjectRoot worktree prune 2>$null
}
