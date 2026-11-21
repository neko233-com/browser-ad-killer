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

// 解析单行规则，返回 { blocks:[], allows:[], skip:bool }
function parseFilterLine(line, parser = 'easylist') {
  const out = { blocks: [], allows: [], skip: false };
  if (!line) return out;

  // hosts 格式：0.0.0.0 domain / 127.0.0.1 domain / ::1 domain
  if (parser === 'hosts' || /^(0\.0\.0\.0|127\.0\.0\.1|::1|::)\s+/.test(line)) {
    const m = line.match(/^(?:0\.0\.0\.0|127\.0\.0\.1|::1|::)\s+([^\s#]+)/);
    if (m && looksLikeDomain(m[1])) out.blocks.push(normalizeDomain(m[1]));
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
  const m = body.match(/^\|\|([a-zA-Z0-9.-]+)(?:\^)?/);
  if (m && looksLikeDomain(m[1])) {
    const domain = normalizeDomain(m[1]);
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
  return { blocks: [...new Set(blocks)], skipped };
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
