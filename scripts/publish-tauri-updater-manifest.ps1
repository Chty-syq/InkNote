param(
  [string]$Repository = $env:GITHUB_REPOSITORY,
  [string]$Token = $env:GITHUB_TOKEN,
  [string]$ConfigPath = "apps/desktop/src-tauri/tauri.conf.json",
  [string]$ReleaseNotes = "Download the Windows installer below."
)

$ErrorActionPreference = "Stop"

if (-not $Repository) {
  throw "Missing GitHub repository. Set GITHUB_REPOSITORY or pass -Repository."
}

if (-not $Token) {
  throw "Missing GitHub token. Set GITHUB_TOKEN or pass -Token."
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "Tauri config not found: $ConfigPath"
}

$config = Get-Content -Raw -LiteralPath $ConfigPath | ConvertFrom-Json
$version = [string]$config.version
if (-not $version) {
  throw "Tauri version is missing in $ConfigPath"
}

$tagName = "v$version"
$headers = @{
  Authorization          = "Bearer $Token"
  Accept                 = "application/vnd.github+json"
  "X-GitHub-Api-Version" = "2022-11-28"
  "User-Agent"           = "InkNote release workflow"
}

Write-Host "Preparing updater manifest for $Repository@$tagName"

$release = Invoke-RestMethod `
  -Method Get `
  -Uri "https://api.github.com/repos/$Repository/releases/tags/$tagName" `
  -Headers $headers

$assets = @($release.assets)
if ($assets.Count -eq 0) {
  throw "Release $tagName has no assets."
}

$installer = $assets |
  Where-Object { $_.name -match '\.exe$' -and $_.name -match '(setup|installer|x64|x86_64)' } |
  Sort-Object name |
  Select-Object -First 1

if (-not $installer) {
  $installer = $assets |
    Where-Object { $_.name -match '\.exe$' } |
    Sort-Object name |
    Select-Object -First 1
}

if (-not $installer) {
  $assetNames = ($assets | ForEach-Object { $_.name }) -join ", "
  throw "No Windows installer asset was found in $tagName. Assets: $assetNames"
}

$signatureAsset = $assets |
  Where-Object { $_.name -eq "$($installer.name).sig" } |
  Select-Object -First 1

if (-not $signatureAsset) {
  $signatureAsset = $assets |
    Where-Object { $_.name -match '\.sig$' -and $_.name -match '\.exe\.sig$' } |
    Sort-Object name |
    Select-Object -First 1
}

if (-not $signatureAsset) {
  $assetNames = ($assets | ForEach-Object { $_.name }) -join ", "
  throw "No signature asset matching $($installer.name) was found. Assets: $assetNames"
}

$signatureResponse = Invoke-WebRequest `
  -UseBasicParsing `
  -Uri $signatureAsset.browser_download_url `
  -Headers @{ "User-Agent" = "InkNote release workflow" } `
  -TimeoutSec 60

$signatureContent = $signatureResponse.Content
if ($signatureContent -is [byte[]]) {
  $signature = [System.Text.Encoding]::UTF8.GetString($signatureContent).Trim()
} else {
  $signature = ([string]$signatureContent).Trim()
}

if (-not $signature) {
  throw "Signature asset is empty: $($signatureAsset.name)"
}

$manifest = [ordered]@{
  version   = $version
  notes     = $ReleaseNotes
  pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
  platforms = [ordered]@{
    "windows-x86_64" = [ordered]@{
      signature = $signature
      url       = $installer.browser_download_url
    }
  }
}

$tempRoot = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [System.IO.Path]::GetTempPath() }
$manifestPath = Join-Path $tempRoot "latest.json"
$manifestJson = $manifest | ConvertTo-Json -Depth 10
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($manifestPath, $manifestJson, $utf8NoBom)

$existingManifest = $assets | Where-Object { $_.name -eq "latest.json" }
foreach ($asset in $existingManifest) {
  Write-Host "Replacing existing latest.json asset: $($asset.id)"
  Invoke-RestMethod `
    -Method Delete `
    -Uri "https://api.github.com/repos/$Repository/releases/assets/$($asset.id)" `
    -Headers $headers | Out-Null
}

$uploadUrl = $release.upload_url -replace '\{\?name,label\}$', '?name=latest.json'
$bytes = [System.IO.File]::ReadAllBytes($manifestPath)

Invoke-RestMethod `
  -Method Post `
  -Uri $uploadUrl `
  -Headers $headers `
  -ContentType "application/json" `
  -Body $bytes | Out-Null

Write-Host "Published latest.json for $tagName"
Write-Host "Installer: $($installer.name)"
Write-Host "Signature: $($signatureAsset.name)"
