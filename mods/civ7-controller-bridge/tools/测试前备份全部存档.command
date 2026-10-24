#!/bin/zsh
set -eu
script_dir="${0:A:h}"
runtime_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ ! -x "$runtime_node" ]]; then
  runtime_node="$(command -v node)"
fi
if "$runtime_node" "$script_dir/backup-saves.mjs"; then
  print '\n备份完成。现在可以自行开始本次测试。'
else
  print '\n备份未完成，请勿开始测试。'
fi
read -r '?按回车关闭窗口。'
