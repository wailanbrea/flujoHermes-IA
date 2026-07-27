[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
try {
    $response = Invoke-RestMethod -Uri 'http://127.0.0.1:1234/api/v1/models' -TimeoutSec 4
    $loaded = @($response.models | ForEach-Object { $_.loaded_instances } | Where-Object { $_ })
    if ($loaded.Count -eq 0) {
        Write-Output '[DEGRADED] LM Studio responde, pero no tiene un modelo cargado.'
        exit 2
    }

    $active = $loaded[0]
    if ([int64]$active.config.context_length -lt 65536) {
        Write-Output "[DEGRADED] Modelo $($active.id) cargado con menos de 64K de contexto."
        exit 2
    }
    if ([int]$active.config.parallel -ne 1) {
        Write-Output "[DEGRADED] Modelo $($active.id) usa $($active.config.parallel) ranuras paralelas; se requiere 1 para proteger la RAM."
        exit 2
    }

    Write-Output "[HEALTHY] LM Studio · $($active.id) · $($active.config.context_length) tokens · paralelo 1."
    exit 0
}
catch {
    Write-Output "[OFFLINE] LM Studio no responde en 127.0.0.1:1234."
    exit 1
}
