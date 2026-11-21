#!/usr/bin/env bash
# Browser Ad Killer 一键安装（Linux / macOS / WSL / Git Bash）
# 用法:
#   ./install.sh                     # 复制文件并打开检测到的浏览器扩展页
#   ./install.sh --launch            # --load-extension 直接拉起（仅本次会话）
#   ./install.sh --browser=chrome    # 只处理指定浏览器: edge|chrome|chromium|all
#   ./install.sh --dir=/opt/adk      # 自定义安装目录
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/browser-ad-killer/extension"
BROWSER="all"
LAUNCH=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --browser=*) BROWSER="${1#*=}" ;;
    --launch) LAUNCH=1 ;;
    --dir=*) INSTALL_DIR="${1#*=}" ;;
    -h|--help)
      sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "未知参数: $1"; exit 1 ;;
  esac
  shift
done

# ---------- 前置检查 ----------
if [[ ! -f "$ROOT/manifest.json" ]]; then
  echo "[BAK] 未在脚本目录找到 manifest.json，请在项目根目录运行 install.sh" >&2
  exit 1
fi

# ---------- 复制运行时文件 ----------
copy_items=(
  manifest.json
  rulesets/builtin.json
  icons
  src/background
  src/content
  src/popup
  src/options
  src/lib/defaults.js
  src/lib/filter-parser.js
)

rm -rf "$INSTALL_DIR"
mkdir -p "$INSTALL_DIR"
for rel in "${copy_items[@]}"; do
  if [[ ! -e "$ROOT/$rel" ]]; then
    echo "[BAK] 跳过缺失文件: $rel" >&2
    continue
  fi
  mkdir -p "$(dirname "$INSTALL_DIR/$rel")"
  cp -r "$ROOT/$rel" "$INSTALL_DIR/$rel"
done
echo "[BAK] 文件已复制到: $INSTALL_DIR"

# ---------- 浏览器探测 ----------
detect_exe() {
  # $1 = 期望浏览器族，返回第一个可用可执行文件
  case "$1" in
    edge)
      for c in microsoft-edge msedge edge; do command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return; }; done ;;
    chrome)
      for c in google-chrome google-chrome-stable chrome; do command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return; }; done ;;
    chromium)
      for c in chromium chromium-browser; do command -v "$c" >/dev/null 2>&1 && { command -v "$c"; return; }; done ;;
  esac
  return 1
}

ext_url() {
  case "$1" in
    edge) echo "edge://extensions" ;;
    chrome|chromium) echo "chrome://extensions" ;;
  esac
}

want_list() {
  case "$BROWSER" in
    all) echo "edge chrome chromium" ;;
    *) echo "$BROWSER" ;;
  esac
}

for b in $(want_list); do
  exe="$(detect_exe "$b" || true)"
  if [[ "$LAUNCH" -eq 1 && -n "$exe" ]]; then
    echo "[BAK] 以 --load-extension 启动 $b ..."
    "$exe" --load-extension="$INSTALL_DIR" --no-first-run >/dev/null 2>&1 &
  elif [[ -n "$exe" ]]; then
    echo "[BAK] 打开 $b 扩展管理页: $(ext_url "$b")"
    if command -v xdg-open >/dev/null 2>&1; then xdg-open "$(ext_url "$b")" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then open "$(ext_url "$b")" >/dev/null 2>&1 || true; fi
  else
    echo "[BAK] 未检测到 $b，手动打开 $(ext_url "$b") 即可"
  fi
done

echo
echo "========== 安装目录 =========="
echo "$INSTALL_DIR"
echo "========== 接下来 =========="
echo "1. 在扩展管理页打开「开发者模式 / 开发者选项」"
echo "2. 选择「加载已解压的扩展程序」，选中上面的安装目录"
echo "提示：--launch 仅本次会话加载；长期使用请在开发者模式加载一次。"
