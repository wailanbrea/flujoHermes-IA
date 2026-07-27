[CmdletBinding()]
param()

$checks = @(
    'check-lm-studio.ps1',
    'check-hermes.ps1',
    'check-wsl.ps1',
    'check-docker.ps1'
)
$worstExitCode = 0
foreach ($check in $checks) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot $check)
    if ($LASTEXITCODE -eq 1) {
        $worstExitCode = 1
    }
    elseif ($LASTEXITCODE -eq 2 -and $worstExitCode -eq 0) {
        $worstExitCode = 2
    }
}
exit $worstExitCode
