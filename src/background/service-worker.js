/* Browser Ad Killer — Background Service Worker (MV3)
 * 职责：
 *  1. 总开关 / 网络拦截开关 → 控制静态规则集 builtin 的启停
 *  2. 白名单（暂停站点）→ 高优先级动态 allow 规则
 *  3. 订阅规则 + 用户自定义规则 → 解析为 DNR 动态 block 规则
 *  4. 配置导出 / 导入（同步到其他浏览器）、订阅自动更新、统计
 */
importScripts('../lib/defaults.js');
importScripts('../lib/filter-parser.js');
importScripts('../lib/mirrors.js');

const ALARM_REFRESH = 'bak-refresh-subscriptions';
const ALARM_UPDATE = 'bak-update-check';
const UPDATE_KEY = 'bak_update_v1';

// DNR 写入结果 & 刷新进度，供 options 页与诊断脚本读取
let dnrState = null;

// ---------- 设置读写 ----------
async function getSettings() {
  const raw = await chrome.storage.local.get(BAK_STORAGE_KEY);
  const stored = raw[BAK_STORAGE_KEY] || {};
  return mergeDefaults(BAK_DEFAULTS, stored);
}

function mergeDefaults(base, stored) {
  const out = { ...base, ...stored };
  out.subscriptions = { ...base.subscriptions, ...(stored.subscriptions || {}) };
  out.customFilters = Array.isArray(stored.customFilters) ? stored.customFilters : base.customFilters;
  out.whitelist = Array.isArray(stored.whitelist) ? stored.whitelist : base.whitelist;
  out.blacklist = Array.isArray(stored.blacklist) ? stored.blacklist : base.blacklist;
  out.stats = { ...base.stats, ...(stored.stats || {}) };
  return out;
}

async function saveSettings(patch) {
  const cur = await getSettings();
  const next = mergeDefaults(cur, patch);
  await chrome.storage.local.set({ [BAK_STORAGE_KEY]: next });
  await applySettings(next);
  return next;
}

// ---------- 规则应用 ----------
async function applySettings(s) {
  await loadNetset();
  // 静态规则集（内置域名）受“总开关 + 网络拦截开关”控制
  const staticOn = s.enabled && s.networkBlocking;
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    [staticOn ? 'enableRulesetIds' : 'disableRulesetIds']: ['builtin']
  }).catch(() => {});

  // 动态规则：白名单 allow（高优先级）+ 订阅/自定义 block
  const dynamicRules = [];
  let seq = 1;

  if (s.enabled && s.networkBlocking) {
    // 白名单：allowAllRequests，优先级最高
    for (const domain of s.whitelist) {
      dynamicRules.push({
        id: seq++,
        priority: 100,
        action: { type: 'allowAllRequests' },
        condition: { requestDomains: [normalizeDomain(domain)] }
      });
    }
    // 订阅 + 自定义规则
    const hosts = collectBlockDomains(s);
    const batches = chunk(hosts, BAK_DOMAINS_PER_RULE);
    for (const batch of batches) {
      dynamicRules.push({
        id: seq++,
        priority: 1,
        action: { type: 'block' },
        condition: {
          requestDomains: batch,
          resourceTypes: ['script', 'image', 'sub_frame', 'xmlhttprequest', 'media', 'font', 'websocket', 'ping', 'other']
        }
      });
    }

    // 整站黑名单：连主文档一起拦（广告域名列表不拦主文档，避免误伤站点入口）
    // 优先级必须高于下面的“跟踪参数”redirect 规则（10），否则主文档会被 redirect 规则抢走
    const black = (s.blacklist || []).map(normalizeDomain).filter(Boolean);
    for (const batch of chunk(black, 30)) {
      dynamicRules.push({
        id: seq++,
        priority: 20,
        action: { type: 'block' },
        condition: { requestDomains: batch, resourceTypes: ['main_frame', 'sub_frame'] }
      });
    }
  }

  // 跟踪参数剥离：主文档导航时删除 utm_* / fbclid 等参数。
  // 参数不存在时 Chromium 判定 URL 无变化，不会触发跳转，因此对所有导航生效是安全的。
  if (s.enabled && s.stripTracking) {
    dynamicRules.push({
      id: seq++,
      priority: 10,
      action: {
        type: 'redirect',
        redirect: { transform: { queryTransform: { removeParams: BAK_TRACKING_PARAMS } } }
      },
      condition: { resourceTypes: ['main_frame'] }
    });
  }

  // 注意：updateDynamicRules 不支持 removeAllRules，必须先取出现有 id 再逐个删除，
  // 否则整次调用会抛 "Unexpected property"，导致一条规则都写不进去。
  let prevIds = [];
  try {
    prevIds = (await chrome.declarativeNetRequest.getDynamicRules()).map((r) => r.id);
  } catch (e) {
    prevIds = [];
  }
  const toAdd = dynamicRules.slice(0, BAK_MAX_DYNAMIC_RULES);
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: prevIds,
      addRules: toAdd
    });
    dnrState = { count: toAdd.length, totalRules: dynamicRules.length, error: null, at: Date.now() };
  } catch (e) {
    dnrState = { count: 0, totalRules: dynamicRules.length, error: String((e && e.message) || e), at: Date.now() };
    console.error('[BAK] updateDynamicRules failed', e);
  }
  chrome.storage.local.set({ [BAK_DNR_STATE_KEY]: dnrState }).catch(() => {});
}

