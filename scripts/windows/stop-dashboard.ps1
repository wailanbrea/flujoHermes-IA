[CmdletBinding()]
param()

$workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runtime = Join-Path $workspace 'telemetry\runtime'
$pidFiles = @('dashboard-ui.pid', 'telemetry-api.pid')

function Get-DescendantProcessIds([int]$ParentId) {
    $children = @(
        Get-CimInstance Win32_Process |
            Where-Object { $_.ParentProcessId -eq $ParentId }
    )
    foreach ($child in $children) {
        Get-DescendantProcessIds -ParentId $child.ProcessId
        $child.ProcessId
    }
}

foreach ($file in $pidFiles) {
    $path = Join-Path $runtime $file
    if (-not (Test-Path -LiteralPath $path)) {
        continue
    }
    $processId = [int](Get-Content -LiteralPath $path -Raw)
    if ($processId -gt 0) {
        $descendantIds = @(Get-DescendantProcessIds -ParentId $processId)
        foreach ($descendantId in $descendantIds) {
            Stop-Process -Id $descendantId -Force -ErrorAction SilentlyContinue
        }
        Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
    Remove-Item -LiteralPath $path -Force
}

$ports = @(4310, 4311)
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($c in $conns) {
        Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue
    }
}

Write-Output 'Procesos del dashboard detenidos.'
