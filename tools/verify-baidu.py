#!/usr/bin/env python3
"""百度实测：导航到搜索结果页，统计被 DNR 拦截的请求、检查样式注入与右侧广告栏可见性，并截图。
用法: python tools/verify-baidu.py <port> [关键词] [输出png]
"""
import base64, json, sys, time, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450
KW = sys.argv[2] if len(sys.argv) > 2 else "test"
OUT = sys.argv[3] if len(sys.argv) > 3 else "dist/baidu-search.png"
URL = "https://www.baidu.com/s?wd=" + urllib.parse.quote(KW)


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and t.get("url", "").startswith("https://"))
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=60)
ws.settimeout(1.0)
i = 0
pending = []


def send(method, params=None):
    global i
    i += 1
    ws.settimeout(40)
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if "method" in m:
            pending.append(m)
            continue
        if m.get("id") == i:
            ws.settimeout(1.0)
            return m.get("result", {})


def drain(seconds):
    t0 = time.time()
    while time.time() - t0 < seconds:
        try:
            pending.append(json.loads(ws.recv()))
        except Exception:
            pass


def ev(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in r:
        return {"__exception": str(r["exceptionDetails"])[:300]}
    return r.get("result", {}).get("value")


send("Network.enable", {})
send("Page.enable", {})
pending.clear()
send("Page.navigate", {"url": URL})
drain(12)

failed = []
for m in pending:
    if m.get("method") == "Network.loadingFailed":
        p = m["params"]
        failed.append((p.get("errorText"), p.get("blockedReason")))

# 关联 requestId → url
reqmap = {}
for m in pending:
    if m.get("method") == "Network.requestWillBeSent":
        p = m["params"]
        reqmap[p["requestId"]] = p["request"]["url"]

blocked_urls = []
for m in pending:
    if m.get("method") == "Network.loadingFailed":
        p = m["params"]
        u = reqmap.get(p.get("requestId"), "?")
        if "ERR_BLOCKED_BY_CLIENT" in (p.get("errorText") or ""):
            blocked_urls.append(u)

print("=== 页面 ===", ev("location.href"))
print("=== 被 DNR 拦下的请求数 ===", len(blocked_urls))
for u in blocked_urls[:12]:
    print("   BLOCKED", u[:110])
others = [f for f in failed if "ERR_BLOCKED_BY_CLIENT" not in (f[0] or "")]
print("=== 其它失败（非拦截） ===", len(others), others[:5])

print("=== 样式注入 ===", ev("""
(() => {
  const s = document.getElementById('bak-cosmetic-style');
  const visible = [...document.querySelectorAll('body *')].filter(el => {
    const r = el.getBoundingClientRect();
    return r.width > 60 && r.height > 20 && r.top < 3000;
  }).length;
  return { style: !!s, cssChars: s ? s.textContent.length : 0, visibleBlocks: visible };
})()
"""))

print("=== 右侧栏 / 热搜 ===", ev("""
(() => {
  const out = {};
  const probe = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return 'missing';
    const cs = getComputedStyle(el);
    return { display: cs.display, visibility: cs.visibility, opacity: cs.opacity,
             w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) };
  };
  out['#content_right'] = probe('#content_right');
  out['#s-hotsearch-wrapper'] = probe('#s-hotsearch-wrapper');
  out['.c-container 数量'] = document.querySelectorAll('.c-container').length;
  const adMarked = [...document.querySelectorAll('.c-container')].filter(c => {
    const t = (c.textContent || '').slice(0, 60);
    return /广告|推广|赞助|\\bAd\\b/.test(t);
  }).length;
  out['带广告标记的结果'] = adMarked;
  return out;
})()
"""))

shot = send("Page.captureScreenshot", {"format": "png"})
if shot.get("data"):
    with open(OUT, "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    print("=== 截图 ===", OUT)
