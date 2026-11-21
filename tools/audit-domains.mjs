// 审计：解析全部订阅源后，列出会被整站拦截的“根域”（两段域名），
// 用于人工核对是否误伤正常网站。（node tools/audit-domains.mjs）
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/lib/filter-parser.js'), 'utf8');
const { parseFilterText, parseCosmeticText } = new Function(
  src + '; return { parseFilterText, parseCosmeticText };'
)();

const tmp = tmpdir();
const SOURCES = [
  ['adguard-base', join(tmp, 'bak-src', 'adguard-base.txt'), 'easylist'],
  ['adguard-cn', join(tmp, 'bak-src', 'adguard-cn.txt'), 'easylist'],
  ['easylist-cn', join(tmp, 'bak-src', 'easylist-cn.txt'), 'easylist'],
  ['antiad', join(tmp, 'bak-src', 'antiad-hosts.txt'), 'plain']
];

const all = new Set();
let cosmeticTotal = 0;
for (const [id, file, parser] of SOURCES) {
  if (!existsSync(file)) { console.log(`MISSING ${id} -> ${file}`); continue; }
  const text = readFileSync(file, 'utf8');
  const t0 = Date.now();
  const { blocks, skipped } = parseFilterText(text, parser);
  const c = parseCosmeticText(text);
  cosmeticTotal += c.count;
  blocks.forEach((d) => all.add(d));
  console.log(`${id.padEnd(14)} 拦截域名 ${String(blocks.length).padStart(6)}  跳过 ${String(skipped).padStart(6)}  隐藏规则 ${String(c.count).padStart(5)}  ${Date.now() - t0}ms`);
}

console.log(`\n合计去重拦截域名: ${all.size}  隐藏规则: ${cosmeticTotal}`);

// 两段域名 = 会拦整站的根域
const roots = [...all].filter((d) => d.split('.').length === 2);
console.log(`根域（整站拦截）数量: ${roots.length}`);

// 可疑：看起来像内容/基础设施站而非纯广告的根域关键词
const SUSPECT = /(^|\.)((news|video|music|map|mail|shop|pay|bank|gov|edu|cloud|cdn|img|image|photo|wiki|docs?|api|dev|test))\b/;
const suspicious = roots.filter((d) => SUSPECT.test(d));
console.log(`\n可能误伤（含内容/基础设施关键词）的根域 ${suspicious.length} 个：`);
console.log(suspicious.sort().join(', '));

console.log('\n根域全量（前 240 个，按字母序）：');
console.log(roots.sort().slice(0, 240).join(', '));
