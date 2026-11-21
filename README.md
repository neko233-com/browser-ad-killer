# Browser Ad Killer · 浏览器广告杀手

[English](README.md) | [中文](README-CN.md)

> A lightweight Manifest V3 ad-blocking extension for **Edge / Chrome**: network-layer blocking via Declarative Net Request + sponsored-result cleanup on search pages. Settings export/import lets you carry the same configuration to other Chromium browsers (Quark, QQ Browser, etc.).

Zero build, zero dependency, vanilla JS — load the folder and go.

## Features

- **Network-layer blocking**: bundled high-confidence ad/tracker domains as a static DNR ruleset; subscriptions (EasyList China / anti-AD / EasyPrivacy / CJX) and custom rules compile into dynamic DNR blocks; per-site whitelist pausing.
- **Search-page cleanup**: hides paid sponsored results on **Google / Baidu / Bing / Sogou / 360 (so.com)** without touching organic results.
- **Cross-browser sync**: export a JSON config in one browser, import it in another — toggles, subscriptions, custom rules and whitelist move together.
- **Lightweight**: MV3 Declarative Net Request blocks requests without waking the service worker; content scripts only run on search pages.

## Quick start

### Option A — one-click installer (Windows)

```powershell
# from the project root (pwsh 7 or Windows PowerShell 5.1)
powershell -ExecutionPolicy Bypass -File .\install.ps1
# launch Edge directly with --load-extension (current session only)
.\install.ps1 -Browser Edge -Launch
# copy files only, do not touch browsers
.\install.ps1 -Browser None
```

### Option B — one-click installer (Linux / macOS / WSL / Git Bash)

```bash
./install.sh
./install.sh --launch --browser=chrome
```

### Option C — load unpacked manually

1. Clone or download this repository:
   ```bash
   git clone https://github.com/neko233-com/browser-ad-killer.git
   ```
2. Open `edge://extensions` (or `chrome://extensions`) and enable **Developer mode**.
3. Click **Load unpacked** and select the project root folder (the one containing `manifest.json`).

> Before publishing to a store, re-loading unpacked after a browser update may be needed; rules refresh on their own.

### Per-browser notes

| Browser | How to load |
| --- | --- |
| **Edge / Chrome** | Developer mode → Load unpacked → select folder |
| **Quark (PC)** | Enable "Extension support" in Settings → Quark Lab, open `quark://extensions`, Developer mode → load unpacked folder (do **not** drag `.crx`/`.zip`) |
| **QQ Browser** | `qqbrowser://extensions`, Developer mode; prefer unpacked folder loading if dragging `.crx` fails |
| Other Chromium (Sogou, 360 Speed, …) | Same unpacked flow; older kernels may lack full MV3/DNR support and degrade gracefully |

## Usage

| Place | What it does |
| --- | --- |
| Toolbar popup | Master switch, pause current site, network/search toggles, matched-rule count, export config |
| Options → Master | Global on/off, network DNR, search cleanup |
| Options → Per-engine | Toggle Google / Baidu / Bing / Sogou / 360 individually; Baidu right-side hot-list cleanup (off by default) |
| Options → Subscriptions | Check presets, "Update all now"; auto-refresh every 12 h |
| Options → Custom rules | One per line: `||ads.example.com^` or `0.0.0.0 tracker.com`; `@@||x.com^` = allow exception |
| Options → Whitelist | Pause blocking for a single site |
| Options → Config sync | Export / import JSON across browsers |

## How it works (three layers)

1. **Static ruleset** (`rulesets/builtin.json`): compiled at install, blocks common ad/tracker domains, costs no dynamic quota.
2. **Dynamic rules**: subscription text + custom rules parsed into domains, merged 100 domains per DNR block rule; whitelist emits priority-100 `allowAllRequests`.
3. **Content-script cleanup**: search-page-only; static-selector CSS pre-hide to avoid flash, MutationObserver catches dynamic inserts, text-label fallback (广告 / Sponsored / 推广 …).

## Subscriptions (preset, toggle in Options)

| Preset | Scope | Sources (mirror fallback automatic) |
| --- | --- | --- |
| EasyList China | Chinese ads | easylist-downloads.adblockplus.org / jsDelivr |
| anti-AD domain list | Highest-hit Chinese domains | anti-ad.net / jsDelivr / GitHub |
| EasyPrivacy | Tracking/privacy (off) | easylist-downloads.adblockplus.org |
| CJX's Annoyance | Self-promotion/annoyances (off) | GitHub / jsDelivr |

> v1 parses network-layer domain rules only; element-hiding (`##`), regex and `$`-modifier rules are skipped — see Roadmap.

## Development

```powershell
node tools\validate.mjs      # JSON + JS syntax check
node tools\test-parser.mjs   # filter parser unit tests (10 cases)
node tools\gen-builtin.mjs   # regenerate builtin ruleset
node tools\pack.mjs          # pack dist\browser-ad-killer-vX.Y.Z.zip
```

## Roadmap

- [ ] Cosmetic layer: parse `##` element-hiding rules, inject CSS from content scripts (uBlock-style element hiding)
- [ ] Bundled selector library for common site banners/popups/self-promotion
- [ ] Incremental subscription updates with cached version display
- [ ] Custom element-picker: click on page to generate a rule
- [ ] AI-assisted rule generation from page ad signatures
- [ ] Firefox MV3 adaptation, store publishing (Edge Add-ons / Chrome Web Store)

## References

- [uBlock Origin](https://github.com/gorhill/uBlock) — the all-in-one benchmark
- [AdGuard Extension](https://github.com/AdguardTeam/AdGuardExtension) — MV3 architecture reference
- [abp2dnr](https://www.npmjs.com/package/abp2dnr) — EasyList → DNR conversion
- [AdGuard tsurlfilter](https://github.com/AdguardTeam/tsurlfilter) — filter engine reference
- [anti-AD](https://github.com/privacy-protection-tools/anti-AD) — Chinese domain list
- [EasyList China](https://github.com/easylistchina/easylistchina) — Chinese filter list

## Limitations

- Search-page DOM changes over time; selectors fall back to text-label detection; report misses for custom rules.
- Pre-roll video ads, mobile splash ads and other non-web ads are out of scope.
- No telemetry; subscription fetch happens in-browser and depends on network reachability.

## License

MIT (see repository). Personal/educational use; not affiliated with any browser or filter-list project.
