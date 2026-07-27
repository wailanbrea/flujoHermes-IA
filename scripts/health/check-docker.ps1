[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
try {
    $info = (& docker.exe info --format '{{.ServerVersion}}|{{.OSType}}|{{.NCPU}}').Trim()
    $parts = $info.Split('|')
    if ($parts.Count -lt 3 -or $parts[1] -ne 'linux') {
        Write-Output '[DEGRADED] Docker responde, pero no usa el motor Linux esperado.'
        exit 2
    }
    Write-Output "[HEALTHY] Docker $($parts[0]) · Linux · $($parts[2]) CPU."
    exit 0
}
catch {
    Write-Output '[OFFLINE] Docker Desktop no responde.'
    exit 1
}
