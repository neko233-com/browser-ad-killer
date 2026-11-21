// 开发期工具：把内置广告/追踪域名清单批量打成 DNR 静态规则集
// 用法：node tools/gen-builtin.mjs  ->  rulesets/builtin.json
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

// 高置信度广告 / 追踪域名（刻意避开发布方自有域名，如 baidu.com 主站、qq.com 主站）
const DOMAINS = [
  // Google 广告 / 统计
  'doubleclick.net', 'googlesyndication.com', 'googleadservices.com',
  'google-analytics.com', 'ssl.google-analytics.com', 'analytics.google.com',
  'adservice.google.com', 'adservice.google.de', 'pagead2.googlesyndication.com',
  // 百度广告 / 统计
  'eclick.baidu.com', 'hm.baidu.com', 'cbjs.baidu.com', 'hmjs.baidu.com',
  'pos.baidu.com', 'cpro.baidu.com', 'nsclick.baidu.com', 'mtj.baidu.com',
  'cnzz.com', 's9.cnzz.com', 'umeng.com', 'sdk.umeng.com', 'mtj.umeng.com',
  // 腾讯 / 阿里广告
  'ad.qq.com', 'gdt.qq.com', 'alimama.com', 'mmstat.com',
  // 国际内容联盟 / 广告网络
  'taboola.com', 'outbrain.com', 'zergnet.com', 'revcontent.com',
  'propellerads.com', 'adsterra.com', 'popads.net', 'mgid.com', 'plista.com',
  'contentabc.com', 'ads.yahoo.com', 'advertising.com', 'adroll.com',
  'criteo.com', 'scorecardresearch.com', 'quantserve.com', 'chartbeat.com',
  // 国内广告 / 追踪 SDK
  'ad.kuaishou.com', 'cp.snssdk.com', 'ad.union.baidu.com', 'cpro.bj.baidubce.com',
  'adsrvr.org', 'adform.net', 'rubiconproject.com', 'openx.net',
  'pubmatic.com', 'casalemedia.com', 'ssp.yahoo.com', '33across.com',
  'mathtag.com', 'bidswitch.net', 'adtechus.com', 'moatads.com',
  'z.moatads.com', 'bidgear.com', 'rtb-media.com', 'adnxs.com'
];

const PER_RULE = 100;
const rules = [];
let id = 1;
for (let i = 0; i < DOMAINS.length; i += PER_RULE) {
  const batch = DOMAINS.slice(i, i + PER_RULE);
  rules.push({
    id: id++,
    priority: 1,
    action: { type: 'block' },
    condition: {
      requestDomains: batch,
      resourceTypes: [
        'script', 'image', 'sub_frame', 'xmlhttprequest',
        'media', 'font', 'websocket', 'ping', 'other'
      ]
    }
  });
}

mkdirSync(join(root, 'rulesets'), { recursive: true });
writeFileSync(
  join(root, 'rulesets', 'builtin.json'),
  JSON.stringify(rules, null, 2) + '\n',
  'utf8'
);
console.log(`builtin.json written: ${rules.length} rule(s), ${DOMAINS.length} domains`);
