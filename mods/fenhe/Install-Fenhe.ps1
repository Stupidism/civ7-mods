$ErrorActionPreference='Stop'
$game = Get-Process -Name 'Civ7_Win64_DX12_FinalRelease','Civ7_Win64_Vulkan_FinalRelease' -ErrorAction SilentlyContinue
if ($game) { throw '请先退出文明7，再安装分合。' }
$modRoot = Join-Path $env:LOCALAPPDATA "Firaxis Games\Sid Meier's Civilization VII\Mods"
if (-not (Test-Path -LiteralPath $modRoot)) { throw '找不到文明7 Mods 目录。' }
foreach($id in @('civ7-fenhe','civ7-fenhe-ui')) {
$source = Join-Path $PSScriptRoot ('mod\'+$id)
$target = Join-Path $modRoot $id
if (Test-Path -LiteralPath $target) {
 $backupRoot=Join-Path $PSScriptRoot 'backups'
 New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
 Copy-Item -LiteralPath $target -Destination (Join-Path $backupRoot ($id+'-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))) -Recurse
}
New-Item -ItemType Directory -Path $target -Force | Out-Null
Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $target -Recurse -Force
$sourceFiles=Get-ChildItem -LiteralPath $source -Recurse -File
$sourceFull=(Resolve-Path -LiteralPath $source).Path.TrimEnd('\')
foreach($file in $sourceFiles){
 $relative=$file.FullName.Substring($sourceFull.Length+1)
 if((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $target $relative)).Hash){throw "校验失败：$relative"}
}
}
Write-Output '分合 0.2.0 世界接入实验版及旧存档兼容界面安装完成。'