// 收集订阅文本里的拦截域名（优先用持久化缓存，SW 休眠后依然有效）
let netsetCache = null; // { domains: [], updatedAt }
let cosmeticCache = null; // { global: [], excludes: [], shards: {} }

async function loadNetset() {
  if (netsetCache) return netsetCache;
  const r = await chrome.storage.local.get(BAK_NETSET_KEY);
  netsetCache = r[BAK_NETSET_KEY] || { domains: [], updatedAt: null };
  return netsetCache;
}

async function loadCosmeticIndex() {
  if (cosmeticCache) return cosmeticCache;
  cosmeticCache = { global: [], excludes: [], shards: {} };
  return cosmeticCache;
}

function collectBlockDomains(s) {
  const set = new Set();
  for (const d of (netsetCache?.domains || [])) set.add(d);
  // 用户自定义规则（实时生效，优先级高于缓存）
  for (const line of s.customFilters || []) {
    const { blocks, allows } = parseFilterLine(line);
    blocks.forEach((d) => set.add(d));
    allows.forEach((d) => set.delete(d));
  }
  return [...set];
}

// ---------- 订阅刷新 ----------

// MV3 的 service worker 在无事件 30s 后会被休眠，长时间拉大文件时用 API 调用续命
let keepAliveTimer = null;
function startKeepAlive() {
  if (keepAliveTimer) return;
  const ping = () => { try { chrome.runtime.getPlatformInfo(() => {}); } catch (e) { /* ignore */ } };
  keepAliveTimer = setInterval(ping, 20000);
  ping();
}
function stopKeepAlive() {
  if (keepAliveTimer) { clearInterval(keepAliveTimer); keepAliveTimer = null; }
}

// 镜像逐个尝试；首次冷启动时大文件（6MB+）可能超过 20s，这里给足 45s，
// 第二个轮次改走 HTTP 缓存（第一次的响应头通常是可缓存的）。
async function fetchWithMirrors(urls, timeoutMs = 45000) {
  let lastErr = null;
  for (const url of urls) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetch(url, {
          cache: attempt === 0 ? 'no-store' : 'default',
          signal: AbortSignal.timeout(timeoutMs)
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const text = await res.text();
        if (!text || text.length < 200) throw new Error('响应内容过短: ' + (text ? text.length : 0));
        return { text, url };
      } catch (e) { lastErr = e; }
    }
  }
  throw lastErr || new Error('所有镜像均失败');
}

