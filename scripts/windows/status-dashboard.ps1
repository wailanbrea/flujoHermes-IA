[CmdletBinding()]
param()

try {
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:4311/health' -TimeoutSec 3
    $status = Invoke-RestMethod -Uri 'http://127.0.0.1:4311/api/status' -TimeoutSec 6
    Write-Output "[HEALTHY] API $($health.binding) · secuencia $($status.sequence) · estado $($status.overallState)."
    exit 0
}
catch {
    Write-Output '[OFFLINE] El dashboard local no responde.'
    exit 1
}
