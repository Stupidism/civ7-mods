$ErrorActionPreference = 'Stop'
$running = Get-Process -Name 'Civ7_Win64_DX12_FinalRelease','Civ7_Win64_Vulkan_FinalRelease' -ErrorAction SilentlyContinue
if ($running) { throw 'Please save your progress and exit Civilization VII before installing.' }
$root = Join-Path $env:LOCALAPPDATA "Firaxis Games\Sid Meier's Civilization VII"
$target = Join-Path $root 'Mods\civ7-before-end-turn'
$backup = Join-Path $root ('ModUserData\SaveBeforeEndTurnBackups\' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
$files = @('before-end-turn.modinfo','ui\before-end-turn.js','ui\save-gate.js','ui\diplomacy-hook.js','ui\save-store.js','ui\save-options.js','ui\save-settings.js','text\settings.xml')
foreach ($name in $files) { if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot $name))) { throw ('Missing source: ' + $name) } }
if (Test-Path -LiteralPath $target) {
  New-Item -ItemType Directory -Path $backup -Force | Out-Null
  Copy-Item -LiteralPath $target -Destination (Join-Path $backup 'civ7-before-end-turn') -Recurse
  Write-Output ('Previous mod backed up: ' + $backup)
}
if (Get-Process -Name 'Civ7_Win64_DX12_FinalRelease','Civ7_Win64_Vulkan_FinalRelease' -ErrorAction SilentlyContinue) { throw 'Game started during installation preparation; no files replaced.' }
foreach ($name in $files) {
  $destination = Join-Path $target $name
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination $destination -Force
  if ((Get-FileHash -LiteralPath (Join-Path $PSScriptRoot $name)).Hash -ne (Get-FileHash -LiteralPath $destination).Hash) { throw ('Hash mismatch: ' + $name) }
}
Write-Output ('Installed and verified Save Before End Turn 1.1.0: ' + $target)