// 把多个订阅的解析结果构建成持久化索引：
//  - 网络层域名集合（bak_netset_v1）
//  - cosmetic 选择器按域名分 64 片（bak_cosmetic_shard_N）+ 全局/排除
// 每个源只解析一次，同时返回逐源统计。
async function publishIndexes(presetTexts) {
  const domains = new Set();
  const globalSel = new Set();
  const excludes = [];
  const byDomain = new Map();
  let cosmeticCount = 0;
  const perSource = [];

  for (const entry of presetTexts) {
    const { blocks } = parseFilterText(entry.text, entry.parser);
    blocks.forEach((d) => domains.add(d));
    const c = parseCosmeticText(entry.text);
    cosmeticCount += c.count;
    for (const g of c.global) globalSel.add(g);
    for (const e of c.globalExcludes) excludes.push(e);
    for (const [d, sels] of Object.entries(c.byDomain)) {
      if (!byDomain.has(d)) byDomain.set(d, new Set());
      const set = byDomain.get(d);
      for (const s of sels) set.add(s);
    }
    perSource.push({ id: entry.id, domains: blocks.length, cosmetic: c.count });
  }

  const shards = {};
  for (let i = 0; i < BAK_COSMETIC_SHARDS; i++) shards[i] = {};
  for (const [d, set] of byDomain) {
    const idx = cosmeticShard(d, BAK_COSMETIC_SHARDS);
    shards[idx][d] = [...set];
  }

  const payload = {
    [BAK_NETSET_KEY]: { domains: [...domains], updatedAt: Date.now() },
    [BAK_COSMETIC_GLOBAL_KEY]: [...globalSel],
    [BAK_COSMETIC_EXCLUDES_KEY]: excludes,
    [BAK_COSMETIC_META_KEY]: { domains: domains.size, selectors: cosmeticCount, sites: byDomain.size, updatedAt: Date.now() }
  };
  for (let i = 0; i < BAK_COSMETIC_SHARDS; i++) {
    payload[BAK_COSMETIC_SHARD_PREFIX + i] = shards[i];
  }
  await chrome.storage.local.set(payload);

  netsetCache = { domains: [...domains], updatedAt: Date.now() };
  cosmeticCache = null;
  return { domains: domains.size, cosmetic: cosmeticCount, sites: byDomain.size, perSource };
}

let refreshing = false;

async function refreshSubscriptions(manual = false) {
  if (refreshing) return [{ id: '_busy', name: '刷新', ok: false, error: '已有刷新任务在跑' }];
  refreshing = true;
  startKeepAlive();
  const startedAt = Date.now();
  const results = [];
  const texts = [];
  const setState = (patch) => {
    chrome.storage.local
      .set({ [BAK_REFRESH_STATE_KEY]: { running: true, manual, startedAt, ...patch } })
      .catch(() => {});
  };

  try {
    const s = await getSettings();
    const active = BAK_PRESETS.filter((p) => s.subscriptions[p.id]);
    for (const preset of BAK_PRESETS) {
      if (!s.subscriptions[preset.id]) {
        results.push({ id: preset.id, name: preset.name, skipped: true, reason: '未启用' });
      }
    }
    setState({ step: 'fetch', done: 0, total: active.length, current: null });
    for (let k = 0; k < active.length; k++) {
      const preset = active[k];
      setState({ step: 'fetch', done: k, total: active.length, current: preset.id });
      try {
        const { text, url } = await fetchWithMirrors(preset.urls);
        texts.push({ id: preset.id, text, parser: preset.parser });
        results.push({ id: preset.id, name: preset.name, ok: true, bytes: text.length, via: url });
      } catch (e) {
        results.push({ id: preset.id, name: preset.name, ok: false, error: String((e && e.message) || e) });
      }
      setState({ step: 'fetch', done: k + 1, total: active.length, current: preset.id });
    }

    if (texts.length) {
      setState({ step: 'index', done: active.length, total: active.length, current: null });
      const idx = await publishIndexes(texts);
      for (const ps of idx.perSource) {
        const r = results.find((x) => x.id === ps.id);
        if (r) { r.domains = ps.domains; r.cosmetic = ps.cosmetic; }
      }
      results.push({ id: '_index', name: '索引', ok: true, domains: idx.domains, cosmetic: idx.cosmetic, sites: idx.sites });
    }

    setState({ step: 'apply', done: active.length, total: active.length });
    await applySettings(s);
    results.push({
      id: '_dnr', name: '网络规则', ok: !dnrState?.error,
      count: dnrState?.count ?? null, error: dnrState?.error || null
    });

    chrome.storage.local
      .set({ [BAK_REFRESH_STATE_KEY]: { running: false, manual, startedAt, finishedAt: Date.now(), results } })
      .catch(() => {});
    if (manual) console.info('[BAK] refresh done', results);
    return results;
  } catch (e) {
    const msg = String((e && e.message) || e);
    chrome.storage.local
      .set({ [BAK_REFRESH_STATE_KEY]: { running: false, manual, startedAt, error: msg, results } })
      .catch(() => {});
    console.error('[BAK] refresh failed', e);
    return results.concat([{ id: '_error', ok: false, error: msg }]);
  } finally {
    refreshing = false;
    stopKeepAlive();
  }
}

