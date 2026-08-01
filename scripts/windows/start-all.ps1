<#
.SYNOPSIS
Unified On-Demand Manager to start LM Studio verification and TRAMA services.
#>
[CmdletBinding()]
param(
    [switch]$Dashboard = $true,
    [string]$Model = 'agents-a1'
)

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot

Write-Host "[1/3] Verificando servidor de inferencia LM Studio (127.0.0.1:1234)..." -ForegroundColor Cyan
try {
    $models = Invoke-RestMethod -Uri "http://127.0.0.1:1234/v1/models" -TimeoutSec 3
    Write-Host " -> LM Studio activo. $(($models.data).Count) modelo(s) disponible(s)." -ForegroundColor Green
} catch {
    Write-Host " -> LM Studio no responde en 127.0.0.1:1234. Por favor inicia LM Studio." -ForegroundColor Yellow
}

Write-Host "[2/3] Cargando perfil de modelo optimizado ($Model)..." -ForegroundColor Cyan
try {
    & (Join-Path $scriptDir 'prepare-hermes-model.ps1') -Model $Model
    Write-Host " -> Modelo $Model preparado correctamente." -ForegroundColor Green
} catch {
    Write-Host " -> Advertencia al preparar modelo: $_" -ForegroundColor Yellow
}

if ($Dashboard) {
    Write-Host "[3/3] Iniciando servicios de observabilidad TRAMA (puertos 4310 y 4311)..." -ForegroundColor Cyan
    & (Join-Path $scriptDir 'start-dashboard.ps1')
    Write-Host " -> TRAMA Dashboard disponible en http://127.0.0.1:4310" -ForegroundColor Green
}

Write-Host "=== Sistema de IA Local Listo para Operar ===" -ForegroundColor Green
