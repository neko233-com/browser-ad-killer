// 开发期工具：把运行时文件打包成 dist\browser-ad-killer-vX.Y.Z.zip（解压后即为可加载目录）
import { readFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
const version = manifest.version;

const stage = join(root, 'dist', '_stage');
const outDir = join(root, 'dist');
mkdirSync(outDir, { recursive: true });
rmSync(stage, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });

// 运行时需要打包的文件/目录（相对 root）
const items = [
  'manifest.json',
  'rulesets/builtin.json',
  'icons',
  'src/background',
  'src/content',
  'src/popup',
  'src/options',
  'src/lib/defaults.js',
  'src/lib/filter-parser.js'
];

for (const rel of items) {
  const src = join(root, rel);
  if (!existsSync(src)) { console.warn('skip missing:', rel); continue; }
  cpSync(src, join(stage, rel), { recursive: true });
}

const zip = join(outDir, `browser-ad-killer-v${version}.zip`);
rmSync(zip, { force: true });
// Compress-Archive 打包 stage 内容，解压根目录直接含 manifest.json
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Path '${stage}\\*' -DestinationPath '${zip}' -Force"`,
  { stdio: 'inherit' }
);
rmSync(stage, { recursive: true, force: true });
console.log(`packed: ${zip}`);
