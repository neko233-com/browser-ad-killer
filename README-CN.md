# Browser Ad Killer · 浏览器广告杀手

[English](README.md) | [中文](README-CN.md)

> Edge / Chrome 原生支持的轻量 MV3 广告拦截扩展：**网络层 DNR 阻断广告/追踪请求 + 搜索引擎推广结果净化**，配置可一键导出，同步到夸克、QQ 等其它 Chromium 浏览器。

零构建、零依赖、纯原生 JS，解压即用。

## 特性

- **网络层拦截**：内置高置信广告/追踪域名静态规则集；订阅 AdGuard Base / AdGuard Chinese / EasyList China / anti-AD 后约 **12.7 万个拦截域名**（去重），自定义规则、白名单暂停站点。
- **元素隐藏（cosmetic）**：解析订阅里的 `##` 隐藏规则，按域名分片持久化，页面加载即注入 CSS，约 **6.8 万条选择器 / 3.2 万个站点**，无需等待网络拦截生效。
- **搜索页净化**：Google / 百度 / Bing / 搜狗 / 360（so.com）结果页付费推广结果自动隐藏，不碰自然结果；百度首页与结果页右侧「百度热搜/风云榜」默认清理。
- **防误伤**：带路径的规则（`||baidu.com/adver?`）不会被降级成整站拦截，父级大站与其 CDN 有保护名单，避免「拦广告把网站打死」。
- **自动更新**：订阅每 12 小时在浏览器内刷新（不依赖 SW 常驻）；版本检查每 6 小时；配合系统计划任务可无人值守更新扩展本体。
- **跨浏览器同步**：设置页导出 JSON，另一台浏览器装好扩展后导入，开关 / 订阅 / 自定义规则 / 白名单一次性带过去。
- **轻量**：MV3 Declarative Net Request，请求拦截不唤醒后台 Worker；元素隐藏走静态 CSS 分片，页面不卡。

## 一键安装（推荐）

### Windows（pwsh 7 / 系统自带 PowerShell 5.1 均可）

```powershell
# 在项目根目录运行
powershell -ExecutionPolicy Bypass -File .\install.ps1
# 只装 Edge 并用 --load-extension 直接拉起（仅本次会话）
.\install.ps1 -Browser Edge -Launch
# 只复制文件、不自动开浏览器
.\install.ps1 -Browser None
# 自定义安装目录
.\install.ps1 -InstallDir D:\Tools\adk
```

### Linux / macOS / WSL / Git Bash

```bash
./install.sh
./install.sh --launch --browser=chrome
./install.sh --dir=/opt/adk
```

脚本把运行时文件复制到稳定目录（Windows：`%LOCALAPPDATA%\browser-ad-killer\extension`；类 Unix：`~/.config/browser-ad-killer/extension`），自动探测已安装的 Edge / Chrome / QQ 并打开扩展管理页；`-Launch` / `--launch` 用 `--load-extension` 直接拉起（仅本次会话，长期使用仍需在开发者模式加载一次目录）。

## 手动安装

### Edge / Chrome（推荐）

1. 克隆或下载本仓库：
   ```bash
   git clone https://github.com/neko233-com/browser-ad-killer.git
   ```
2. 地址栏输入 `edge://extensions`（Chrome 为 `chrome://extensions`）回车，打开右上角「开发者模式」。
3. 点「加载解压缩的扩展」，选择项目根目录（含 `manifest.json` 的那一层）。

> 上架商店前，浏览器更新后可能需要重新点「加载已解压」；规则自行刷新，不影响使用。

### 各浏览器说明

| 浏览器 | 加载方式 |
| --- | --- |
| **Edge / Chrome** | 开发者模式 → 加载解压缩 → 选文件夹 |
| **夸克（PC）** | 设置→夸克实验室开启「扩展支持」→ `quark://extensions` → 开发者模式 → 加载已解压文件夹（**不要拖 .crx/.zip**） |
| **QQ 浏览器** | `qqbrowser://extensions` → 开发者模式；拖 .crx 失败时改用解压目录加载 |
| 其它 Chromium（搜狗、360 极速等） | 同样解压加载；内核过旧可能对 MV3/DNR 支持不全，功能降级 |

