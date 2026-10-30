#!/bin/zsh
set -eu
cd "$(dirname "$0")"
runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ ! -x "$runtime" ]]; then
  runtime="$(command -v node || true)"
fi
if [[ -z "$runtime" ]]; then
  print '未找到 Node.js，请安装 Node.js 22 或更新版本。'
  read -r '?按回车关闭。'
  exit 1
fi
"$runtime" tools/install.mjs
exec "$runtime" tools/local-service.mjs
