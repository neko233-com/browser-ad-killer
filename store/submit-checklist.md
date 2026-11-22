# Edge / Chrome 上架提交清单

包与素材都已就绪，两个商店都只需「登录 → 新建条目 → 上传 → 粘贴 → 提交」。

## 通用素材（同一份，两个商店都能用）

| 用途 | 文件 |
|---|---|
| 扩展包 | `dist/browser-ad-killer-v0.2.0.zip` |
| 商店 logo（Edge 300×300；Chrome 用 manifest 内 128 图标） | `store/logo-300.png` |
| 截图 1280×800（≥1 张即可） | `store/screenshot-1-serp.png`、`store/screenshot-2-home.png` |
| 小促销图 440×280（可选） | `store/small-tile-440x280.png` |
| 文案 / 单用途 / 权限理由 / 审核备注 | `store/listing.md` |
| 隐私政策 | https://neko233-com.github.io/browser-ad-killer/privacy.html |
| 支持链接 | https://github.com/neko233-com/browser-ad-killer/issues |

## Edge 加载项商店（免费）

1. 打开 https://partner.microsoft.com/dashboard/microsoftedge/overview ，用微软账号登录。
2. 首次需注册 Edge 开发者计划（免费，填发布者名称）。
3. 「新建提交 / New submission」→ 上传 `browser-ad-killer-v0.2.0.zip`。
4. 填表（值见 `store/listing.md`）：名称 `Browser Ad Killer`、类别 Productivity、语言 English + 中文、简介、详细描述、单用途、逐条权限理由。
5. 上传 `logo-300.png`、两张 1280×800 截图、`small-tile-440x280.png`。
6. 隐私政策 URL 填上面的 Pages 地址；支持链接填 Issues；「Notes for certification」粘贴 `listing.md` 第 5 节。
7. 年龄分级 Everyone → 提交，审核约 1–7 天。

## Chrome Web Store（一次性 $5 开发者注册费，不可退）

1. 打开 https://chrome.google.com/webstore/devconsole ，用 Google 账号登录并支付 $5 注册开发者（需你的账号 + 支付方式）。
2. 「New item」→ 上传同一个 zip。
3. 填表：名称、Summary（≤132 字符）、Description、类别 Productivity、语言。
4. Store listing：图标 128、截图 1280×800、Small promo tile 440×280（可选）。
5. Privacy practices 标签页：
   - Single purpose：`Blocks ads and trackers on web pages, without collecting any user data.`
   - 权限理由：逐条粘贴 `listing.md` 第 4 节。
   - 数据使用：勾选「不收集用户数据」，并声明不使用远程代码。
   - 隐私政策 URL：上面的 Pages 地址。
6. 提交审核，通常 1–3 天；首个版本审核可能更久。

## 需要注意

- Chrome 的 $5 只能由你的 Google 账号支付，我无法代付。
- 两个商店都会读 zip 里的 `manifest.json` 版本号；以后升级只改版本号再重打包即可（`npm run pack`）。
- 若审核问「为什么需要 `<all_urls>`」，答案在 `listing.md` 第 4 节：广告域名出现在任意站点，DNR 只匹配 URL，不读页面内容。
