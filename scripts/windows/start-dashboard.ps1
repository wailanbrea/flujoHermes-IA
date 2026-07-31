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

# `npm.cmd` sólo lanza al proceso node que acaba escuchando: su PID muere en
# cuanto npm entrega el control, así que guardarlo dejaba un pid file apuntando
# a un proceso inexistente y cualquier parada posterior fallaba en silencio
# mientras el servidor real seguía vivo. Se registra el dueño real del puerto.
function Save-ListenerPid([int]$Port, [string]$PidPath) {
    $deadline = [DateTime]::UtcNow.AddSeconds(25)
    while ([DateTime]::UtcNow -lt $deadline) {
        $owner = Get-NetTCPConnection -LocalPort $Port -State Listen `
            -ErrorAction SilentlyContinue |
            Select-Object -First 1 -ExpandProperty OwningProcess
        if ($owner) {
            Set-Content -LiteralPath $PidPath -Value $owner
            return $true
        }
        Start-Sleep -Milliseconds 400
    }
    # Sin dueño identificable, es preferible no dejar un pid file mentiroso.
    if (Test-Path -LiteralPath $PidPath) { Remove-Item -LiteralPath $PidPath -Force }
    return $false
}

if (-not (Test-LocalPort 4311)) {
    Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'telemetry' `
        -WorkingDirectory $dashboard -WindowStyle Hidden | Out-Null
    Save-ListenerPid -Port 4311 -PidPath (Join-Path $runtime 'telemetry-api.pid') | Out-Null
}

if (-not (Test-LocalPort 4310)) {
    Start-Process -FilePath 'npm.cmd' -ArgumentList 'run', 'start' `
        -WorkingDirectory $dashboard -WindowStyle Hidden | Out-Null
    Save-ListenerPid -Port 4310 -PidPath (Join-Path $runtime 'dashboard-ui.pid') | Out-Null
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
