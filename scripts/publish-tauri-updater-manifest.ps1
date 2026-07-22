param(
  [string]$Repository = $env:GITHUB_REPOSITORY,
  [string]$Token = $env:GITHUB_TOKEN,
  [string]$ConfigPath = "apps/desktop/src-tauri/tauri.conf.json",
  [string]$ReleaseNotes = "Download the Windows NSIS installer or Linux AppImage/deb package below."
)

$ErrorActionPreference = "Stop"
$env:GITHUB_REPOSITORY = $Repository
$env:GITHUB_TOKEN = $Token
$scriptPath = Join-Path $PSScriptRoot "publish-tauri-updater-manifest.mjs"

& node $scriptPath `
  --repository $Repository `
  --config $ConfigPath `
  --release-notes $ReleaseNotes

if ($LASTEXITCODE -ne 0) {
  throw "Updater manifest publisher failed with exit code $LASTEXITCODE."
}
