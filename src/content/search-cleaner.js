/* Browser Ad Killer — 搜索结果页推广净化（内容脚本，自包含，不使用 ES module）
 * 支持：Google / 百度 / Bing / 搜狗 / 360(so.com)
 * 策略：静态选择器 CSS 预隐藏（防闪烁）+ MutationObserver 兜底动态插入 + 文字标签兜底识别。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'bak_settings_v1';
  const LABEL_RE = /^(广告|赞助|推广|Sponsored(\s*results)?|Promoted|Anzeige|広告|광고)(\s*[·•\-].*)?$/i;

  // 诊断标记：确认内容脚本确实注入到了该页面
  try {
    if (document.documentElement) document.documentElement.dataset.bakSc = 'loaded';
  } catch (e) { /* ignore */ }

  // ---------- 引擎识别 ----------
  function detectEngine() {
    const host = location.hostname;
    const path = location.pathname;
    if (/google\.(com|com\.hk|co\.jp)$/.test(host) && path.startsWith('/search')) return 'google';
    if (/baidu\.com$/.test(host)) return 'baidu';
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

  let cfg = { searchClean: true, removeHotlist: true };
  let active = true;
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
      // 热搜板块：首页榜单 + 结果页右侧栏（默认开，显式关闭才停用）
      if (cfg.removeHotlist !== false) {
        [
          '#s-hotsearch-wrapper', '.s-hotsearch-wrapper', '#hotsearch',
          '[tpl*="hotsearch"]', '[class*="hotsearch-list"]', '.hotsearch-content-wrapper',
          // 结果页右侧“百度热搜/风云榜”块（2025+ 改版后的稳定 class）
          '.FYB_RD', '[class*="FYB_RD"]', '.cr-content .opr-toplist1-update_39A0r'
        ].forEach((sel) => document.querySelectorAll(sel).forEach(hide));
        // 文本兜底：标题为“百度热搜”的板块，上溯到含多个链接的容器隐藏
        document.querySelectorAll('span, b, div, a, h2, h3').forEach((el) => {
          const t = (el.textContent || '').trim();
          if (!/^百度热搜\s*(>|›)?$/.test(t) && t !== '换一换') return;
          let node = el;
          for (let i = 0; i < 6 && node.parentElement; i++) {
            node = node.parentElement;
            const links = node.querySelectorAll('a[href]');
            if (links.length >= 3) { hide(node); break; }
          }
        });
      }
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
    baidu: `#con-ad,#pm-ad,[data-tuiguang],[tpl="space"],[tpl=space],[tpl*="tuiguang"],[clicklog*="tuiguang"],.ec_ad,[class*="ec_ad"],.ec_tuiguang,[class*="ec_tuiguang"]{display:none!important;}` +
           `/* 热搜：首页榜单 + 结果页右侧风云榜 */ #s-hotsearch-wrapper,.s-hotsearch-wrapper,#hotsearch,[class*="hotsearch-list"],.FYB_RD,[class*="FYB_RD"]{display:none!important;}`,
    bing: `.b_ad,li.b_ad,.b_algo.b_ad,[class*="b_ad"]{display:none!important;}`,
    sogou: `[data-tuiguang],.ads-region,.tx-shadow,#seo-ad,.rb[data-tuiguang],[class*="ec_ad"]{display:none!important;}`,
    so360: `[data-tuiguang],.res-list[data-tuiguang],.ad-cont,[class*="ec_ad"],.ad-wrap,#adReport{display:none!important;}`
  };

    let staticStyleEl = null;

  function injectStaticCSS() {
    if (staticStyleEl) return staticStyleEl;
    const css = STATIC_CSS[ENGINE];
    if (!css) return null;
    const style = document.createElement('style');
    style.textContent = css;
    style.id = 'bak-search-clean-style';
    (document.head || document.documentElement).appendChild(style);
    staticStyleEl = style;
    return style;
  }

  function scanAll() {
    if (!active) return;
    try { cleaners[ENGINE](); } catch (e) { /* 单页结构变化不应打断 */ }
  }

  // ---------- 启动 ----------
  // 默认配置下（搜索净化 + 热搜隐藏均为开）立即执行，不等 storage，
  // 避免 document_start 到 storage 回调之间广告已渲染完成的闪烁/漏拦。
  injectStaticCSS();
  scanAll();

  function startObserver() {
    let timer = null;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(scanAll, 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    scanAll();
  }

  chrome.storage.local.get(STORAGE_KEY).then((res) => {
    cfg = res[STORAGE_KEY] || cfg;
    active = !!(cfg.searchClean && cfg[ENGINE_FLAG] !== false);
    if (!active) {
      if (staticStyleEl) { staticStyleEl.remove(); staticStyleEl = null; }
      return;
    }
    if (cfg.removeHotlist === false && ENGINE === 'baidu') {
      if (staticStyleEl) staticStyleEl.textContent = STATIC_CSS_BAIDU_NO_HOTLIST;
      return;
    }
    injectStaticCSS();
    scanAll();
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserver);
    } else {
      startObserver();
    }
  });

  // 用户显式关掉“隐藏热搜”时，百度页只清除热搜相关 CSS
  const STATIC_CSS_BAIDU_NO_HOTLIST =
    `#con-ad,#pm-ad,[data-tuiguang],[tpl="space"],[tpl=space],[tpl*="tuiguang"],[clicklog*="tuiguang"],.ec_ad,[class*="ec_ad"],.ec_tuiguang,[class*="ec_tuiguang"]{display:none!important;}`;
})();
