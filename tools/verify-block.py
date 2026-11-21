#!/usr/bin/env python3
"""端到端验证网络层拦截：在页面上下文发起请求，看广告域名是否真的被 DNR 阻断。
用法: python tools/verify-block.py <port>
"""
import json, sys, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450

TARGETS = [
    # 预期被拦截（广告/统计域名）
    "https://hm.baidu.com/hm.js",
    "https://cpro.baidustatic.com/cpro/ui/c.js",
    "https://pos.baidu.com/ecom",
    "https://www.googletagmanager.com/gtag/js",
    # 预期正常（网站自身资源）
    "https://www.baidu.com/favicon.ico",
    "https://ss1.bdstatic.com/5eN1bjq8AAUYm2zgoY3K/r/www/cache/static/protocol/https/home/img/icon_baidu.png",
]


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and t.get("url", "").startswith("https://"))
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=60)
i = 0


def ev(expr):
    global i
    i += 1
    ws.send(json.dumps({"id": i, "method": "Runtime.evaluate",
                        "params": {"expression": expr, "returnByValue": True, "awaitPromise": True}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == i:
            r = m.get("result", {})
            if "exceptionDetails" in r:
                return {"__exception": str(r["exceptionDetails"])[:300]}
            return r.get("result", {}).get("value")


print("页面:", ev("location.href"))
for u in TARGETS:
    r = ev("""
    (async () => {
      const c = new AbortController();
      const t = setTimeout(() => c.abort(), 8000);
      try {
        const r = await fetch(%s, { signal: c.signal, cache: 'no-store' });
        clearTimeout(t);
        return { ok: r.ok, status: r.status, type: r.type };
      } catch (e) {
        clearTimeout(t);
        return { blocked: true, reason: String(e && e.message || e) };
      }
    })()
    """ % json.dumps(u))
    print(f"{u}\n   {r}")
