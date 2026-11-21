# Browser Ad Killer · 浏览器广告杀手

[English](README.md) | [中文](README-CN.md)

> Edge / Chrome 原生支持的轻量 MV3 广告拦截扩展：**网络层 DNR 阻断广告/追踪请求 + 搜索引擎推广结果净化**，配置可一键导出，同步到夸克、QQ 等其它 Chromium 浏览器。

零构建、零依赖、纯原生 JS，解压即用。

## 特性

- **网络层拦截**：内置高置信广告/追踪域名静态规则集；支持订阅 EasyList China / anti-AD / EasyPrivacy / CJX，自定义规则，白名单暂停站点。
- **搜索页净化**：Google / 百度 / Bing / 搜狗 / 360（so.com）结果页付费推广结果自动隐藏，不碰自然结果。
- **跨浏览器同步**：设置页导出 JSON，另一台浏览器装好扩展后导入，开关 / 订阅 / 自定义规则 / 白名单一次性带过去。
- **轻量**：MV3 Declarative Net Request，请求拦截不唤醒后台 Worker；内容脚本只在搜索页运行。

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
- **订阅刷新**：规则订阅每 12 小时自动更新，预设源同样带镜像回退。
- **幂等**：`install` / `update` 均可重复执行，重跑不报错、不重复弹窗、不残留临时文件。

## 使用说明

| 位置 | 功能 |
| --- | --- |
| 工具栏弹窗 | 总开关、暂停当前站点、网络拦截/搜索净化开关、已匹配规则数、导出配置 |
| 设置页 → 总开关 | 全局启停 / 网络层 DNR / 搜索净化 |
| 设置页 → 搜索引擎细分 | 单独开关 Google / 百度 / Bing / 搜狗 / 360；百度右侧热搜清理（默认关） |
| 设置页 → 规则订阅 | 勾选预设订阅，「立即更新全部」；12 小时自动刷新 |
| 设置页 → 自定义规则 | 每行一条：`||ads.example.com^` 或 `0.0.0.0 tracker.com`；`@@||x.com^` 为例外放行 |
| 设置页 → 白名单 | 对单个站点暂停全部拦截 |
| 设置页 → 配置同步 | 导出 / 导入 JSON，跨浏览器迁移 |

## 工作原理（三层）

1. **静态规则集**（`rulesets/builtin.json`）：安装时编译，拦截常见广告/追踪域名，不耗动态配额。
2. **动态规则**：订阅文本 + 自定义规则解析出的域名，按 100 域名/条合并成 DNR block 规则；白名单生成优先级 100 的 `allowAllRequests`。
3. **内容脚本净化**：仅在搜索页注入，静态选择器 CSS 预隐藏防闪烁，MutationObserver 兜底动态插入，文字标签（广告/Sponsored/推广…）兜底识别。

## 规则订阅源（预设，设置页开关）

| 订阅 | 说明 | 源（自动镜像回退） |
| --- | --- | --- |
| EasyList China | 中文广告 | easylist-downloads.adblockplus.org / jsDelivr |
| anti-AD 域名列表 | 中文区命中率最高的域名清单 | anti-ad.net / jsDelivr / GitHub |
| EasyPrivacy | 追踪/隐私（默认关） | easylist-downloads.adblockplus.org |
| CJX's Annoyance | 自推广/骚扰（默认关） | GitHub / jsDelivr |

> v1 订阅仅解析网络层域名规则；元素隐藏（`##`）、正则、`$` 修饰符规则跳过，见路线图。

## 开发

```powershell
node tools\verify.mjs       # 全量验证（manifest/规则集 schema/引用/语法/单测，40 项）
node tools\validate.mjs     # JSON + JS 语法校验
node tools\test-parser.mjs  # 过滤器解析器单测（10 例）
node tools\gen-builtin.mjs  # 重新生成内置规则集
node tools\pack.mjs         # 打包 dist\browser-ad-killer-vX.Y.Z.zip
```

## 路线图

- [ ] cosmetic 层：解析 `##` 元素隐藏规则，内容脚本注入 CSS（对标 uBlock element hiding）
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

## 已知限制

- 搜索页 DOM 结构会被搜索引擎调整，选择器失效时靠文字标签兜底；漏网可在自定义规则/issue 反馈。
- 视频前贴、APP 开屏等非网页广告不在本扩展范围。
- 本项目不收集任何数据；订阅拉取发生在浏览器内，规则源可用性取决于网络。

## 许可

MIT（见仓库）。个人/学习用途，与任何浏览器或过滤规则项目无隶属关系。
