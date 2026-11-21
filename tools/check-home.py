#!/usr/bin/env python3
"""检查百度首页热搜是否被隐藏，并统计仍可见的热搜条目；顺带截图。
用法: python tools/check-home.py <port> <url> <out.png>
"""
import base64, json, sys, time, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450
URL = sys.argv[2] if len(sys.argv) > 2 else "https://www.baidu.com/"
OUT = sys.argv[3] if len(sys.argv) > 3 else "dist/page.png"


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and t.get("url", "").startswith("http"))
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=60)
i = 0


def send(method, params=None):
    global i
    i += 1
    ws.settimeout(40)
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if "method" in m:
            continue
        if m.get("id") == i:
            return m.get("result", {})


def ev(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in r:
        return {"__exception": str(r["exceptionDetails"])[:300]}
    return r.get("result", {}).get("value")


send("Page.enable", {})
send("Page.navigate", {"url": URL})
time.sleep(6)

print("页面:", ev("location.href"))
print(ev("""
(() => {
  const out = {};
  const vis = (sel) => {
    const els = [...document.querySelectorAll(sel)];
    if (!els.length) return 'missing';
    const shown = els.filter(e => {
      const b = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return b.width > 40 && b.height > 10 && cs.display !== 'none' && cs.visibility !== 'hidden';
    });
    return { total: els.length, visible: shown.length };
  };
  ['#s-hotsearch-wrapper', '.s-hotsearch-wrapper', '#hotsearch',
   '[class*="hotsearch-list"]', '.FYB_RD', '[class*="FYB_RD"]', '#content_right'].forEach(s => {
    out[s] = vis(s);
  });
  // 热搜条目：指向 /s?wd= 且位于右侧的链接
  const hot = [...document.querySelectorAll('a[href]')].filter(a => {
    const b = a.getBoundingClientRect();
    const cs = getComputedStyle(a);
    return b.width > 80 && b.height > 12 && cs.display !== 'none' && b.left > innerWidth * 0.6;
  });
  out['右侧可见链接数'] = hot.length;
  out['可见热搜标题样本'] = hot.slice(0, 6).map(a => a.textContent.trim().slice(0, 24));
  return out;
})()
"""))
shot = send("Page.captureScreenshot", {"format": "png"})
if shot.get("data"):
    with open(OUT, "wb") as f:
        f.write(base64.b64decode(shot["data"]))
    print("截图:", OUT)
