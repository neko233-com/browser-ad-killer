#!/usr/bin/env python3
"""端到端验证网络层拦截：通过 CDP Network 事件看 requestBlocked / loadingFailed 的真实错误码。
被 DNR 拦下会得到 net::ERR_BLOCKED_BY_CLIENT，跨域 CORS 则是 net::ERR_FAILED。
用法: python tools/verify-block2.py <port>
"""
import json, sys, time, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450

TARGETS = [
    ("https://hm.baidu.com/hm.js", "被拦"),
    ("https://cpro.baidustatic.com/cpro/ui/c.js", "被拦"),
    ("https://pos.baidu.com/ecom", "被拦"),
    ("https://www.googletagmanager.com/gtag/js", "被拦"),
    ("https://ss1.bdstatic.com/5eN1bjq8AAUYm2zgoY3K/r/www/cache/static/protocol/https/home/img/icon_baidu.png", "放行"),
]


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and t.get("url", "").startswith("https://"))
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=60)
i = 0
events = []


def send(method, params=None):
    global i
    i += 1
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if "method" in m:
            events.append(m)
            continue
        if m.get("id") == i:
            return m.get("result", {})


def ev(expr):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
    if "exceptionDetails" in r:
        return {"__exception": str(r["exceptionDetails"])[:300]}
    return r.get("result", {}).get("value")


send("Network.enable", {"maxTotalBufferSize": 1048576})
print("页面:", ev("location.href"))

for url, expect in TARGETS:
    events.clear()
    ev("""
    (async () => {
      try { await fetch(%s, { cache: 'no-store', mode: 'no-cors' }); return 'resolved'; }
      catch (e) { return 'rejected:' + String(e && e.message); }
    })()
    """ % json.dumps(url))
    time.sleep(0.6)
    # 等待事件
    ws.settimeout(1.0)
    try:
        while True:
            events.append(json.loads(ws.recv()))
    except Exception:
        pass
    ws.settimeout(60)

    fails = [e["params"] for e in events if e.get("method") == "Network.loadingFailed"
             and url.split("//")[1].split("/")[0] in e["params"].get("requestId", "") + json.dumps(e["params"])]
    errs = [e["params"].get("errorText") for e in events
            if e.get("method") == "Network.loadingFailed" and url.split("//")[1].split("/")[0] in json.dumps(e["params"])]
    reqs = [e["params"] for e in events if e.get("method") == "Network.requestWillBeSent"
            and url.split("//")[1].split("/")[0] in json.dumps(e["params"])]
    print(f"{url}  期望={expect}  请求数={len(reqs)}  失败事件={errs}")
