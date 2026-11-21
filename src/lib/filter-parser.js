/* Browser Ad Killer — 纯函数过滤器解析器（无 chrome 依赖，可在 Node 单测）
 * 被 background/service-worker.js 通过 importScripts 引入。
 * v1 只解析网络层规则：EasyList 的 ||domain^ 与 hosts 的 0.0.0.0/127.0.0.1；
 * 元素隐藏 ##、正则、复杂修饰符一律跳过（路线图：cosmetic 层）。
 */

function normalizeDomain(d) {
  return String(d || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^\./, '').trim();
}

function looksLikeDomain(d) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(d) && !/[*?\s]/.test(d);
}

// 绝不允许整站拦的父级域名：拦了会打瘸网站自身的图片/脚本/接口，
// 这类大站要拦的是它们的广告子域（如 pos.baidu.com），不是主站本体。
const BAK_PROTECTED_HOSTS = new Set([
  // 中文大站与自家 CDN
  'baidu.com', 'bdstatic.com', 'bcebos.com', 'baidustatic.com', 'bdbos.com',
  'qq.com', 'tencent.com', 'gtimg.com', 'weixin.qq.com', 'qqmail.com',
  'taobao.com', 'tmall.com', 'alicdn.com', 'alipay.com', 'alibaba.com', 'aliyun.com',
  'jd.com', 'jdimg.com', '360.cn', 'so.com', 'sogou.com',
  'sina.com.cn', 'weibo.com', 'weibo.cn', 'sinaimg.cn',
  'bilibili.com', 'hdslb.com', 'zhihu.com', 'zhimg.com', 'csdn.net',
  'douyin.com', 'bytedance.com', 'toutiao.com', 'ixigua.com', 'feishu.cn',
  '163.com', '126.com', 'netease.com', 'migu.com',
  'iqiyi.com', 'qiyi.com', 'youku.com', 'mgtv.com',
  'xiaomi.com', 'mi.com', 'huawei.com', 'honor.com', 'oppo.com', 'vivo.com',
  'gitee.com', 'cnblogs.com', 'jianshu.com', 'douban.com', 'yuque.com',
  // 国际大站与公共基础设施
  'google.com', 'googleapis.com', 'gstatic.com', 'youtube.com', 'android.com',
  'apple.com', 'icloud.com', 'microsoft.com', 'windows.com', 'bing.com',
  'amazon.com', 'aws.amazon.com', 'facebook.com', 'instagram.com', 'twitter.com', 'x.com',
  'github.com', 'githubusercontent.com', 'gitlab.com',
  'cloudflare.com', 'jsdelivr.net', 'unpkg.com', 'cdnjs.com',
  'wikipedia.org', 'stackoverflow.com', 'reddit.com'
]);

function isProtectedHost(domain) {
  const d = String(domain || '').toLowerCase();
  if (BAK_PROTECTED_HOSTS.has(d)) return true;
  // 保护名单里的父域，其裸子域（一层）也放行，但更深的业务子域（如 pos.baidu.com）不在此列
  return false;
}

