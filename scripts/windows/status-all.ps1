<#
.SYNOPSIS
Unified Status Monitor for LM Studio, TRAMA ports 4310/4311, and active sandboxes.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

function Test-Port([int]$Port) {
    $client = [Net.Sockets.TcpClient]::new()
    try {
        $task = $client.ConnectAsync('127.0.0.1', $Port)
        return $task.Wait(500) -and $client.Connected
    } catch { return $false }
    finally { $client.Dispose() }
}

Write-Host "=== ESTADO GENERAL DEL SISTEMA DE IA LOCAL ===" -ForegroundColor Cyan

$lms = Test-Port 1234
Write-Host "LM Studio Inferencia (127.0.0.1:1234) : " -NoNewline
if ($lms) { Write-Host "ONLINE" -ForegroundColor Green } else { Write-Host "OFFLINE" -ForegroundColor Red }

$tramaUi = Test-Port 4310
Write-Host "TRAMA Dashboard UI  (127.0.0.1:4310) : " -NoNewline
if ($tramaUi) { Write-Host "ONLINE (http://127.0.0.1:4310)" -ForegroundColor Green } else { Write-Host "OFFLINE" -ForegroundColor Yellow }

$tramaApi = Test-Port 4311
Write-Host "TRAMA Telemetry API (127.0.0.1:4311) : " -NoNewline
if ($tramaApi) { Write-Host "ONLINE" -ForegroundColor Green } else { Write-Host "OFFLINE" -ForegroundColor Yellow }

if ($tramaApi) {
    try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:4311/api/status" -TimeoutSec 2
        Write-Host "Sandboxes Activos                       : $($status.brain.sandbox.active.Count)" -ForegroundColor Cyan
        Write-Host "Model Cargado en LM Studio              : $($status.services | Where-Object {$_.id -eq 'lm-studio'} | Select-Object -ExpandProperty detail)" -ForegroundColor Cyan
    } catch {}
}