## 自动更新与镜像

- **扩展内检测**：后台每 6 小时经镜像链检查 GitHub 远程版本，有新版时弹窗提示（已是最新不打扰）。
- **命令更新**：`update.ps1`（Windows）/ `update.sh`（类 Unix）走「GitHub 直连 → jsDelivr → ghproxy → ghfast」镜像链逐个回退拉取整仓，仅当远程版本更高才刷新安装目录；已是最新直接 no-op，全部镜像不可达时仅告警、不破坏现有安装。
- **无人值守（Windows）**：注册计划任务后每天静默执行一次 `update.ps1 -Quiet`，下次启动浏览器自动用上新版本（未解压扩展每次启动都会重新读取安装目录）。

```powershell
# 注册每日 12:00 静默更新任务（一次即可，重复执行不会重复建任务）
.\install.ps1 -ScheduleUpdate
# 查看 / 删除
schtasks /query /tn "Browser Ad Killer Update"
schtasks /delete /tn "Browser Ad Killer Update" /f
```

- **订阅刷新**：规则订阅每 12 小时自动更新，预设源同样带镜像回退；拉取期间会调用扩展 API 保活，避免 MV3 Worker 被休眠打断。
- **幂等**：`install` / `update` 均可重复执行，重跑不报错、不重复弹窗、不残留临时文件。

## 使用说明

| 位置 | 功能 |
| --- | --- |
| 工具栏弹窗 | 总开关、暂停当前站点、网络拦截/搜索净化开关、已匹配规则数、导出配置 |
| 设置页 → 总开关 | 全局启停 / 网络层 DNR / 搜索净化 |
| 设置页 → 搜索引擎细分 | 单独开关 Google / 百度 / Bing / 搜狗 / 360；百度首页与结果页右侧热搜清理（默认开） |
| 设置页 → 规则订阅 | 勾选预设订阅，「立即更新全部」；12 小时自动刷新 |
| 设置页 → 自定义规则 | 每行一条：`||ads.example.com^` 或 `0.0.0.0 tracker.com`；`@@||x.com^` 为例外放行 |
| 设置页 → 白名单 | 对单个站点暂停全部拦截 |
| 设置页 → 配置同步 | 导出 / 导入 JSON，跨浏览器迁移 |

## 工作原理（三层）

1. **静态规则集**（`rulesets/builtin.json`）：安装时编译，拦截常见广告/追踪域名，不耗动态配额。
2. **动态规则**：订阅文本 + 自定义规则解析出的域名，按 100 域名/条合并成 DNR block 规则；白名单生成优先级 100 的 `allowAllRequests`。
3. **元素隐藏**：订阅里的 `##` 规则按域名分 64 片持久化到 storage，内容脚本读相关分片生成 CSS（每 100 条一组，单条失效不连坐），页面加载即生效。
4. **搜索页净化**：仅在搜索页注入，静态选择器 CSS 预隐藏防闪烁，MutationObserver 兜底动态插入，文字标签（广告/Sponsored/推广…）兜底识别。

## 规则订阅源（预设，设置页开关）

| 订阅 | 说明 | 源（自动镜像回退） |
| --- | --- | --- |
| AdGuard Base | 全球基础规则（含元素隐藏，默认开） | filters.adtidy.org / ghproxy / GitHub raw |
| AdGuard Chinese | 中文区规则（含元素隐藏，默认开） | filters.adtidy.org / ghproxy / GitHub raw |
| EasyList China | 中文广告（默认开） | easylist-downloads.adblockplus.org / jsDelivr |
| anti-AD 域名列表 | 中文区命中率最高的域名清单（默认开） | anti-ad.net / jsDelivr / GitHub |
| EasyPrivacy | 追踪/隐私（默认关） | easylist-downloads.adblockplus.org |
| CJX's Annoyance | 自推广/骚扰（默认关） | GitHub / jsDelivr |