// ---------- 配置导出 / 导入（跨浏览器同步） ----------
function buildExport(s) {
  return {
    meta: {
      app: 'browser-ad-killer',
      appVersion: BAK_VERSION,
      exportedAt: new Date().toISOString(),
      format: 'bak-config/v1'
    },
    settings: {
      enabled: s.enabled,
      networkBlocking: s.networkBlocking,
      searchClean: s.searchClean,
      cleanGoogle: s.cleanGoogle,
      cleanBaidu: s.cleanBaidu,
      cleanBing: s.cleanBing,
      cleanSogou: s.cleanSogou,
      clean360: s.clean360,
      removeHotlist: s.removeHotlist,
      subscriptions: s.subscriptions,
      customFilters: s.customFilters,
      whitelist: s.whitelist,
      blacklist: s.blacklist,
      stripTracking: s.stripTracking,
      defuseAntiAdblock: s.defuseAntiAdblock
    }
  };
}

function parseImport(config) {
  if (!config || config.meta?.format !== 'bak-config/v1') throw new Error('不是有效的 AdKiller 配置文件');
  const st = config.settings || {};
  return {
    enabled: !!st.enabled,
    networkBlocking: !!st.networkBlocking,
    searchClean: !!st.searchClean,
    cleanGoogle: !!st.cleanGoogle, cleanBaidu: !!st.cleanBaidu,
    cleanBing: !!st.cleanBing, cleanSogou: !!st.cleanSogou, clean360: !!st.clean360,
    removeHotlist: !!st.removeHotlist,
    subscriptions: st.subscriptions || {},
    customFilters: Array.isArray(st.customFilters) ? st.customFilters : [],
    whitelist: Array.isArray(st.whitelist) ? st.whitelist.map(normalizeDomain) : [],
    blacklist: Array.isArray(st.blacklist) ? st.blacklist.map(normalizeDomain).filter(Boolean) : [],
    stripTracking: st.stripTracking !== false,
    defuseAntiAdblock: st.defuseAntiAdblock !== false
  };
}

// ---------- 统计 ----------
async function getBlockedCount() {
  try {
    const res = await chrome.declarativeNetRequest.getMatchedRules({});
    return res.rulesMatchedInfo ? res.rulesMatchedInfo.length : 0;
  } catch { return -1; }
}

// ---------- 远程版本检查（镜像链逐个回退） ----------
async function fetchRemoteManifest() {
  let lastErr = null;
  for (const url of BAK_REMOTE_MANIFEST_URLS) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all mirrors failed');
}

