/* Browser Ad Killer — 通用页面广告隐藏（非搜索引擎页）
 * 职责：网络层 DNR 拦截之外，兜底隐藏常见广告槽位容器与加载自广告域名的媒体/iframe。
 * 只读页面、不改业务逻辑；开关：settings.cosmetic（默认开）。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'bak_settings_v1';

  // 广告/追踪域名（与 builtin.json 网络层拦截对齐的子集）
  const AD_HOST_RE = /(doubleclick\.net|googlesyndication\.com|googleadservices\.com|googleads\.g|adservice\.google|taboola\.com|outbrain\.com|zergnet\.com|revcontent\.com|mgid\.com|adsterra\.com|propellerads\.com|popads\.net|criteo\.com|scorecardresearch\.com|quantserve\.com|adsrvr\.org|adform\.net|rubiconproject\.com|openx\.net|pubmatic\.com|casalemedia\.com|moatads\.com|adnxs\.com|xandr\.com|appnexus\.com|adroll\.com|gdt\.qq\.com|ad\.qq\.com|alimama\.com|mmstat\.com|eclick\.baidu\.com|hm\.baidu\.com|cpro\.baidu\.com|pos\.baidu\.com|mtj\.baidu\.com|ad\.union\.baidu\.com|umeng\.com|cnzz\.com|ad\.kuaishou\.com|cp\.snssdk\.com|ad\.oceanengine\.com)/i;

  // 常见广告槽位容器（保守选择器，避免误伤正文）
  const SLOT_SEL = [
    'ins.adsbygoogle', '.adsbygoogle',
    '[id*="ad-slot"]', '[class*="ad-slot"]',
    '[id*="banner-ad"]', '[class*="banner-ad"]',
    '[class*="advertisement"]', '[id*="advertisement"]',
    '[class*="adsbox"]', '[class*="adBanner"]',
    '[class*="sponsored-"]', '[data-ad]', '[data-ad-unit]'
  ].join(',');

  function hide(el) {
    if (!el || !el.style) return;
    el.style.setProperty('display', 'none', 'important');
  }

  function pass() {
    // 1) 加载自广告域名的 iframe / 图片 / 媒体 → 隐藏其外层容器
    document.querySelectorAll('iframe,img,embed,object,video').forEach((el) => {
      const src = el.src || el.data || el.currentSrc || '';
      if (AD_HOST_RE.test(src)) {
        hide(el.closest('div,section,aside,article,li') || el);
      }
    });
    // 2) 已知广告槽位容器直接隐藏
    document.querySelectorAll(SLOT_SEL).forEach(hide);
  }

  chrome.storage.local.get(STORAGE_KEY).then((res) => {
    const cfg = res[STORAGE_KEY] || {};
    if (cfg.cosmetic === false) return;
    pass();
    let t = null;
    const observer = new MutationObserver(() => {
      clearTimeout(t);
      t = setTimeout(pass, 250);
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
})();
