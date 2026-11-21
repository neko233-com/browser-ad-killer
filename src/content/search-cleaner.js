/* Browser Ad Killer — 搜索结果页推广净化（内容脚本，自包含，不使用 ES module）
 * 支持：Google / 百度 / Bing / 搜狗 / 360(so.com)
 * 策略：静态选择器 CSS 预隐藏（防闪烁）+ MutationObserver 兜底动态插入 + 文字标签兜底识别。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'bak_settings_v1';
  const LABEL_RE = /^(广告|赞助|推广|Sponsored(\s*results)?|Promoted|Anzeige|広告|광고)(\s*[·•\-].*)?$/i;

  // ---------- 引擎识别 ----------
  function detectEngine() {
    const host = location.hostname;
    const path = location.pathname;
    if (/google\.(com|com\.hk|co\.jp)$/.test(host) && path.startsWith('/search')) return 'google';
    if (/baidu\.com$/.test(host) && /^\/s($|\?)/.test(path)) return 'baidu';
    if (/bing\.com$/.test(host)) return 'bing';
    if (/sogou\.com$/.test(host) && /^\/web/.test(path)) return 'sogou';
    if (/so\.com$/.test(host)) return 'so360';
    return null;
  }

  const ENGINE = detectEngine();
  if (!ENGINE) return;

  const ENGINE_FLAG = {
    google: 'cleanGoogle', baidu: 'cleanBaidu', bing: 'cleanBing',
    sogou: 'cleanSogou', so360: 'clean360'
  }[ENGINE];

  let cfg = { searchClean: true, removeHotlist: false };
  let active = false;
  const hiddenSet = new WeakSet();

  // ---------- 工具 ----------
  function hide(el) {
    if (!el || hiddenSet.has(el)) return;
    hiddenSet.add(el);
    el.style.setProperty('display', 'none', 'important');
  }

  function labelHit(el) {
    const t = (el.textContent || '').trim();
    return t.length <= 14 && LABEL_RE.test(t);
  }

  // 在容器内找广告文字标签，命中则隐藏整个容器
  function hideByLabel(containerSelector) {
    document.querySelectorAll(containerSelector).forEach((card) => {
      if (hiddenSet.has(card)) return;
      const badge = Array.from(card.querySelectorAll('span, div, a, b, em, i')).some(labelHit);
      if (badge) hide(card);
    });
  }

  // ---------- 各引擎清理器 ----------
  const cleaners = {
    google() {
      // 已知广告容器
      ['#tads', '#tadsb', '#tvcap', '#bottomads', '#taw']
        .forEach((sel) => document.querySelectorAll(sel).forEach(hide));
      // /aclk 跳转链接 → 上溯到结果卡片
      document.querySelectorAll('a[href*="/aclk"]').forEach((a) => {
        const card = a.closest('div.g, div[data-hveid], li, div[role="listitem"]');
        hide(card || a.parentElement);
      });
      // 标签兜底
      hideByLabel('div.g, div[data-hveid], div[role="listitem"]');
    },

    baidu() {
      // 已知推广容器 / 属性
      const sels = [
        '#con-ad', '#pm-ad', '[data-tuiguang]', '[tpl="space"]', '[tpl=space]',
        '[tpl*="tuiguang"]', '[clicklog*="tuiguang"]', '.ec_ad, [class*="ec_ad"]',
        '.ec_tuiguang, [class*="ec_tuiguang"]'
      ];
      sels.forEach((sel) => document.querySelectorAll(sel).forEach(hide));
      // 结果卡片内“广告”角标兜底
      document.querySelectorAll('#content_left > div.c-container').forEach((card) => {
        if (hiddenSet.has(card)) return;
        const badge = Array.from(card.querySelectorAll('span, div, a, b, em, i')).some(labelHit);
        if (badge) hide(card);
      });
      // 右侧热搜（默认关，避免误杀）
      if (cfg.removeHotlist) hide(document.querySelector('#content_right'));
    },

    bing() {
      ['.b_ad', 'li.b_ad', '.b_algo.b_ad', '[class*="b_ad"]', '.b_card.b_ad']
        .forEach((sel) => document.querySelectorAll(sel).forEach(hide));
      hideByLabel('.b_algo, .b_card, li.b_algo');
    },

    sogou() {
      [
        '[data-tuiguang]', '.vrwrap[data-tuiguang]', '.ads-region', '.tx-shadow',
        '#seo-ad', '.rb[data-tuiguang]', '[class*="ec_ad"]'
      ].forEach((sel) => document.querySelectorAll(sel).forEach(hide));
      hideByLabel('.vrwrap, .rb, .results > div');
    },

    so360() {
      [
        '[data-tuiguang]', '.res-list[data-tuiguang]', '.ad-cont',
        '[class*="ec_ad"]', '.ad-wrap', '#adReport'
      ].forEach((sel) => document.querySelectorAll(sel).forEach(hide));
      hideBySelectorCard();
      function hideBySelectorCard() {
        document.querySelectorAll('.res-list, .result').forEach((card) => {
          if (hiddenSet.has(card)) return;
          const badge = Array.from(card.querySelectorAll('span, div, a, b, em, i')).some(labelHit);
          if (badge) hide(card);
        });
      }
    }
  };

  // 静态 CSS：页面一加载就隐藏已知槽位，减少闪烁
  const STATIC_CSS = {
    google: `#tads,#tadsb,#tvcap,#bottomads,#taw{display:none!important;}`,
    baidu: `#con-ad,#pm-ad,[data-tuiguang],[tpl="space"],[tpl=space],[tpl*="tuiguang"],[clicklog*="tuiguang"],.ec_ad,[class*="ec_ad"],.ec_tuiguang,[class*="ec_tuiguang"]{display:none!important;}`,
    bing: `.b_ad,li.b_ad,.b_algo.b_ad,[class*="b_ad"]{display:none!important;}`,
    sogou: `[data-tuiguang],.ads-region,.tx-shadow,#seo-ad,.rb[data-tuiguang],[class*="ec_ad"]{display:none!important;}`,
    so360: `[data-tuiguang],.res-list[data-tuiguang],.ad-cont,[class*="ec_ad"],.ad-wrap,#adReport{display:none!important;}`
  };

  function injectStaticCSS() {
    const css = STATIC_CSS[ENGINE];
    if (!css) return;
    const style = document.createElement('style');
    style.textContent = css;
    (document.head || document.documentElement).appendChild(style);
  }

  function scanAll() {
    if (!active) return;
    try { cleaners[ENGINE](); } catch (e) { /* 单页结构变化不应打断 */ }
  }

  // ---------- 启动 ----------
  function startObserver() {
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scanAll, 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    // 首次补扫
    scanAll();
  }

  chrome.storage.local.get(STORAGE_KEY).then((res) => {
    cfg = res[STORAGE_KEY] || cfg;
    active = !!(cfg.searchClean && cfg[ENGINE_FLAG] !== false);
    if (!active) return;
    injectStaticCSS();
    scanAll();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { scanAll(); startObserver(); });
    } else {
      startObserver();
    }
  });
})();
