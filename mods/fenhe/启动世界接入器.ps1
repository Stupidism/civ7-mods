$ErrorActionPreference='Stop'
$node = Get-Command node -ErrorAction SilentlyContinue
$python = Get-Command python -ErrorAction SilentlyContinue
if (-not $node -or -not $python) { throw '需要 Node.js 22+ 与 Python 3（只使用标准库）。' }
Write-Host '请保持此窗口运行，然后在游戏分合面板中选择介入国家。'
& $node.Source (Join-Path $PSScriptRoot 'tools\bridge.mjs')
