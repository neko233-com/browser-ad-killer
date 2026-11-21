#!/usr/bin/env python3
"""在扩展 service worker 里直接测网络：验证订阅 URL 在浏览器环境中的可达性与耗时。
用法: python tools/probe-sw-fetch.py <port>
"""
import json, sys, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450

URLS = [
    'https://filters.adtidy.org/extension/ublock/filters/2.txt',
    'https://filters.adtidy.org/extension/ublock/filters/224.txt',
    'https://easylist-downloads.adblockplus.org/easylistchina.txt',
    'https://anti-ad.net/domains.txt',
    'https://ghproxy.net/https://raw.githubusercontent.com/AdguardTeam/AdguardFilters/master/BaseFilter/sections/adservers.txt',
]


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


sw = next((t for t in http_json("/json/list") if t.get("type") == "service_worker" and "service-worker" in t.get("url", "")), None)
if not sw:
    print("no service worker target")
    raise SystemExit(1)

ws = websocket.create_connection(sw["webSocketDebuggerUrl"], suppress_origin=True, timeout=90)
i = 0


def send(method, params=None):
    global i
    i += 1
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == i:
            return m.get("result", {})


def ev(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in r:
        return {"__error": str(r["exceptionDetails"])[:300]}
    return r.get("result", {}).get("value")


for u in URLS:
    print(u)
    print("  ", ev(f"""
      (async () => {{
        const t0 = performance.now();
        try {{
          const r = await fetch({json.dumps(u)}, {{ cache: 'no-store', signal: AbortSignal.timeout(25000) }});
          const txt = await r.text();
          return {{ ok: r.ok, status: r.status, bytes: txt.length, ms: Math.round(performance.now() - t0) }};
        }} catch (e) {{ return {{ error: String(e && e.message || e), ms: Math.round(performance.now() - t0) }}; }}
      }})()
    """))
