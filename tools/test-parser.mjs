// 开发期工具：过滤器解析器单测（node tools/test-parser.mjs）
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
// filter-parser.js 是普通脚本，在函数作用域内执行后回收导出
const src = readFileSync(join(root, 'src/lib/filter-parser.js'), 'utf8');
const { parseFilterLine, parseFilterText, normalizeDomain, chunk } = new Function(
  src + '; return { parseFilterLine, parseFilterText, normalizeDomain, chunk };'
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
// 注释/空行
eq(parseFilterText('! comment\n[Adblock]\n\n||a.com^', 'easylist').blocks, ['a.com'], 'comments ignored');
// 去重
eq(parseFilterText('||a.com^\n||a.com^\n||b.com^', 'easylist').blocks.sort(), ['a.com', 'b.com'], 'dedup');
// normalizeDomain
eq(normalizeDomain('https://Ads.Example.com/path'), 'ads.example.com', 'normalizeDomain');
// chunk
eq(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], 'chunk batches');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
