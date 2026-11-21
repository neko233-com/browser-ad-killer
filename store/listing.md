# Edge 加载项商店提交资料

## 1. 基本信息（Partner Center 直接粘贴）

| 字段 | 值 |
|---|---|
| 显示名称 | Browser Ad Killer |
| 版本 | 0.2.0（取自 `manifest.json`） |
| 类别 | Productivity（生产力） |
| 年龄分级 | Everyone（无用户生成内容、无社交功能） |
| 语言 | English (United States)、中文（简体） |
| 支持链接 | https://github.com/neko233-com/browser-ad-killer/issues |
| 官网 | https://github.com/neko233-com/browser-ad-killer |
| 隐私政策 | https://neko233-com.github.io/browser-ad-killer/privacy.html |
| 包 | `dist/browser-ad-killer-v0.2.0.zip`（37 KB，解压根目录即 `manifest.json`） |

## 2. 单用途说明（Single purpose）

**EN** — Blocks ads and trackers on web pages, without collecting any user data.

**中文** — 在网页上拦截广告与追踪器，不收集任何用户数据。

## 3. 简介 / 详细描述

### 英文（Short description，≤132 字符）
Block ads, trackers and search-result promotions. No account, no telemetry.

### 英文（Description）
Browser Ad Killer is a lightweight, privacy-first ad blocker for Microsoft Edge.

It works on two layers:

- **Network layer (declarativeNetRequest):** blocks ad, tracker and malware domains using bundled and auto-updated lists (AdGuard Base, AdGuard Chinese, EasyList China, anti-AD), with a built-in domain set so protection starts immediately after install.
- **Page layer (content scripts):** removes ad slots and sponsored placements that the network layer cannot catch, and cleans search results on Google, Baidu, Bing, Sogou and 360 — including Baidu's "hot list" panel and promotional answer cards.

What it does not do:

- No account, no sign-in, no telemetry, no analytics, no remote configuration.
- No browsing history is stored or transmitted. Settings and compiled rule lists stay in local extension storage.
- No page content is modified beyond removing ad elements; the extension never reads form fields or passwords.

Everything runs locally. The extension fetches public blocklists (the same lists AdGuard and EasyList publish) over HTTPS to keep rules current; nothing about you is sent with those requests.

Open the toolbar popup to see counters and toggle features; the options page lets you paste your own filter rules and export settings to other Chromium browsers.

### 中文（简介）
拦截广告、追踪器与搜索结果推广位；无账号、无遥测。

### 中文（详细描述）
Browser Ad Killer 是一个轻量、隐私优先的 Microsoft Edge 广告拦截扩展。

它在两个层面工作：

- **网络层（declarativeNetRequest）**：用内置域名表 + 自动更新的 AdGuard Base / AdGuard Chinese / EasyList China / anti-AD 订阅拦截广告、追踪与恶意域名，安装即生效。
- **页面层（内容脚本）**：清除网络层拦不掉的广告位与推广卡片；净化 Google、百度、Bing、搜狗、360 的搜索结果，包括百度热搜板块与推广型答案卡片。

它不做什么：

- 不需要账号、不登录、无遥测、无统计、无远程配置。
- 不保存、不上传浏览历史；设置与编译后的规则只存在本机扩展存储里。
- 除移除广告元素外不改动页面内容，绝不读取表单与密码。

全部在本机运行。扩展会通过 HTTPS 拉取公开的广告拦截订阅（与 AdGuard、EasyList 公开发布的是同一批列表）以保持规则新鲜，请求中不携带任何与你相关的信息。

点工具栏图标可看拦截计数并开关功能；选项页支持粘贴自定义过滤规则，并可导出配置到其它 Chromium 浏览器。

## 4. 权限理由（Permission justification）

| 权限 | 理由 |
|---|---|
| `declarativeNetRequest` | 核心功能：按规则拦截广告/追踪请求，不读取请求内容。 |
| `declarativeNetRequestFeedback` | 仅用于「为什么这个请求被拦」的本地调试计数，不产生网络上报。 |
| `storage` / `unlimitedStorage` | 保存开关、统计计数与编译后的规则表（百万级域名，需较大配额）。 |
| `host_permissions: <all_urls>` | 广告域名出现在任意站点，拦截必须在所有站点生效；扩展不读取页面正文，只用 DNR 规则匹配 URL。 |
| `scripting` | 在用户已打开的页面里注入元素隐藏样式（cosmetic 规则），无需刷新页面。 |
| `activeTab` | 用户点击图标时，仅对当前标签页做一次规则诊断。 |
| `tabs` | 判断当前标签页是否是可注入的 http/https 页面，并读取 URL 以匹配域名级元素隐藏规则。 |
| `alarms` | 定时刷新订阅与自动更新，避免常驻轮询。 |

## 5. 审核备注（Notes for certification）

1. 安装后无需登录或配置即可生效。
2. 验证网络层：打开 `https://www.baidu.com/s?wd=耳机`，原页面顶部/中部的「淘宝」「京东」推广卡片不再出现；打开任意新闻站，侧栏与文章内广告位被隐藏。
3. 验证搜索净化：`https://www.baidu.com/` 首页底部「百度热搜」板块被移除；`https://www.baidu.com/s?wd=装修公司` 结果页不出现推广位。
4. 验证拦截计数：点工具栏图标，弹窗显示已拦截请求数；选项页可看到订阅状态。
5. 全部数据处理在本机完成，扩展不发任何遥测；订阅请求只带固定 User-Agent 与列表 URL。
6. 若审核环境无法访问百度，可用任意含广告的英文站点验证网络层（例如带 Google AdSense 的博客），元素隐藏与 DNR 拦截均会生效。

## 6. 商店素材

| 文件 | 规格 | 用途 |
|---|---|---|
| `logo-300.png` | 300×300 PNG | Store logo（必需） |
| `screenshot-1-serp.png` | 1280×800 | 百度结果页：推广卡片已移除 |
| `screenshot-2-home.png` | 1280×800 | 百度首页：热搜板块已移除 |
| `small-tile-440x280.png` | 440×280 | 小促销图（可选） |
