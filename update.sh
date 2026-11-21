#!/usr/bin/env bash
# Browser Ad Killer 自动更新（Linux / macOS / WSL / Git Bash，幂等可重复执行）
# 用法:
#   ./update.sh            # 镜像链检查，有新版才下载刷新；已是最新则 no-op
#   ./update.sh --force    # 强制重装
#   ./update.sh --dir=/opt/adk
set -euo pipefail

INSTALL_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/browser-ad-killer/extension"
FORCE=0; QUIET=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1 ;;
    --quiet) QUIET=1 ;;
    --dir=*) INSTALL_DIR="${1#*=}" ;;
    -h|--help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "未知参数: $1" >&2; exit 1 ;;
  esac
  shift
done

remote_manifest_urls=(
  'https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json'
  'https://cdn.jsdelivr.net/gh/neko233-com/browser-ad-killer@main/manifest.json'
  'https://ghproxy.net/https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json'
  'https://ghfast.top/https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json'
)
codeload_mirrors=(
  'https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main'
  'https://ghproxy.net/https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main'
  'https://ghfast.top/https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main'
)

ver_of() { # $1 manifest path -> version
  [[ -f "$1" ]] || { echo '0.0.0'; return; }
  grep -o '"version"[^,}]*' "$1" | head -1 | sed 's/[^0-9.]//g' | sed 's/^\.//'
}

# 比较: a>b → 1, a<b → -1, 相等 0
cmp_ver() {
  local IFS=. pa pb i x y
  read -r -a pa <<< "${1:-0.0.0}"; read -r -a pb <<< "${2:-0.0.0}"
  local n=${#pa[@]}; [[ ${#pb[@]} -gt $n ]] && n=${#pb[@]}
  for ((i=0;i<n;i++)); do
    x=${pa[i]:-0}; y=${pb[i]:-0}
    ((10#$x > 10#$y)) && { echo 1; return; }
    ((10#$x < 10#$y)) && { echo -1; return; }
  done
  echo 0
}

local_ver="$(ver_of "$INSTALL_DIR/manifest.json")"

# 远程版本（镜像链）
remote_ver=''
for u in "${remote_manifest_urls[@]}"; do
  v="$(curl -fsSL --max-time 8 "$u" 2>/dev/null | grep -o '"version"[^,}]*' | head -1 | sed 's/[^0-9.]//g' | sed 's/^\.//' || true)"
  [[ -n "$v" ]] && { remote_ver="$v"; break; }
done

if [[ $FORCE -eq 0 && -n "$remote_ver" && "$(cmp_ver "$remote_ver" "$local_ver")" -le 0 ]]; then
  [[ $QUIET -eq 0 ]] && echo "[BAK] 已是最新 v$local_ver，无需更新"
  exit 0
fi

# 下载整仓 zip（镜像链）
tmp="$(mktemp -d)"
zip="$tmp/repo.zip"
downloaded=0
for m in "${codeload_mirrors[@]}"; do
  if curl -fsSL --max-time 30 -o "$zip" "$m" 2>/dev/null && [[ -s "$zip" ]]; then
    downloaded=1; break
  fi
done

if [[ $downloaded -eq 0 ]]; then
  [[ $QUIET -eq 0 ]] && echo '[BAK] 所有镜像均不可达，跳过更新（可 git pull 或稍后重试）'
  rm -rf "$tmp"; exit 0
fi

# 解压定位源码根
mkdir -p "$tmp/x"
unzip -q "$zip" -d "$tmp/x"
src_root="$(find "$tmp/x" -maxdepth 2 -name manifest.json | head -1 | xargs dirname)"
[[ -z "$src_root" ]] && { [[ $QUIET -eq 0 ]] && echo '[BAK] 压缩包结构异常，跳过更新'; rm -rf "$tmp"; exit 0; }

# 刷新安装目录
copy_items=(manifest.json rulesets/builtin.json icons src/background src/content src/popup src/options src/lib/defaults.js src/lib/filter-parser.js src/lib/mirrors.js)
rm -rf "$INSTALL_DIR"; mkdir -p "$INSTALL_DIR"
for rel in "${copy_items[@]}"; do
  [[ -e "$src_root/$rel" ]] || continue
  mkdir -p "$(dirname "$INSTALL_DIR/$rel")"
  cp -r "$src_root/$rel" "$INSTALL_DIR/$rel"
done
rm -rf "$tmp"

[[ $QUIET -eq 0 ]] && echo "[BAK] 更新完成（刷新扩展页即可生效）"
