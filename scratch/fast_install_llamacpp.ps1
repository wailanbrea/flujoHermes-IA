$ErrorActionPreference = 'Stop'
$destDir = "C:\bin\llama-b10048-bin-win-cuda-12.4-x64"
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
$tag = $release.tag_name
Write-Host "Latest release tag: $tag"

$mainAsset = $release.assets | Where-Object { $_.name -like "*bin-win-cuda-12.4-x64.zip" -and $_.name -notlike "cudart*" } | Select-Object -First 1
if (-not $mainAsset) {
    $mainAsset = $release.assets | Where-Object { $_.name -like "*bin-win-cuda-*-x64.zip" -and $_.name -notlike "cudart*" } | Select-Object -First 1
}

$cudartAsset = $release.assets | Where-Object { $_.name -like "cudart-llama-bin-win-cuda-12.4-x64.zip" -or $_.name -like "cudart*cuda*x64.zip" } | Select-Object -First 1

$zipMain = Join-Path $env:TEMP $mainAsset.name
$zipCudart = Join-Path $env:TEMP $cudartAsset.name

Write-Host "Downloading $($mainAsset.name) with curl..."
curl.exe -L -s -o $zipMain $mainAsset.browser_download_url

Write-Host "Downloading $($cudartAsset.name) with curl..."
curl.exe -L -s -o $zipCudart $cudartAsset.browser_download_url

Write-Host "Extracting main binaries..."
Expand-Archive -Path $zipMain -DestinationPath $destDir -Force

Write-Host "Extracting cudart binaries..."
Expand-Archive -Path $zipCudart -DestinationPath $destDir -Force

Remove-Item -Path $zipMain -Force -ErrorAction SilentlyContinue
Remove-Item -Path $zipCudart -Force -ErrorAction SilentlyContinue

Write-Host "Checking installed binaries:"
Get-ChildItem -Path $destDir -Filter "llama-server.exe" | Select-Object FullName, Length | Out-String | Write-Host
