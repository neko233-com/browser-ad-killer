#!/usr/bin/env python3
"""打开 chrome://extensions 并截图，用于查看扩展加载错误。"""
import json, sys, time, base64, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9333
OUT = sys.argv[2] if len(sys.argv) > 2 else "ext-diag.png"


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=5) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list") if t.get("type") == "page")
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=20)
mid = 0


def send(method, params=None):
    global mid
    mid += 1
    ws.send(json.dumps({"id": mid, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if m.get("id") == mid:
            return m.get("result", {})


send("Page.enable")
send("Page.navigate", {"url": "edge://extensions"})
time.sleep(5)
send("Runtime.enable")
txt = send("Runtime.evaluate", {"expression": "document.body.innerText", "returnByValue": True})
print("=== BODY TEXT ===")
print(txt.get("result", {}).get("value", "")[:6000])
res = send("Page.captureScreenshot", {"format": "png"})
data = base64.b64decode(res["data"])
open(OUT, "wb").write(data)
print("saved", OUT, len(data))
