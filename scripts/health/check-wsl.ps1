[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
try {
    $user = (& wsl.exe -d Ubuntu-24.04 -- id -un).Trim()
    if ($user -ne 'aiops') {
        Write-Output "[DEGRADED] Ubuntu responde con el usuario inesperado '$user'."
        exit 2
    }
    Write-Output '[HEALTHY] Ubuntu 24.04 LTS · WSL2 · usuario aiops sin privilegios.'
    exit 0
}
catch {
    Write-Output '[OFFLINE] Ubuntu-24.04 no está disponible en WSL.'
    exit 1
}
