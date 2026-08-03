$ErrorActionPreference = 'Stop'
$destDir = "C:\bin\llama-b10048-bin-win-cuda-12.4-x64"
if (-not (Test-Path $destDir)) {
    New-Item -ItemType Directory -Path $destDir -Force | Out-Null
}

$release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
Write-Host "Latest release tag: $($release.tag_name)"

$mainAsset = $release.assets | Where-Object { $_.name -like "llama-b*-bin-win-cuda-*-x64.zip" -or $_.name -like "llama-*-bin-win-cuda-12.4-x64.zip" } | Select-Object -First 1
if (-not $mainAsset) {
    $mainAsset = $release.assets | Where-Object { $_.name -like "*bin-win-cuda-*-x64.zip" -and $_.name -notlike "cudart*" } | Select-Object -First 1
}

$cudartAsset = $release.assets | Where-Object { $_.name -like "cudart-llama-bin-win-cuda-12.4-x64.zip" -or $_.name -like "cudart*cuda*x64.zip" } | Select-Object -First 1

if ($mainAsset) {
    $zip1 = Join-Path $env:TEMP $mainAsset.name
    Write-Host "Downloading main binaries ($($mainAsset.name))..."
    Invoke-WebRequest -Uri $mainAsset.browser_download_url -OutFile $zip1
    Write-Host "Extracting $($mainAsset.name) to $destDir..."
    Expand-Archive -Path $zip1 -DestinationPath $destDir -Force
    Remove-Item -Path $zip1 -Force
}

if ($cudartAsset) {
    $zip2 = Join-Path $env:TEMP $cudartAsset.name
    Write-Host "Downloading cudart binaries ($($cudartAsset.name))..."
    Invoke-WebRequest -Uri $cudartAsset.browser_download_url -OutFile $zip2
    Write-Host "Extracting $($cudartAsset.name) to $destDir..."
    Expand-Archive -Path $zip2 -DestinationPath $destDir -Force
    Remove-Item -Path $zip2 -Force
}

Write-Host "Done extracting binaries to $destDir"
Get-ChildItem -Path $destDir | Select-Object Name | Out-String | Write-Host
