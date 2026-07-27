[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
try {
    $provider = (& hermes.exe --profile localai config get model.provider).Trim()
    $model = (& hermes.exe --profile localai config get model.default).Trim()
    $approvals = (& hermes.exe --profile localai config get approvals.mode).Trim()
    if ($provider -ne 'lmstudio' -or $model -ne 'qwen3.6-35b-a3b-uncensored-hauhaucs-aggressive') {
        Write-Output '[DEGRADED] El perfil localai no apunta al modelo LM Studio validado.'
        exit 2
    }
    if ($approvals -ne 'manual') {
        Write-Output '[DEGRADED] El perfil localai no exige aprobaciones manuales.'
        exit 2
    }
    Write-Output '[HEALTHY] Hermes · perfil localai aislado · aprobaciones manuales.'
    exit 0
}
catch {
    Write-Output '[OFFLINE] Hermes o el perfil localai no están disponibles.'
    exit 1
}
