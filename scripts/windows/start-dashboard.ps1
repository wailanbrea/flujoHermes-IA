[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dashboard = Join-Path $workspace 'dashboard'
$runtime = Join-Path $workspace 'telemetry\runtime'
New-Item -ItemType Directory -Path $runtime -Force | Out-Null

& (Join-Path $PSScriptRoot 'update-hermes-brain-status.ps1') | Out-Null

function Test-LocalPort([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return $task.Wait(600) -and $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

if (-not (Test-LocalPort 4311)) {
    $api = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'telemetry' `
        -WorkingDirectory $dashboard -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath (Join-Path $runtime 'telemetry-api.pid') -Value $api.Id
}

if (-not (Test-LocalPort 4310)) {
    $ui = Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'start' `
        -WorkingDirectory $dashboard -WindowStyle Hidden -PassThru
    Set-Content -LiteralPath (Join-Path $runtime 'dashboard-ui.pid') -Value $ui.Id
}

$deadline = [DateTime]::UtcNow.AddSeconds(20)
while ([DateTime]::UtcNow -lt $deadline) {
    if ((Test-LocalPort 4310) -and (Test-LocalPort 4311)) {
        Write-Output 'Dashboard disponible en http://127.0.0.1:4310'
        exit 0
    }
    Start-Sleep -Milliseconds 400
}

Write-Error 'El dashboard no inicio dentro del tiempo esperado.'
exit 1
