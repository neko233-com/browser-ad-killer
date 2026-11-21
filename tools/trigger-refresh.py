#!/usr/bin/env python3
"""在扩展 options 页触发订阅刷新，并打印每个源的结果 + 索引规模。
用法: python tools/trigger-refresh.py <port>
"""
import json, sys, time, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


class Cdp:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=90)
        self.i = 0

    def send(self, method, params=None):
        self.i += 1
        self.ws.send(json.dumps({"id": self.i, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.i:
                return msg.get("result", {})

    def ev(self, expr, await_promise=True):
        r = self.send("Runtime.evaluate", {
            "expression": expr, "returnByValue": True, "awaitPromise": await_promise
        })
        if "exceptionDetails" in r:
            return {"__error": str(r["exceptionDetails"])[:400]}
        return r.get("result", {}).get("value")


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and "options.html" in t.get("url", ""))
cdp = Cdp(page["webSocketDebuggerUrl"])

print("=== 触发 REFRESH_SUBSCRIPTIONS ===")
t0 = time.time()
res = cdp.ev("chrome.runtime.sendMessage({type:'REFRESH_SUBSCRIPTIONS'})")
print(f"耗时 {time.time() - t0:.1f}s")
print(json.dumps(res, ensure_ascii=False, indent=1)[:3000])

print("=== 刷新后索引 ===")
print(cdp.ev("""
  new Promise(r => chrome.storage.local.get(['bak_netset_v1','bak_cosmetic_meta_v1','bak_cosmetic_global_v1'], (res) => {
    r({ netDomains: (res['bak_netset_v1'] || {}).domains ? res['bak_netset_v1'].domains.length : 0,
        meta: res['bak_cosmetic_meta_v1'] || null,
        globalSelectors: (res['bak_cosmetic_global_v1'] || []).length });
  }))
"""))

print("=== 动态规则 ===")
print(cdp.ev("new Promise(r => chrome.declarativeNetRequest.getDynamicRules().then(rules => r({count: rules.length})))"))

print("=== storage 占用 ===")
print(cdp.ev("new Promise(r => chrome.storage.local.getBytesInUse(null).then(r))"))
