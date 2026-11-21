// 全量验证：node tools/verify.mjs  —— 逐项 PASS/FAIL，任一失败退出码 1
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`PASS  ${name}`); };
const bad = (name, why) => { fail++; console.error(`FAIL  ${name}${why ? ' — ' + why : ''}`); };
const read = (rel) => readFileSync(join(root, rel), 'utf8');

// ---------- 1. JSON 可解析 ----------
let manifest, builtin;
try { manifest = JSON.parse(read('manifest.json')); ok('manifest.json 可解析'); }
catch (e) { bad('manifest.json 可解析', e.message); }
try { builtin = JSON.parse(read('rulesets/builtin.json')); ok('rulesets/builtin.json 可解析'); }
catch (e) { bad('rulesets/builtin.json 可解析', e.message); }

// ---------- 2. manifest 结构与引用存在性 ----------
if (manifest) {
  const checks = [
    ['manifest_version === 3', manifest.manifest_version === 3],
    ['name 非空', !!manifest.name],
    ['version 非空', !!manifest.version],
    ['background.service_worker 存在', !!manifest.background?.service_worker],
    ['action.default_popup 存在', !!manifest.action?.default_popup],
    ['options_ui.page 存在', !!manifest.options_ui?.page],
    ['permissions 含 declarativeNetRequest', (manifest.permissions || []).includes('declarativeNetRequest')],
    ['host_permissions 已声明', Array.isArray(manifest.host_permissions) && manifest.host_permissions.length > 0]
  ];
  for (const [n, c] of checks) c ? ok(n) : bad(n);

  const files = [
    manifest.background?.service_worker,
    manifest.action?.default_popup,
    manifest.options_ui?.page,
    ...Object.values(manifest.icons || {}),
    ...(manifest.declarative_net_request?.rule_resources || []).map((r) => r.path),
    ...(manifest.content_scripts || []).flatMap((cs) => cs.js || [])
  ].filter(Boolean);
  for (const f of files) existsSync(join(root, f)) ? ok(`引用存在: ${f}`) : bad(`引用存在: ${f}`, '文件缺失');

  // 内容脚本匹配声明
  const cs = manifest.content_scripts || [];
  cs.length ? ok(`content_scripts 已声明 ${cs.length} 组`) : bad('content_scripts', '为空');
}

// ---------- 3. 内置规则集 schema ----------
if (Array.isArray(builtin)) {
  let schemaOk = true, total = 0;
  for (const r of builtin) {
    total++;
    if (!Number.isInteger(r.id)) schemaOk = false;
    if (r.action?.type !== 'block') schemaOk = false;
    if (!Array.isArray(r.condition?.requestDomains) || !r.condition.requestDomains.length) schemaOk = false;
  }
  schemaOk ? ok(`builtin.json 规则 schema 合法（${total} 条）`) : bad('builtin.json 规则 schema');
}

// ---------- 4. 全部源码 JS 语法 ----------
const jsFiles = [
  'src/lib/defaults.js', 'src/lib/filter-parser.js', 'src/lib/mirrors.js',
  'src/background/service-worker.js', 'src/content/search-cleaner.js',
  'src/popup/popup.js', 'src/options/options.js'
];
for (const f of jsFiles) {
  try { execSync(`node --check "${join(root, f)}"`, { stdio: 'pipe' }); ok(`语法: ${f}`); }
  catch (e) { bad(`语法: ${f}`, e.stderr?.toString() || e.message); }
}

// ---------- 5. HTML 引用的本地资源存在 ----------
for (const page of ['src/popup/popup.html', 'src/options/options.html']) {
  const html = read(page);
  const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1])
    .filter((u) => !/^https?:\/\//.test(u) && !u.startsWith('#'));
  for (const r of refs) {
    const base = join(root, dirname(page), r);
    existsSync(base) ? ok(`页面引用: ${page} -> ${r}`) : bad(`页面引用: ${page} -> ${r}`, '缺失');
  }
}

// ---------- 6. 安装/更新脚本就位 ----------
for (const f of ['install.ps1', 'install.sh', 'update.ps1', 'update.sh']) {
  existsSync(join(root, f)) ? ok(`脚本就位: ${f}`) : bad(`脚本就位: ${f}`, '缺失');
}

// ---------- 7. 过滤器解析器单测 ----------
try {
  execSync(`node "${join(root, 'tools/test-parser.mjs')}"`, { stdio: 'pipe' });
  ok('过滤器解析器单测全部通过');
} catch (e) { bad('过滤器解析器单测', e.stdout?.toString() || e.message); }

console.log(`\n===== ${pass} PASS / ${fail} FAIL =====`);
process.exit(fail ? 1 : 0);
