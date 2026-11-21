#!/usr/bin/env python3
"""极简版：发起请求后把 CDP Network 事件全量打印，用于判定 DNR 是否真的拦截。
用法: python tools/verify-block3.py <port> [url]
"""
import json, sys, time, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450
URL = sys.argv[2] if len(sys.argv) > 2 else "https://hm.baidu.com/hm.js"


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and t.get("url", "").startswith("https://"))
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=60)
ws.settimeout(2.0)
i = 0


def send(method, params=None):
    global i
    i += 1
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if "method" in m:
            continue
        if m.get("id") == i:
            return m.get("result", {})


print(send("Network.enable", {}) is not None and "network on")
send("Runtime.evaluate", {"expression": """
(async () => {
  try { await fetch(%s, { cache: 'no-store', mode: 'no-cors' }); return 'resolved'; }
  catch (e) { return 'rejected:' + String(e && e.message); }
})()
""" % json.dumps(URL), "awaitPromise": True, "returnByValue": True})

t0 = time.time()
while time.time() - t0 < 6:
    try:
        m = json.loads(ws.recv())
    except Exception:
        break
    meth = m.get("method")
    if meth in ("Network.requestWillBeSent", "Network.loadingFailed", "Network.responseReceived", "Network.requestWillBeSentExtraInfo"):
        p = m.get("params", {})
        url = p.get("url") or (p.get("request", {}) or {}).get("url")
        if url and ("baidu" in url or "google" in url or "bdstatic" in url):
            print(meth, "|", url[:90], "|", p.get("errorText"), p.get("blockedReason"))
