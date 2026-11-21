/* Browser Ad Killer — GitHub 镜像链（raw 读取 / codeload 下载逐个回退）
 * 被 background/service-worker.js importScripts；update.ps1/update.sh 内联同一份顺序。
 */

const BAK_GITHUB_REPO = 'neko233-com/browser-ad-killer';

// 远程 manifest.json 候选地址（直连 → jsDelivr → ghproxy → ghfast）
const BAK_REMOTE_MANIFEST_URLS = [
  'https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json',
  'https://cdn.jsdelivr.net/gh/neko233-com/browser-ad-killer@main/manifest.json',
  'https://ghproxy.net/https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json',
  'https://ghfast.top/https://raw.githubusercontent.com/neko233-com/browser-ad-killer/main/manifest.json'
];

// 整仓 zip 下载候选（codeload 直连 → 代理镜像）
const BAK_CODLOAD_MIRRORS = [
  'https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main',
  'https://ghproxy.net/https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main',
  'https://ghfast.top/https://codeload.github.com/neko233-com/browser-ad-killer/zip/refs/heads/main'
];

// 语义化版本比较：a > b 返回 1，a < b 返回 -1，相等 0
function compareVersions(a, b) {
  const pa = String(a || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0.0.0').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}
