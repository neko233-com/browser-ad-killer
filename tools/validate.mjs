// 开发期工具：校验 manifest / 规则集 JSON 与全部 JS 语法
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;

function checkJson(rel) {
  try {
    JSON.parse(readFileSync(join(root, rel), 'utf8'));
    console.log(`OK  json  ${rel}`);
  } catch (e) {
    fail++; console.error(`FAIL json  ${rel}: ${e.message}`);
  }
}

function checkJs(rel) {
  try {
    execSync(`node --check "${join(root, rel)}"`, { stdio: 'pipe' });
    console.log(`OK  js    ${rel}`);
  } catch (e) {
    fail++; console.error(`FAIL js    ${rel}: ${e.stderr?.toString() || e.message}`);
  }
}

checkJson('manifest.json');
checkJson('rulesets/builtin.json');
[
  'src/lib/defaults.js',
  'src/background/service-worker.js',
  'src/content/search-cleaner.js',
  'src/popup/popup.js',
  'src/options/options.js'
].forEach(checkJs);

process.exit(fail ? 1 : 0);
