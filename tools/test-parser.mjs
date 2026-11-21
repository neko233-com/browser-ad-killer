// 开发期工具：过滤器解析器单测（node tools/test-parser.mjs）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// filter-parser.js 是普通脚本，在函数作用域内执行后回收导出
const src = readFileSync(join(root, 'src/lib/filter-parser.js'), 'utf8');
const { parseFilterLine, parseFilterText, normalizeDomain, chunk,
        parseCosmeticRule, parseCosmeticText, cosmeticShard, domainCandidates } = new Function(
  src + '; return { parseFilterLine, parseFilterText, normalizeDomain, chunk, parseCosmeticRule, parseCosmeticText, cosmeticShard, domainCandidates };'
)();

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a === e) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; console.error(`FAIL  ${name}\n  expected ${e}\n  got      ${a}`); }
}

// EasyList 拦截
eq(parseFilterLine('||ads.example.com^').blocks, ['ads.example.com'], 'easylist block domain');
// EasyList 例外
eq(parseFilterLine('@@||safe.example.com^').allows, ['safe.example.com'], 'easylist allow exception');
// 带修饰符的网络规则（v1 跳过）
eq(parseFilterLine('||track.com^$third-party').skip, true, 'skip $third-party modifier');
// 元素隐藏跳过
eq(parseFilterLine('news.com##.ad-banner').skip, true, 'skip cosmetic ##');
// hosts 格式
eq(parseFilterLine('0.0.0.0 tracker.example.com', 'hosts').blocks, ['tracker.example.com'], 'hosts block');
eq(parseFilterLine('127.0.0.0 localhost', 'hosts').skip, true, 'hosts invalid skipped');
// 纯域名列表（anti-AD domains.txt）
eq(parseFilterLine('kwcdn.000dn.com', 'plain').blocks, ['kwcdn.000dn.com'], 'plain domain list');
eq(parseFilterLine('# comment', 'plain').skip, true, 'plain non-domain skipped');
// 注释/空行
eq(parseFilterText('! comment\n[Adblock]\n\n||a.com^', 'easylist').blocks, ['a.com'], 'comments ignored');
// 带路径规则不得退化成整站域名（曾导致 baidu.com 自身资源被拦）
eq(parseFilterLine('||baidu.com/adver?').skip, true, 'path rule skipped');
eq(parseFilterLine('||baidu.com/api/*/ads/').skip, true, 'path wildcard rule skipped');
eq(parseFilterLine('||baidu.com/adpc/scrollTextAd.js').skip, true, 'path js rule skipped');
// 但同站点的广告子域照拦
eq(parseFilterLine('||pos.baidu.com^').blocks, ['pos.baidu.com'], 'ad subdomain still blocked');
eq(parseFilterLine('||cpro.baidustatic.com^').blocks, ['cpro.baidustatic.com'], 'ad cdn subdomain blocked');
// 父级大站裸域被保护
eq(parseFilterLine('||baidu.com^').skip, true, 'protected root domain skipped');
eq(parseFilterLine('bdstatic.com', 'plain').skip, true, 'protected plain domain skipped');
eq(parseFilterLine('0.0.0.0 qq.com', 'hosts').skip, true, 'protected hosts domain skipped');
// 去重
eq(parseFilterText('||a.com^\n||a.com^\n||b.com^', 'easylist').blocks.sort(), ['a.com', 'b.com'], 'dedup');
// normalizeDomain
eq(normalizeDomain('https://Ads.Example.com/path'), 'ads.example.com', 'normalizeDomain');
// chunk
eq(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], 'chunk batches');

// ---------- Cosmetic 规则 ----------
eq(parseCosmeticRule('news.com##.ad-banner'),
   { selector: '.ad-banner', domains: ['news.com'], global: false, exclude: [], except: false },
   'cosmetic site rule');
eq(parseCosmeticRule('##.global-ad').global, true, 'cosmetic global rule');
eq(parseCosmeticRule('a.com,b.com##.ad').domains, ['a.com', 'b.com'], 'cosmetic multi-domain');
eq(parseCosmeticRule('example.com#@#.ad').except, true, 'cosmetic exception marker');
eq(parseCosmeticRule('example.com#?#div:has(.ad)').selector, 'div:has(.ad)', 'cosmetic extended selector kept');
eq(parseCosmeticRule('example.com#?#div[-ext-has=".ad"]'), null, 'cosmetic ext-has dropped');
eq(parseCosmeticRule('example.com#$#body{overflow:auto}'), null, 'cosmetic style injection dropped');
eq(parseCosmeticRule('example.com#%#window.x=1'), null, 'cosmetic scriptlet dropped');
eq(parseCosmeticRule('example.com##div#ad'), { selector: 'div#ad', domains: ['example.com'], global: false, exclude: [], except: false }, 'cosmetic id selector with hash');
eq(parseCosmeticRule('~news.com##.ad').exclude, ['news.com'], 'cosmetic negated domain captured');
eq(parseCosmeticRule('~news.com##.ad').global, true, 'cosmetic negated-only becomes global');

const ct = parseCosmeticText('! c\n##.g1\nnews.com##.local\nnews.com#@#.local\na.com,b.com##.x\n');
eq(ct.global, ['.g1'], 'cosmetic text global');
eq(ct.byDomain['news.com'], undefined, 'cosmetic exception cancels site rule');
eq(ct.byDomain['a.com'], ['.x'], 'cosmetic text domain indexed');
eq(ct.byDomain['b.com'], ['.x'], 'cosmetic text second domain');
eq(typeof cosmeticShard('example.com'), 'number', 'cosmetic shard returns number');
eq(domainCandidates('a.b.example.com'), ['a.b.example.com', 'b.example.com', 'example.com'], 'domain candidates');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
