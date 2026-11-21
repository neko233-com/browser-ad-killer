/* Browser Ad Killer — Background Service Worker (MV3)
 * 职责：
 *  1. 总开关 / 网络拦截开关 → 控制静态规则集 builtin 的启停
 *  2. 白名单（暂停站点）→ 高优先级动态 allow 规则
 *  3. 订阅规则 + 用户自定义规则 → 解析为 DNR 动态 block 规则
 *  4. 配置导出 / 导入（同步到其他浏览器）、订阅自动更新、统计
 */
importScripts('../lib/defaults.js');
importScripts('../lib/filter-parser.js');

const ALARM_REFRESH = 'bak-refresh-subscriptions';

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
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeAllRules: true,
    addRules: dynamicRules.slice(0, BAK_MAX_DYNAMIC_RULES)
  }).catch((e) => console.warn('[BAK] updateDynamicRules failed', e));
}

// 收集订阅文本里的拦截域名（解析缓存挂在全局，避免每次重建都重下）
let subscriptionCache = {}; // {id: {text, parser, fetchedAt}}

function collectBlockDomains(s) {
  const set = new Set();
  for (const preset of BAK_PRESETS) {
    if (!s.subscriptions[preset.id]) continue;
    const cached = subscriptionCache[preset.id];
    if (!cached) continue;
    const { blocks } = parseFilterText(cached.text, preset.parser);
    blocks.forEach((d) => set.add(d));
  }
  // 用户自定义规则
  for (const line of s.customFilters) {
    const { blocks, allows } = parseFilterLine(line);
    blocks.forEach((d) => set.add(d));
    allows.forEach((d) => set.delete(d));
  }
  return [...set];
}

// ---------- 订阅刷新 ----------
async function fetchWithMirrors(urls) {
  let lastErr = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error('all mirrors failed');
}

async function refreshSubscriptions(manual = false) {
  const s = await getSettings();
  const results = [];
  for (const preset of BAK_PRESETS) {
    if (!s.subscriptions[preset.id]) {
      results.push({ id: preset.id, name: preset.name, skipped: true, reason: '未启用' });
      continue;
    }
    try {
      const text = await fetchWithMirrors(preset.urls);
      const { blocks, skipped } = parseFilterText(text, preset.parser);
      subscriptionCache[preset.id] = { text, parser: preset.parser, fetchedAt: Date.now() };
      results.push({ id: preset.id, name: preset.name, added: blocks.length, skipped, ok: true });
    } catch (e) {
      results.push({ id: preset.id, name: preset.name, ok: false, error: String(e.message || e) });
    }
  }
  await applySettings(s);
  if (manual) console.info('[BAK] refresh done', results);
  return results;
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
      whitelist: s.whitelist
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
    whitelist: Array.isArray(st.whitelist) ? st.whitelist.map(normalizeDomain) : []
  };
}

// ---------- 统计 ----------
async function getBlockedCount() {
  try {
    const res = await chrome.declarativeNetRequest.getMatchedRules({});
    return res.rulesMatchedInfo ? res.rulesMatchedInfo.length : 0;
  } catch { return -1; }
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
      case 'REFRESH_SUBSCRIPTIONS':
        sendResponse(await refreshSubscriptions(true));
        break;
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
  refreshSubscriptions(false);
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_REFRESH) refreshSubscriptions(false);
});

// 浏览器启动时重放一次规则（SW 会休眠，动态规则持久化，但静态集状态需复核）
chrome.runtime.onStartup.addListener(async () => {
  await applySettings(await getSettings());
});
