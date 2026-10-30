#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"
if pgrep -x CivilizationVII >/dev/null || pgrep -x Civ7ModLauncher >/dev/null; then
  echo 'Quit Civilization VII and its launcher first. 请先退出游戏及启动器。'; read -r; exit 1
fi
payload="$PWD"
base="$HOME/Library/Application Support/BetterModSupport"
mods="$HOME/Library/Application Support/Civilization VII/Mods"
tag="$(date +%Y%m%d-%H%M%S)-$$"
release="$base/Versions/$tag"
backup="$base/Backups/$tag"
mkdir -p "$release" "$backup" "$mods"
# Preserve existing installed folders before replacing them. The rollback list
# is recorded as shell array entries, never interpreted as shell source.
changed=()
rollback() {
  for name in "${changed[@]}"; do
    if [ -e "$mods/$name" ]; then mv "$mods/$name" "$backup/failed-$name"; fi
    if [ -e "$backup/$name" ]; then mv "$backup/$name" "$mods/$name"; fi
  done
  echo 'Installation stopped; prior mods restored. 安装已停止，原 Mod 已恢复。'
}
trap rollback ERR
for folder in "$payload"/civ7-*; do
  [ -d "$folder" ] || continue
  name="$(basename "$folder")"
  case "$name" in *[!a-z0-9-]*) exit 1;; esac
  ditto "$folder" "$release/$name"
  if [ -e "$mods/$name" ]; then mv "$mods/$name" "$backup/$name"; fi
  changed+=("$name")
  ditto "$release/$name" "$mods/$name"
done
[ -x "$release/civ7-mac-launcher/Civ7 Mod Launcher.app/Contents/MacOS/Civ7ModLauncher" ]
# A fixed entry resolves the current version at every launch. Updating the
# installed release never requires editing Steam's launch option again.
ln -s "$release" "$base/Current.new-$tag"
# macOS mv -h replaces the symlink itself, not the directory it points to.
mv -fh "$base/Current.new-$tag" "$base/Current"
trap - ERR
printf '\nSteam Launch Options (set once):\n"%s/Current/civ7-mac-launcher/Civ7 Mod Launcher.app/Contents/MacOS/Civ7ModLauncher" %%command%%\n\nManage components in Options → Enhanced Mods.\n在游戏选项 → 增强 Mod 中启用组件。\n' "$base"
read -r -p 'Press Return to close / 按回车关闭'