async function checkRemoteUpdate(manual = false) {
  try {
    const remote = await fetchRemoteManifest();
    const latest = remote.version || '0.0.0';
    const available = compareVersions(latest, BAK_VERSION) > 0;
    const meta = { available, latest, checkedAt: Date.now(), manual };
    await chrome.storage.local.set({ [UPDATE_KEY]: meta });
    return meta;
  } catch (e) {
    return { available: false, error: String(e.message || e) };
  }
}

async function getUpdateStatus() {
  const r = await chrome.storage.local.get(UPDATE_KEY);
  return r[UPDATE_KEY] || { available: false };
}

// ---------- 消息路由 ----------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    switch (msg?.type) {
      case 'GET_STATE':
        sendResponse(await getSettings());
        break;
      case 'TOGGLE_MASTER':
        sendResponse(await saveSettings({ enabled: msg.value }));
        break;
      case 'TOGGLE_NETWORK':
        sendResponse(await saveSettings({ networkBlocking: msg.value }));
        break;
      case 'TOGGLE_SEARCH':
        sendResponse(await saveSettings({ searchClean: msg.value }));
        break;
      case 'UPDATE_SETTINGS':
        sendResponse(await saveSettings(msg.patch || {}));
        break;
      case 'SET_WHITELIST': {
        const s = await getSettings();
        const domain = normalizeDomain(msg.domain);
        const set = new Set(s.whitelist);
        msg.paused ? set.add(domain) : set.delete(domain);
        sendResponse(await saveSettings({ whitelist: [...set] }));
        break;
      }
      case 'SET_BLACKLIST': {
        const s = await getSettings();
        const domain = normalizeDomain(msg.domain);
        if (!domain) { sendResponse({ ok: false, error: '无效域名' }); break; }
        const set = new Set(s.blacklist || []);
        msg.blocked ? set.add(domain) : set.delete(domain);
        sendResponse({ ok: true, settings: await saveSettings({ blacklist: [...set] }) });
        break;
      }
      case 'REFRESH_SUBSCRIPTIONS':
        sendResponse(await refreshSubscriptions(true));
        break;
      case 'GET_COSMETIC_META': {
        const r = await chrome.storage.local.get(BAK_COSMETIC_META_KEY);
        sendResponse(r[BAK_COSMETIC_META_KEY] || { domains: 0, selectors: 0, sites: 0 });
        break;
      }
      case 'EXPORT_CONFIG':
        sendResponse(buildExport(await getSettings()));
        break;
      case 'IMPORT_CONFIG':
        try {
          const patch = parseImport(msg.config);
          sendResponse({ ok: true, settings: await saveSettings(patch) });
        } catch (e) {
          sendResponse({ ok: false, error: String(e.message || e) });
        }
        break;
      case 'GET_STATS':
        sendResponse({ blocked: await getBlockedCount() });
        break;
      case 'CHECK_UPDATE':
        sendResponse(await checkRemoteUpdate(true));
        break;
      case 'GET_UPDATE_STATUS':
        sendResponse(await getUpdateStatus());
        break;
      default:
        sendResponse({ error: 'unknown message' });
    }
  })();
  return true; // 异步响应
});

// ---------- 安装 / 启动 / 定时 ----------
chrome.runtime.onInstalled.addListener(async () => {
  const s = await getSettings();
  await chrome.storage.local.set({ [BAK_STORAGE_KEY]: s });
  await applySettings(s);
  chrome.alarms.create(ALARM_REFRESH, { periodInMinutes: 60 * 12 }); // 12 小时刷新订阅
  chrome.alarms.create(ALARM_UPDATE, { periodInMinutes: 60 * 6 });    // 6 小时检查新版本
  refreshSubscriptions(false);
  checkRemoteUpdate(false);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_REFRESH) refreshSubscriptions(false);
  if (alarm.name === ALARM_UPDATE) checkRemoteUpdate(false);
});

// 浏览器启动时重放一次规则（SW 会休眠，动态规则持久化，但静态集状态需复核）
chrome.runtime.onStartup.addListener(async () => {
  await applySettings(await getSettings());
});
