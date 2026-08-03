$ErrorActionPreference = 'Stop'
$destDir = "C:\bin\llama-b10048-bin-win-cuda-12.4-x64"
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

Write-Host "Fetching latest llama.cpp release info..."
$release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
$asset = $release.assets | Where-Object { $_.name -like "*bin-win-cuda-*-x64.zip" -or $_.name -like "*win-cuda-cu12.4-x64.zip" -or $_.name -like "*bin-win-cuda-12.4-x64.zip" } | Select-Object -First 1

if (-not $asset) {
    # Fallback to any win-cuda-x64 zip
    $asset = $release.assets | Where-Object { $_.name -like "*cuda*x64.zip" } | Select-Object -First 1
}

if (-not $asset) {
    throw "Could not find CUDA win-x64 release asset in llama.cpp latest release."
}

$zipPath = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name) from $($asset.browser_download_url)..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zipPath

Write-Host "Extracting archive to $destDir..."
Expand-Archive -Path $zipPath -DestinationPath $destDir -Force
Remove-Item -Path $zipPath -Force

Write-Host "llama.cpp installed successfully at $destDir"
