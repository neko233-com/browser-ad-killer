/* Browser Ad Killer — 页面广告隐藏（两套机制）
 * 1) 订阅 cosmetic 规则：把 EasyList/AdGuard 的 ## 选择器按域名注入 CSS（AdGuard 的核心能力）
 * 2) 通用兜底：隐藏常见广告槽位容器，以及加载自广告域名的 iframe/图片/媒体
 * 依赖：src/lib/filter-parser.js 需在同组 content_scripts 中先注入（提供 cosmeticShard / domainCandidates）
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'bak_settings_v1';
  const SHARD_PREFIX = 'bak_cosmetic_shard_';
  const SHARD_COUNT = 64;
  const GLOBAL_KEY = 'bak_cosmetic_global_v1';
  const EXCLUDES_KEY = 'bak_cosmetic_excludes_v1';
  const STYLE_ID = 'bak-cosmetic-style';

  /* ---------- 通用兜底 ---------- */
  const AD_HOST_RE = /(doubleclick\.net|googlesyndication\.com|googleadservices\.com|googleads\.g|adservice\.google|taboola\.com|outbrain\.com|zergnet\.com|revcontent\.com|mgid\.com|adsterra\.com|propellerads\.com|popads\.net|criteo\.com|scorecardresearch\.com|quantserve\.com|adsrvr\.org|adform\.net|rubiconproject\.com|openx\.net|pubmatic\.com|casalemedia\.com|moatads\.com|adnxs\.com|xandr\.com|appnexus\.com|adroll\.com|gdt\.qq\.com|ad\.qq\.com|alimama\.com|mmstat\.com|eclick\.baidu\.com|hm\.baidu\.com|cpro\.baidu\.com|pos\.baidu\.com|mtj\.baidu\.com|ad\.union\.baidu\.com|umeng\.com|cnzz\.com|ad\.kuaishou\.com|cp\.snssdk\.com|ad\.oceanengine\.com)/i;

  const SLOT_SEL = [
    'ins.adsbygoogle', '.adsbygoogle',
    '[id*="ad-slot"]', '[class*="ad-slot"]',
    '[id*="banner-ad"]', '[class*="banner-ad"]',
    '[class*="advertisement"]', '[id*="advertisement"]',
    '[class*="adsbox"]', '[class*="adBanner"]',
    '[class*="sponsored-"]', '[data-ad]', '[data-ad-unit]'
  ].join(',');

  function hideEl(el) {
    if (!el || !el.style) return;
    el.style.setProperty('display', 'none', 'important');
  }

  function cosmeticFallback() {
    document.querySelectorAll('iframe,img,embed,object,video').forEach((el) => {
      const src = el.src || el.data || el.currentSrc || '';
      if (src && AD_HOST_RE.test(src)) hideEl(el.closest('div,section,aside,article,li') || el);
    });
    document.querySelectorAll(SLOT_SEL).forEach(hideEl);
  }

  /* ---------- 订阅规则注入 ---------- */
  function injectSelectors(selectors) {
    const list = selectors.filter((s) => typeof s === 'string' && s.length && s.length < 400);
    if (!list.length) return 0;
    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement('style');
      style.id = STYLE_ID;
      (document.head || document.documentElement).appendChild(style);
    }
    // 每 100 条一组：单组内若含无效选择器只影响该组，避免全盘失效
    const parts = [];
    for (let i = 0; i < list.length; i += 100) {
      parts.push(list.slice(i, i + 100).join(',') + '{display:none!important}');
    }
    style.textContent = parts.join('\n');
    return list.length;
  }

  function hostKeys(host) {
    const candidates = domainCandidates(host);
    const shardKeys = [...new Set(candidates.map((d) => SHARD_PREFIX + cosmeticShard(d, SHARD_COUNT)))];
    return { candidates, shardKeys, all: [STORAGE_KEY, GLOBAL_KEY, EXCLUDES_KEY, ...shardKeys] };
  }

  function buildSelectors(host, res) {
    const { shardKeys } = hostKeys(host);
    const sels = new Set();

    // 站点规则：只读与当前 host 相关的分片
    for (const k of shardKeys) {
      const bucket = res[k];
      if (!bucket) continue;
      for (const domain of Object.keys(bucket)) {
        if (host === domain || host.endsWith('.' + domain)) {
          for (const s of bucket[domain]) sels.add(s);
        }
      }
    }

    // 全局规则（带站点排除的跳过）
    const excludeMap = new Map();
    for (const e of (res[EXCLUDES_KEY] || [])) {
      if (!e || !Array.isArray(e.exclude)) continue;
      excludeMap.set(e.selector, e.exclude);
    }
    for (const s of (res[GLOBAL_KEY] || [])) {
      const ex = excludeMap.get(s);
      if (ex && ex.some((d) => host === d || host.endsWith('.' + d))) continue;
      sels.add(s);
    }
    return [...sels];
  }

  function run() {
    const host = location.hostname.toLowerCase();
    chrome.storage.local.get(hostKeys(host).all, (res) => {
      const cfg = res[STORAGE_KEY] || {};
      if (cfg.enabled === false) return;
      if (cfg.cosmetic === false) return;
      try { injectSelectors(buildSelectors(host, res)); } catch (e) { /* 规则异常不应阻塞页面 */ }
      cosmeticFallback();
    });
  }

  run();

  // 订阅刷新后热更新（无需刷新页面）
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    const touched = Object.keys(changes).some((k) =>
      k === GLOBAL_KEY || k === EXCLUDES_KEY || k.startsWith(SHARD_PREFIX));
    if (touched) run();
  });

  // 兜底：动态插入的广告容器
  let timer = null;
  const observer = new MutationObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      chrome.storage.local.get(STORAGE_KEY, (res) => {
        if ((res[STORAGE_KEY] || {}).cosmetic === false) return;
        cosmeticFallback();
      });
    }, 300);
  });
  if (document.documentElement) {
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
})();
