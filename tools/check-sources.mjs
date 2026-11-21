// 开发期工具：解析本地已下载的订阅文件，统计规则规模与耗时
// 用法：先拉取到 %TEMP%\bak-src，再 node tools/check-sources.mjs [dir]
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'src/lib/filter-parser.js'), 'utf8');
const { parseFilterText, parseCosmeticText, cosmeticShard } = new Function(
  src + '; return { parseFilterText, parseCosmeticText, cosmeticShard };'
)();

const dir = process.argv[2] || join(tmpdir(), 'bak-src');
const SOURCES = [
  ['adguard-base', 'easylist'],
  ['adguard-cn', 'easylist'],
  ['easylist-cn', 'easylist'],
  ['antiad-hosts', 'plain']
];

let totalDomains = 0, totalCosmetic = 0, totalSites = 0;
for (const [name, parser] of SOURCES) {
  const p = join(dir, name + '.txt');
  if (!existsSync(p)) { console.log(`SKIP  ${name} (未下载)`); continue; }
  const text = readFileSync(p, 'utf8');
  const t1 = Date.now();
  const net = parseFilterText(text, parser);
  const cos = parseCosmeticText(text);
  const ms = Date.now() - t1;
  totalDomains += net.blocks.length;
  totalCosmetic += cos.count;
  totalSites += Object.keys(cos.byDomain).length;
  console.log(`${name.padEnd(14)} ${(text.length / 1024).toFixed(0).padStart(6)}KB  parse ${String(ms).padStart(4)}ms  域名 ${String(net.blocks.length).padStart(6)}  隐藏规则 ${String(cos.count).padStart(6)}  站点 ${String(Object.keys(cos.byDomain).length).padStart(6)}  全局 ${cos.global.length}`);
}
console.log(`\n合计：域名 ${totalDomains} / 隐藏规则 ${totalCosmetic} / 站点 ${totalSites}`);
console.log(`动态规则条数估算（100 域名/条）：约 ${Math.ceil(totalDomains / 100)} 条（上限 30000）`);

// 分片均衡度
const shardCounts = new Array(64).fill(0);
for (const s of ['example.com', 'news.com', 'weibo.com', 'bilibili.com']) shardCounts[cosmeticShard(s, 64)]++;
console.log(`分片抽样：${shardCounts.filter((x) => x).length} 个桶被命中（正常）`);
