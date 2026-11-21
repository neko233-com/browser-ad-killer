#!/usr/bin/env python3
"""验证三项新能力：跟踪参数剥离、整站黑名单、反广告拦截遮罩。
用法: python tools/verify-pro.py <port>
"""
import json, sys, time, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and "options.html" in t.get("url", ""))
ws = websocket.create_connection(page["webSocketDebuggerUrl"], suppress_origin=True, timeout=60)
ws.settimeout(2.0)
i = 0
events = []


def send(method, params=None):
    global i
    i += 1
    ws.settimeout(40)
    ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
    while True:
        m = json.loads(ws.recv())
        if "method" in m:
            events.append(m)
            continue
        if m.get("id") == i:
            ws.settimeout(2.0)
            return m.get("result", {})


def ev(expr, wait=True):
    r = send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": wait})
    if "exceptionDetails" in r:
        return {"__err": str(r["exceptionDetails"])[:160]}
    return r.get("result", {}).get("value")


send("Page.enable", {})
send("Network.enable", {})

# ---------- 1. 跟踪参数剥离 ----------
print("=== 1. 跟踪参数剥离 ===")
ev("new Promise(r=>chrome.runtime.sendMessage({type:'UPDATE_SETTINGS',patch:{stripTracking:true}},r))")
time.sleep(1)
DIRTY = ("https://www.baidu.com/s?wd=test&utm_source=newsletter&utm_medium=email"
         "&utm_campaign=spring&fbclid=IwAR123&gclid=abc&normal=keep")
events.clear()
send("Page.navigate", {"url": DIRTY})
time.sleep(5)
print("导航后地址:", ev("location.href"))
print("  utm 是否残留:", "utm_source" in (ev("location.href") or ""))
print("  正常参数是否保留:", "normal=keep" in (ev("location.href") or ""))

# ---------- 2. 整站黑名单 ----------
print("=== 2. 整站黑名单 ===")
ev("new Promise(r=>chrome.runtime.sendMessage({type:'SET_BLACKLIST',domain:'httpbin.org',blocked:true},r))")
time.sleep(1)
events.clear()
send("Page.navigate", {"url": "https://httpbin.org/get"})
time.sleep(5)
cur = ev("location.href") or ""
blocked_req = [e["params"].get("errorText") for e in events
               if e.get("method") == "Network.loadingFailed"]
print("导航结果地址:", cur)
print("  主文档被拦:", cur.startswith("chrome-error"), "| 失败码:", blocked_req[:3])
ev("new Promise(r=>chrome.runtime.sendMessage({type:'SET_BLACKLIST',domain:'httpbin.org',blocked:false},r))")
time.sleep(1)
print("  已撤销黑名单测试项")

print("=== 3. 反广告拦截遮罩 ===")
print(ev("""
(() => {
  // 直接在同页构造一份遮罩，验证 defuser 的文案匹配与移除逻辑
  const box = document.createElement('div');
  box.id = 'fake-adblock';
  box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.8);width:100vw;height:100vh';
  box.innerHTML = '<div style="color:#fff;padding:40px;font-size:20px">检测到广告拦截插件，请关闭 AdBlocker 后访问本站</div>';
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  return 'mock overlay injected';
})()
"""))
time.sleep(2.5)
print("  遮罩是否被清除:", ev("""
(() => {
  const el = document.getElementById('fake-adblock');
  return el ? { removed: el.getAttribute('data-bak-defused') === '1' || getComputedStyle(el).display === 'none',
                display: getComputedStyle(el).display } : { removed: true, note: 'element gone' };
})()
"""))
print("  body 滚动是否恢复:", ev("getComputedStyle(document.body).overflow"))
