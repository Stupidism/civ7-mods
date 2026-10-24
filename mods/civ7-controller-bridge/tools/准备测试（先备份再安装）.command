#!/bin/zsh
set -eu
script_dir="${0:A:h}"
runtime_node="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
if [[ ! -x "$runtime_node" ]]; then
  runtime_node="$(command -v node)"
fi
print '请先完全退出《文明 VII》。本工具只备份、校验和安装，不启动游戏。'
if "$runtime_node" "$script_dir/backup-saves.mjs"; then
  if "$runtime_node" "$script_dir/install.mjs"; then
    print '\n准备完成。可以自行启动游戏，在附加内容启用「手柄地图兼容」。'
    print 'Steam 输入使用「启用」及官方 Xbox 布局。'
  else
    print '\n存档备份已保留，但安装未完成。请查看上方提示。'
  fi
else
  print '\n存档备份未完成，已停止安装，请勿开始测试。'
fi
read -r '?按回车关闭窗口。'
