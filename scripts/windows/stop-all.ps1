<#
.SYNOPSIS
Unified On-Demand Manager to stop TRAMA services while leaving LM Studio intact.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot

Write-Host "Deteniendo servicios de observabilidad TRAMA..." -ForegroundColor Cyan
& (Join-Path $scriptDir 'stop-dashboard.ps1')

Write-Host "TRAMA detenido cleanly. LM Studio permanece libre para inferencia directa." -ForegroundColor Green
