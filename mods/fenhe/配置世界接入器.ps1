param([switch]$Restore)
$ErrorActionPreference='Stop'
if(Get-Process -Name 'Civ7_Win64_DX12_FinalRelease','Civ7_Win64_Vulkan_FinalRelease' -ErrorAction SilentlyContinue){throw '请先退出文明7。'}
$optionsFile=Join-Path $env:LOCALAPPDATA "Firaxis Games\Sid Meier's Civilization VII\AppOptions.txt"
$backupFile=Join-Path $PSScriptRoot 'backups\bridge-options.json'
$content=[IO.File]::ReadAllText($optionsFile)
$keys=@('EnableDebugPanels','EnableTuner','UIDebugger')
if($Restore){
 if(-not(Test-Path -LiteralPath $backupFile)){throw '没有接入器配置备份。'}
 $original=Get-Content -LiteralPath $backupFile -Raw | ConvertFrom-Json
 foreach($key in $keys){$pattern='(?m)^;?'+[regex]::Escape($key)+'\s+[^\r\n]*';$line=[string]$original.$key;$content=[regex]::Replace($content,$pattern,[System.Text.RegularExpressions.MatchEvaluator]{param($m) $line})}
}else{
 if(-not(Test-Path -LiteralPath $backupFile)){
  New-Item -ItemType Directory -Path (Split-Path $backupFile) -Force | Out-Null
  $original=@{}
  foreach($key in $keys){$m=[regex]::Match($content,'(?m)^;?'+[regex]::Escape($key)+'\s+[^\r\n]*');if(-not$m.Success){throw "缺少官方配置项：$key"};$original[$key]=$m.Value}
  $original | ConvertTo-Json | Set-Content -LiteralPath $backupFile -Encoding utf8
 }
 foreach($key in $keys){$content=[regex]::Replace($content,'(?m)^;?'+[regex]::Escape($key)+'\s+[^\r\n]*',($key+' 1'))}
}
[IO.File]::WriteAllText($optionsFile,$content,[Text.UTF8Encoding]::new($false))
Write-Host $(if($Restore){'已恢复接入器修改的调试设置。'}else{'已配置官方本地调试接口。现在启动文明7，再运行“启动世界接入器.ps1”。'})
