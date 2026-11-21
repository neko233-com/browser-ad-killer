# Browser Ad Killer · 浏览器广告杀手

[English](README.md) | [中文](README-CN.md)

> A lightweight Manifest V3 ad-blocking extension for **Edge / Chrome**: network-layer blocking via Declarative Net Request + sponsored-result cleanup on search pages. Settings export/import lets you carry the same configuration to other Chromium browsers (Quark, QQ Browser, etc.).

Zero build, zero dependency, vanilla JS — load the folder and go.

## Features

- **Network-layer blocking**: bundled high-confidence ad/tracker domains as a static DNR ruleset; with AdGuard Base / AdGuard Chinese / EasyList China / anti-AD enabled you get roughly **127k unique blocked domains**; custom rules and per-site whitelist pausing included.
- **Cosmetic filtering**: parses subscription `##` hiding rules into per-domain shards persisted in storage, injects CSS at page load — about **68k selectors across 32k sites**, effective before any request finishes.
- **Search-page cleanup**: hides paid sponsored results on **Google / Baidu / Bing / Sogou / 360 (so.com)** without touching organic results; Baidu home + right-hand “hot search” panel is cleaned by default.
- **No collateral damage**: path rules such as `||baidu.com/adver?` are never degraded into whole-site blocks, and major portals plus their CDNs are on a protection list.
- **Auto-update**: subscriptions refresh every 12h inside the browser; version check every 6h; a scheduled task can update the extension body unattended.
- **Cross-browser sync**: export a JSON config in one browser, import it in another — toggles, subscriptions, custom rules and whitelist move together.
- **Lightweight**: MV3 Declarative Net Request blocks requests without waking the service worker; cosmetic CSS is sharded so pages stay responsive.

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

## Auto-update & mirrors

- **In-extension check**: the background checks the GitHub remote version every 6 h through a mirror chain; the popup shows a notice only when a newer version exists (no noise when up-to-date).
- **CLI update**: `update.ps1` (Windows) / `update.sh` (Unix) fetch the repo through the chain `GitHub direct → jsDelivr → ghproxy → ghfast`; they refresh the install dir only when the remote version is higher; up-to-date = no-op; if every mirror fails it just warns without touching the current install.
- **Unattended (Windows)**: register a scheduled task once and it runs `update.ps1 -Quiet` daily; the next browser launch picks up the new files automatically (an unpacked extension re-reads its install dir on every start).

```powershell
# register a daily 12:00 silent update task (idempotent, reruns overwrite the same task)
.\install.ps1 -ScheduleUpdate
# inspect / remove
schtasks /query /tn "Browser Ad Killer Update"
schtasks /delete /tn "Browser Ad Killer Update" /f
```

- **Subscription refresh**: filter lists auto-update every 12 h; presets also carry mirror fallback. While fetching, the worker keeps itself alive with periodic API calls so MV3 does not kill it mid-download.
- **Idempotent**: `install` / `update` are safe to rerun — no errors, no duplicate popups, no temp leftovers.

## Usage

| Place | What it does |
| --- | --- |
| Toolbar popup | Master switch, pause current site, network/search toggles, matched-rule count, export config |
| Options → Master | Global on/off, network DNR, search cleanup |
| Options → Per-engine | Toggle Google / Baidu / Bing / Sogou / 360 individually; Baidu home + right-side hot-list cleanup (on by default) |
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
| AdGuard Base | Global base list incl. element hiding (on) | filters.adtidy.org / ghproxy / GitHub raw |
| AdGuard Chinese | Chinese ads incl. element hiding (on) | filters.adtidy.org / ghproxy / GitHub raw |
| EasyList China | Chinese ads (on) | easylist-downloads.adblockplus.org / jsDelivr |
| anti-AD domain list | Highest-hit Chinese domains (on) | anti-ad.net / jsDelivr / GitHub |
| URLhaus malicious domains | Malware distribution domains (on, Browsing-Security equivalent) | malware-filter.gitlab.io / jsDelivr |
| Phishing domains | Phishing sites (on, Browsing-Security equivalent) | malware-filter.gitlab.io / jsDelivr |
| EasyPrivacy | Tracking/privacy (off) | easylist-downloads.adblockplus.org |
| CJX's Annoyance | Self-promotion/annoyances (off) | GitHub / jsDelivr |

> Parsed: `||domain^` domain rules (path/regex/`$` rules are dropped rather than widened into whole-site blocks), plain domain lists, and `##` / `#@#` element-hiding selectors. `$`-modifier, `#?#` extended and scriptlet rules are skipped.

## Development

```powershell
node tools\verify.mjs       # full verification (manifest/ruleset schema/refs/syntax/unit tests, 40 checks)
node tools\validate.mjs     # JSON + JS syntax check
node tools\test-parser.mjs  # filter parser unit tests (10 cases)
node tools\gen-builtin.mjs  # regenerate builtin ruleset
node tools\pack.mjs         # pack dist\browser-ad-killer-vX.Y.Z.zip
```

## Roadmap

- [x] Cosmetic layer: parse `##` element-hiding rules, inject CSS from content scripts (uBlock-style element hiding)
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

## Compared to AdGuard

| Capability | Here | Notes |
| --- | --- | --- |
| Web ad/tracker blocking | ✅ | Dynamic DNR, ~127k unique domains after dedupe |
| Element hiding (banners, ad slots, hot lists) | ✅ | Subscription `##` rules, ~68k selectors across 32k sites |
| Search-page sponsor cleanup | ✅ | Five engines + Baidu hot list; AdGuard needs extra rules |
| Malware/phishing protection | ✅ | URLhaus + Phishing lists, ~19k malicious/phishing domains |
| Tracking-parameter stripping | ✅ | Removes 26 pure-tracking params (utm_* / fbclid / gclid / msclkid…) on navigation |
| Anti-adblock overlay defusing | ✅ | Only fires when the “adblock detected” wording matches; also restores locked scrolling |
| Whole-site blocklist | ✅ | Blocks the main document too; usable as a lightweight parental control |
| System-wide DNS filtering | ❌ | Extensions cannot own system DNS; set your OS/router DNS to AdGuard DNS instead |
| HTTPS content filtering (MITM) | ❌ | Disallowed by MV3 for any extension |
| Page-level scriptlets | ❌ | MV3 forbids remote code; only static CSS / scheduled DOM cleanup |
| Parental control / Stealth mode | ⚠️ Partial | Parental control approximated by the blocklist; most Stealth items are impossible under MV3 |
| Non-browser traffic (app splash ads) | ❌ | Needs AdGuard desktop or a system-level solution |
| Auto-update of rules | ✅ | Subscriptions every 12 h + scheduled task for the extension body |

> Bottom line: for **in-browser browsing this fully replaces AdGuard Pro**, including element hiding which is AdGuard's core engine. System-level DNS and cross-app blocking still need AdGuard DNS or the desktop app.

## Limitations

- Search-page DOM changes over time; selectors fall back to text-label detection; report misses for custom rules.
- Pre-roll video ads, mobile splash ads and other non-web ads are out of scope.
- No telemetry; subscription fetch happens in-browser and depends on network reachability.

## License

MIT (see repository). Personal/educational use; not affiliated with any browser or filter-list project.