> 解析范围：`||domain^` 纯域名规则（带路径的规则不会被降级成整站拦截）、纯域名清单、`##` / `#@#` 元素隐藏规则。`$` 修饰符、`#?#` 扩展选择器、脚本注入规则跳过。

## 开发

```powershell
node tools\verify.mjs       # 全量验证（manifest/规则集 schema/引用/语法/单测，43 项）
node tools\validate.mjs     # JSON + JS 语法校验
node tools\test-parser.mjs  # 过滤器解析器单测（37 例）
node tools\gen-builtin.mjs  # 重新生成内置规则集
node tools\audit-domains.mjs # 审计拦截域名，排查是否误伤整站
node tools\pack.mjs         # 打包 dist\browser-ad-killer-vX.Y.Z.zip
```

## 路线图

- [x] cosmetic 层：解析 `##` 元素隐藏规则，内容脚本注入 CSS（对标 uBlock element hiding）
- [x] 规则解析防误伤：带路径规则不降级、父级大站与 CDN 保护名单
- [ ] 内置常见站点横幅/弹窗/自我推广的选择器库
- [ ] 订阅规则增量更新与缓存版本号展示
- [ ] 自定义元素隐藏选取器（页面上点选生成规则）
- [ ] AI 辅助：把页面广告特征转成规则
- [ ] Firefox MV3 适配、商店发布（Edge Add-ons / Chrome Web Store）

## 对标开源项目

- [uBlock Origin](https://github.com/gorhill/uBlock)：全能标杆（MV3 下功能受限，本项目只做精简要害）
- [AdGuard Extension](https://github.com/AdguardTeam/AdGuardExtension)：MV3 架构参考
- [abp2dnr](https://www.npmjs.com/package/abp2dnr)：EasyList → DNR 转换参考
- [AdGuard tsurlfilter](https://github.com/AdguardTeam/tsurlfilter)：过滤器引擎参考
- [anti-AD](https://github.com/privacy-protection-tools/anti-AD)：中文域名清单
- [EasyList China](https://github.com/easylistchina/easylistchina)：中文过滤规则

## 与 AdGuard 对照

| 能力 | 本扩展 | 说明 |
| --- | --- | --- |
| 网页广告 / 追踪拦截 | ✅ | DNR 动态规则，去重后约 12.7 万域名 |
| 元素隐藏（横幅、广告位、热搜） | ✅ | 订阅 `##` 规则，约 6.8 万选择器 / 3.2 万站点 |
| 搜索页推广净化 | ✅ | 五家引擎 + 百度热搜，AdGuard 需额外规则 |
| 恶意 / 钓鱼网站拦截 | ⚠️ 部分 | 无专项钓鱼库，可自行订阅恶意域名列表 |
| DNS 层保护（全系统 / 全应用） | ❌ | 扩展无法接管系统 DNS；如需请把系统或路由器 DNS 设为 AdGuard DNS |
| HTTPS 内容层过滤（中间人） | ❌ | MV3 明确禁止，任何浏览器扩展都做不到 |
| 反 adblock 对抗页面 | ⚠️ 有限 | 网络层与元素隐藏生效，脚本注入类对抗受限 |
| 家长控制 / Stealth 隐私模式 | ❌ | 属桌面版专有能力 |
| 非浏览器流量（APP 开屏等） | ❌ | 需 AdGuard 桌面版或系统级方案 |
| 规则自动更新 | ✅ | 订阅 12 小时 + 计划任务无人值守更新本体 |

> 结论：**网页浏览场景可以完全取代 AdGuard Pro**（含元素隐藏这一 AdGuard 的核心能力）；系统级 DNS、全应用拦截这类桌面能力需另外用 AdGuard DNS 或桌面版补齐。

## 已知限制

- 搜索页 DOM 结构会被搜索引擎调整，选择器失效时靠文字标签兜底；漏网可在自定义规则/issue 反馈。
- 视频前贴、APP 开屏等非网页广告不在本扩展范围。
- 本项目不收集任何数据；订阅拉取发生在浏览器内，规则源可用性取决于网络。

## 许可

MIT（见仓库）。个人/学习用途，与任何浏览器或过滤规则项目无隶属关系。
