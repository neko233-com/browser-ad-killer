/* Browser Ad Killer — 反广告拦截对抗（anti-adblock defuser）
 * 站点检测到拦截后常弹出全屏遮罩 / 锁滚动 / 强制弹窗要求关闭拦截。
 * 这里只处理「明确的拦截提示」这一种文案，命中才动手，避免误删正常弹层。
 * 独立于 cosmetic 层：不依赖订阅索引，任何页面都可工作。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'bak_settings_v1';
  // 明确的“检测到广告拦截”类文案（中英文 + 常见变体），整体匹配才动手
  const TEXT_RE = /(检测到|发现|侦测到)?.{0,10}(广告)?(拦截|屏蔽|过滤)(器|插件|软件|扩展)?.{0,16}(请|关闭|禁用|停用|白名单|解锁)|adblock(er|plus)?\s*(detected|is\s*(on|enabled|active)|turn\s*off|disable)|(disable|turn\s*off|remove)\s*(your\s*)?(adblock(er)?|ad\s*blocker)|请?关闭.{0,6}(广告拦截|屏蔽)|whitelist\s*(us|this\s*site)/i;
  // 拦截提示常见容器类名/ID（低风险信号，配合文案双重确认）
  const CANDIDATE_SEL = [
    '[id*="adblock" i]', '[class*="adblock" i]',
    '[id*="anti-ad" i]', '[class*="anti-ad" i]',
    '[id*="adblocker" i]', '[class*="adblocker" i]',
    '[class*="ad-detected" i]', '[id*="ad-detected" i]'
  ].join(',');

  let enabled = true;
  let timer = null;
  const handled = new WeakSet();

  function looksLikeOverlay(el) {
    try {
      const cs = getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      const wide = rect.width >= innerWidth * 0.5 && rect.height >= innerHeight * 0.35;
      const fixed = cs.position === 'fixed' || cs.position === 'absolute';
      const modalish = cs.zIndex && parseInt(cs.zIndex, 10) >= 100;
      return wide && (fixed || modalish);
    } catch (e) { return false; }
  }

  // 命中后：先移除遮罩本身，再恢复被锁的滚动/隐藏 body
  function defuse(el) {
    if (handled.has(el)) return;
    handled.add(el);
    try {
      el.style.setProperty('display', 'none', 'important');
      el.style.setProperty('visibility', 'hidden', 'important');
      el.setAttribute('data-bak-defused', '1');
      for (const node of [document.documentElement, document.body]) {
        if (!node) continue;
        if (node.style.overflow === 'hidden') node.style.removeProperty('overflow');
        if (node.style.position === 'fixed') node.style.removeProperty('position');
        // 只摘与拦截提示相关的锁类，不动页面其它 class
        for (const c of ['adblock-on', 'adblocker-detected', 'adblock-detected', 'modal-open', 'no-scroll']) {
          node.classList.remove(c);
        }
      }
    } catch (e) { /* 单点失败不影响其它 */ }
  }

  function scan() {
    if (!enabled) return;
    // 1) 类名/ID 命中 + 文案确认
    for (const el of document.querySelectorAll(CANDIDATE_SEL)) {
      if (handled.has(el)) continue;
      const t = (el.textContent || '').slice(0, 400);
      if (TEXT_RE.test(t)) defuse(el);
    }
    // 2) 全覆盖遮罩里出现拦截文案（有些站点容器类名毫无规律）
    for (const el of document.querySelectorAll('body > div, body > section, body > aside')) {
      if (handled.has(el)) continue;
      if (!looksLikeOverlay(el)) continue;
      const t = (el.textContent || '').slice(0, 400);
      if (TEXT_RE.test(t)) defuse(el);
    }
  }

  function start() {
    scan();
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scan, 400);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // 兜底：部分站点延迟很久才弹
    setTimeout(scan, 3000);
    setTimeout(scan, 8000);
  }

  chrome.storage.local.get(STORAGE_KEY).then((res) => {
    const cfg = res[STORAGE_KEY] || {};
    enabled = cfg.enabled !== false && cfg.defuseAntiAdblock !== false;
    if (!enabled) return;
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        scan();
        start();
      });
    } else {
      start();
    }
  });
})();
