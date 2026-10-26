<#
  Adds (or with -Remove, removes) a shortcut in your Windows Startup folder
  that runs turntable.ps1 at sign-in. Per user; no admin rights needed.

  Usage: npm run app:startup   /   npm run app:startup -- -Remove
#>
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$link = Join-Path ([Environment]::GetFolderPath('Startup')) 'Turntable.lnk'

if ($Remove) {
  if (Test-Path $link) { Remove-Item $link; "Removed $link" } else { 'Not set to start at sign-in.' }
  return
}

$shell = New-Object -ComObject WScript.Shell
$s = $shell.CreateShortcut($link)
$s.TargetPath = (Get-Command powershell.exe).Source
$s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$(Join-Path $PSScriptRoot 'turntable.ps1')`""
$s.WorkingDirectory = Split-Path $PSScriptRoot
$s.WindowStyle = 7 # minimised, so no console flashes up
$s.Save()
"Turntable will start at sign-in ($link)"
