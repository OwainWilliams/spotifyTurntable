<#
  Starts Turntable as a desktop app: serves the built site on 127.0.0.1:4545
  (Spotify's login has to come back to that address, so something must be
  listening there) and opens it in a Chrome app window. Chrome rather than a
  native web view because Spotify's player needs Widevine, which Chrome has.

  Safe to run twice: it reuses a server that's already up, and the app's
  manifest focuses an existing window rather than opening a second player.

  Usage: npm run app        rebuilds first, so it serves your latest code
         npm run app:startup  runs this at sign-in, serving the last build
#>
param([switch]$Build)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot
$url = 'http://127.0.0.1:4545'

function Test-Server {
  try { Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 2 | Out-Null; return $true } catch { return $false }
}

# The preview server reads dist/ from disk per request, so a rebuild is
# picked up even if the server is already running.
if ($Build -or -not (Test-Path (Join-Path $root 'dist\index.html'))) {
  & npm.cmd --prefix $root run build
  if ($LASTEXITCODE) { throw 'Build failed' }
}

if (-not (Test-Server)) {
  # Detached and hidden: the server outlives this script.
  Start-Process npm.cmd -ArgumentList 'run', 'preview' -WorkingDirectory $root -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(30)
  while (-not (Test-Server)) {
    if ((Get-Date) -gt $deadline) { throw "Server didn't start on $url" }
    Start-Sleep -Milliseconds 500
  }
}

$chrome = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe' -ErrorAction SilentlyContinue).'(default)'
if (-not $chrome) { $chrome = 'chrome.exe' }
Start-Process $chrome -ArgumentList "--app=$url", '--start-fullscreen'
