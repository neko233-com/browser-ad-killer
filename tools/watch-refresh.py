#!/usr/bin/env python3
"""异步触发订阅刷新（不等待返回值），并每 15 秒轮询一次索引规模。
用法: python tools/watch-refresh.py <port> [max_seconds]
"""
import json, sys, time, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450
MAX = int(sys.argv[2]) if len(sys.argv) > 2 else 300

PROBE = """
new Promise(r => chrome.storage.local.get(['bak_netset_v1','bak_cosmetic_meta_v1','bak_refresh_state_v1'], res => r({
  net: (res['bak_netset_v1'] || {}).domains ? res['bak_netset_v1'].domains.length : 0,
  meta: res['bak_cosmetic_meta_v1'] || null,
  state: res['bak_refresh_state_v1'] || null
})))
"""


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and "options.html" in t.get("url", ""))
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=30)
i = 0


def ev(expr, await_promise=True):
    global i
    i += 1
    ws.send(json.dumps({"id": i, "method": "Runtime.evaluate",
                        "params": {"expression": expr, "returnByValue": True, "awaitPromise": await_promise}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == i:
            r = m.get("result", {})
            if "exceptionDetails" in r:
                return {"__error": str(r["exceptionDetails"])[:300]}
            return r.get("result", {}).get("value")


print("触发刷新（不等待）...")
print(ev("chrome.runtime.sendMessage({type:'REFRESH_SUBSCRIPTIONS'}); 'sent'", await_promise=False))

t0 = time.time()
last = None
while time.time() - t0 < MAX:
    time.sleep(15)
    st = ev(PROBE)
    sign = (st.get("net"), (st.get("meta") or {}).get("updatedAt"), (st.get("state") or {}).get("step"))
    print(f"[{int(time.time()-t0):3d}s] net={st.get('net')} meta={json.dumps(st.get('meta'), ensure_ascii=False)} state={json.dumps(st.get('state'), ensure_ascii=False)[:260]}")
    if st.get("net") and st.get("net") > 0:
        print("索引已写入，出现规则")
        break
    last = st
