$release = Invoke-RestMethod -Uri "https://api.github.com/repos/ggml-org/llama.cpp/releases/latest"
$release.assets | Select-Object name, browser_download_url | Out-String | Write-Host