// 解析单行规则，返回 { blocks:[], allows:[], skip:bool }
function parseFilterLine(line, parser = 'easylist') {
  const out = { blocks: [], allows: [], skip: false };
  if (!line) return out;

  // 纯域名列表（如 anti-AD domains.txt）：整行就是一个域名
  if (parser === 'plain') {
    const t = line.trim();
    if (looksLikeDomain(t) && !isProtectedHost(t)) out.blocks.push(normalizeDomain(t));
    else out.skip = true;
    return out;
  }

  // hosts 格式：0.0.0.0 domain / 127.0.0.1 domain / ::1 domain
  if (parser === 'hosts' || /^(0\.0\.0\.0|127\.0\.0\.1|::1|::)\s+/.test(line)) {
    const m = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1|::)\s+([^\s#]+)/);
    if (m && looksLikeDomain(m[1]) && !isProtectedHost(normalizeDomain(m[1]))) out.blocks.push(normalizeDomain(m[1]));
    else out.skip = true;
    return out;
  }

  // EasyList 格式
  let body = line;
  let allow = false;
  if (body.startsWith('@@')) { allow = true; body = body.slice(2); }
  // 元素隐藏 / 扩展 CSS / 正则规则 / 带 $ 修饰符（站点限定、第三方等）→ v1 跳过
  if (body.includes('##') || body.includes('#?#') || body.startsWith('/') || body.endsWith('/') || body.includes('$')) {
    out.skip = true; return out;
  }
  const m = body.match(/^\|\|([a-zA-Z0-9.-]+)(?:\^|\|)?$/);
  if (m && looksLikeDomain(m[1])) {
    const domain = normalizeDomain(m[1]);
    // 父级大站/资源 CDN 绝不能整站拦（会打瘸网站自身资源），即便订阅里有这种裸域规则
    if (isProtectedHost(domain)) {
      out.skip = true;
      return out;
    }
    allow ? out.allows.push(domain) : out.blocks.push(domain);
  } else {
    out.skip = true;
  }
  return out;
}

// 解析整份订阅文本，返回 { blocks:[...去重], skipped:number }
function parseFilterText(text, parser) {
  const blocks = [];
  let skipped = 0;
  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!') || line.startsWith('[') || line.startsWith('#')) continue;
    const r = parseFilterLine(line, parser);
    if (r.skip) { skipped++; continue; }
    r.blocks.forEach((d) => blocks.push(d));
    r.allows.forEach(() => {});
  }
  return { blocks: [...new Set(blocks)].filter((d) => !isProtectedHost(d)), skipped };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------- Cosmetic（元素隐藏）规则解析 ----------
// 支持：
//   ##selector                     全局隐藏
//   example.com##selector          站点隐藏（域名含其子域）
//   a.com,b.com##selector          多站点
//   ~example.com##selector         排除站点（其余站点生效）
//   example.com#@#selector         例外（该站点不隐藏此选择器）
//   example.com#?#selector         extended CSS（含 [-ext- 的丢弃）
// 不支持：#$# 样式注入、#%#/#@%# 脚本注入（需 eval，安全边界外）

const COSMETIC_SYM_RE = /^(.*?)(#@#|#\?#|##)(.+)$/;

function parseCosmeticRule(line) {
  if (!line) return null;
  const raw = String(line).trim();
  if (!raw || raw.startsWith('!') || raw.startsWith('[')) return null;
  // 脚本/样式注入直接跳过
  if (raw.includes('#$#') || raw.includes('#%#') || raw.includes('#@%#')) return null;

  const m = raw.match(COSMETIC_SYM_RE);
  if (!m) return null;

  const domainPart = m[1].trim();
  const sym = m[2];
  let selector = m[3].trim();

  // 丢弃依赖 AdGuard 扩展语法 / 原生不支持的选择器
  if (!selector || selector.includes('[-ext-') || selector.includes(':style(') || selector.includes(':remove(')) return null;
  // 纯伪类/无元素选择器的规则可能误伤，跳过无法解析的
  if (selector.length > 400) return null;

  const except = sym === '#@#';
  const domains = [];
  const exclude = [];
  let global = false;

  if (!domainPart) {
    global = true;
  } else {
    for (const d of domainPart.split(',')) {
      const t = d.trim();
      if (!t) continue;
      if (t.startsWith('~')) {
        const nd = normalizeDomain(t.slice(1)).replace(/^\*\./, '');
        if (looksLikeDomain(nd)) exclude.push(nd);
        continue;
      }
      const nd = normalizeDomain(t).replace(/^\*\./, '');
      if (looksLikeDomain(nd)) domains.push(nd);
    }
    // 只有排除域名（~a.com）→ 等价于「其余站点全局生效」
    if (!domains.length && exclude.length) global = true;
  }

  if (!global && !domains.length) return null;
  return { selector, domains, global, exclude, except };
}

// 解析整份文本里的 cosmetic 规则
// 返回 { global:[], byDomain:{domain:[sel]}, exceptions:{domain:[sel]}, globalExceptions:[], count, skipped }
function parseCosmeticText(text) {
  const global = new Set();
  const globalExceptions = new Set();
  const globalExcludes = [];   // [{selector, exclude:[domain]}]
  const byDomain = new Map();
  const exceptions = new Map();
  let count = 0, skipped = 0;

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('!') || line.startsWith('[')) continue;
    // `#` 开头通常是 hosts 注释，但 ##/#@#/#?# 是合法的全局隐藏规则
    if (line.startsWith('#') && !/^(##|#@#|#\?#)/.test(line)) continue;
    if (!line.includes('##') && !line.includes('#@#') && !line.includes('#?#')) continue;
    const r = parseCosmeticRule(line);
    if (!r) { skipped++; continue; }
    count++;
    if (r.global) {
      if (r.except) { globalExceptions.add(r.selector); continue; }
      if (r.exclude.length) { globalExcludes.push({ selector: r.selector, exclude: r.exclude }); continue; }
      global.add(r.selector);
      continue;
    }
    const map = r.except ? exceptions : byDomain;
    for (const d of r.domains) {
      if (!map.has(d)) map.set(d, new Set());
      map.get(d).add(r.selector);
    }
  }

  for (const ex of globalExceptions) global.delete(ex);
  const out = {};
  for (const [d, set] of byDomain) {
    const ex = exceptions.get(d);
    if (ex) for (const e of ex) set.delete(e);
    if (set.size) out[d] = [...set];
  }
  return { global: [...global], globalExcludes, byDomain: out, count, skipped };
}

// 按域名稳定分片（content script 与服务端索引共用同一实现）
function cosmeticShard(domain, shardCount = 64) {
  let h = 0;
  const s = String(domain || '').toLowerCase();
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) & 0x7fffffff;
  return h % shardCount;
}

// 给定 hostname，返回需要参与匹配的域名候选（自身 + 逐级父域）
function domainCandidates(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/\.$/, '');
  const out = [];
  const parts = h.split('.');
  for (let i = 0; i < parts.length - 0; i++) {
    const d = parts.slice(i).join('.');
    if (d.includes('.')) out.push(d);
  }
  return out;
}
