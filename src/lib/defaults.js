/* Browser Ad Killer — 共享默认配置与常量
 * 被 background(service-worker, importScripts) / popup / options 直接引用，请勿使用 ES module 语法。
 */

const BAK_VERSION = '0.2.0';
const BAK_STORAGE_KEY = 'bak_settings_v1';

// 默认设置：导出/导入、站点开关都围绕这份结构
const BAK_DEFAULTS = {
  version: 1,
  enabled: true,                 // 总开关
  networkBlocking: true,         // 网络层拦截（内置规则集 + 订阅动态规则）
  searchClean: true,             // 搜索结果页推广净化总开关
  cleanGoogle: true,
  cleanBaidu: true,
  cleanBing: true,
  cleanSogou: true,
  clean360: true,
  removeHotlist: true,           // 隐藏百度热搜板块（首页榜单 + 结果页右侧栏）
  cosmetic: true,               // 通用页面广告槽位/广告域名媒体隐藏（网络层之外的兜底）
  subscriptions: {               // 预设订阅开关，详见 BAK_PRESETS
    adguardbase: true,
    adguardcn: true,
    easylistcn: true,
    antidomains: true,
    easyprivacy: false,
    cjx: false
  },
  customFilters: [],             // 用户自定义网络规则（每行一条，支持 ||domain^ 与 hosts 格式）
  whitelist: [],                 // 暂停拦截的域名（如 example.com）
  stats: { blocked: 0, since: null }
};

// 预设规则订阅：parser 决定解析方式
//  - easylist:  ||domain^ 格式（EasyList / anti-AD easylist 版）
//  - hosts:    0.0.0.0 / 127.0.0.1 开头的 hosts 格式（anti-AD domains.txt）
// 每个源给一组镜像，浏览器内逐个尝试，全部失败则提示手动粘贴。
const BAK_PRESETS = [
  {
    id: 'adguardbase',
    name: 'AdGuard Base（英文基础规则，含元素隐藏）',
    parser: 'easylist',
    homepage: 'https://github.com/AdguardTeam/AdguardFilters',
    urls: [
      'https://filters.adtidy.org/extension/ublock/filters/2.txt',
      'https://ghproxy.net/https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt',
      'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt'
    ]
  },
  {
    id: 'adguardcn',
    name: 'AdGuard Chinese（中文区规则，含元素隐藏）',
    parser: 'easylist',
    homepage: 'https://github.com/AdguardTeam/AdguardFilters',
    urls: [
      'https://filters.adtidy.org/extension/ublock/filters/224.txt',
      'https://ghproxy.net/https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/ChineseFilter/sections/adservers.txt',
      'https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/ChineseFilter/sections/adservers.txt'
    ]
  },
  {
    id: 'easylistcn',
    name: 'EasyList China（中文广告）',
    parser: 'easylist',
    homepage: 'https://easylist.to/',
    urls: [
      'https://easylist-downloads.adblockplus.org/easylistchina.txt',
      'https://cdn.jsdelivr.net/gh/easylistchina/easylistchina@master/easylistchina.txt',
      'https://ghproxy.net/https://raw.githubusercontent.com/easylistchina/easylistchina/master/easylistchina.txt',
      'https://raw.githubusercontent.com/easylistchina/easylistchina/master/easylistchina.txt'
    ]
  },
  {
    id: 'antidomains',
    name: 'anti-AD 域名列表（中文区命中率最高）',
    parser: 'plain',
    homepage: 'https://anti-ad.net/',
    urls: [
      'https://anti-ad.net/domains.txt',
      'https://cdn.jsdelivr.net/gh/privacy-protection-tools/anti-AD@master/domains.txt',
      'https://ghproxy.net/https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/domains.txt',
      'https://raw.githubusercontent.com/privacy-protection-tools/anti-AD/master/domains.txt'
    ]
  },
  {
    id: 'easyprivacy',
    name: 'EasyPrivacy（追踪/隐私）',
    parser: 'easylist',
    homepage: 'https://easylist.to/',
    urls: [
      'https://easylist-downloads.adblockplus.org/easyprivacy.txt',
      'https://cdn.jsdelivr.net/gh/easylist/easylist@master/easyprivacy.txt',
      'https://ghproxy.net/https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy.txt',
      'https://raw.githubusercontent.com/easylist/easylist/master/easyprivacy.txt'
    ]
  },
  {
    id: 'cjx',
    name: "CJX's Annoyance（自推广/骚扰，偏克制）",
    parser: 'easylist',
    homepage: 'https://github.com/cjx82630/cjxlist',
    urls: [
      'https://raw.githubusercontent.com/cjx82630/cjxlist/master/cjx-annoyance.txt',
      'https://cdn.jsdelivr.net/gh/cjx82630/cjxlist@master/cjx-annoyance.txt',
      'https://ghproxy.net/https://raw.githubusercontent.com/cjx82630/cjxlist/master/cjx-annoyance.txt'
    ]
  }
];

// 搜索页“广告/赞助”文字标签（多语言兜底识别）
const BAK_AD_LABELS = [
  '广告', '赞助', '推广', 'Sponsored', 'Sponsored ·', 'Ad', 'Ads',
  'Anzeige', '広告', '광고', 'Promoted'
];

// 动态规则配额（Chrome MV3 动态规则上限 30000，留安全余量）
const BAK_MAX_DYNAMIC_RULES = 25000;
// 每条 DNR 规则合并的域名数（requestDomains 批量，减少规则条数）
const BAK_DOMAINS_PER_RULE = 100;

// 订阅解析结果的持久化 key（避免 service worker 休眠后丢失规则）
const BAK_NETSET_KEY = 'bak_netset_v1';
const BAK_COSMETIC_META_KEY = 'bak_cosmetic_meta_v1';
const BAK_COSMETIC_GLOBAL_KEY = 'bak_cosmetic_global_v1';
const BAK_COSMETIC_EXCLUDES_KEY = 'bak_cosmetic_excludes_v1';
const BAK_COSMETIC_SHARD_PREFIX = 'bak_cosmetic_shard_';
const BAK_COSMETIC_SHARDS = 64;
// DNR 写入结果 / 订阅刷新进度（诊断与 UI 展示用）
const BAK_DNR_STATE_KEY = 'bak_dnr_state_v1';
const BAK_REFRESH_STATE_KEY = 'bak_refresh_state_v1';
