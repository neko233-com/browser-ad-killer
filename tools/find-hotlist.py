#!/usr/bin/env python3
"""定位百度结果页右侧“百度热搜”容器：打印含该文字的节点及其祖先链、class/id。
用法: python tools/find-hotlist.py <port>
"""
import json, sys, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


page = next(t for t in http_json("/json/list")
            if t.get("type") == "page" and "baidu.com" in t.get("url", ""))
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


print(ev("""
(() => {
  const hits = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const t = (walker.currentNode.textContent || '').trim();
    if (!t || t.length > 20) continue;
    if (!/百度热搜|换一换/.test(t)) continue;
    let el = walker.currentNode.parentElement;
    const chain = [];
    for (let k = 0; k < 6 && el; k++) {
      chain.push({ tag: el.tagName.toLowerCase(), id: el.id || null,
                   cls: (el.className && typeof el.className === 'string') ? el.className.slice(0, 80) : null });
      el = el.parentElement;
    }
    hits.push({ text: t, chain });
  }
  return hits.slice(0, 14);
})()
"""))

print("=== 右侧栏子块清单 ===")
print(ev("""
(() => {
  const r = document.querySelector('#content_right') || document.querySelector('[class*="content_right"]') || document.querySelector('div#content_right');
  if (!r) {
    // 退而求其次：找视口右侧 1/3 区域里的直接块
    const all = [...document.querySelectorAll('div')].filter(el => {
      const b = el.getBoundingClientRect();
      return b.left > innerWidth * 0.62 && b.width > 150 && b.width < 420 && b.height > 40;
    }).slice(0, 40);
    return all.map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || null,
      cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
      w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height),
      text: (el.textContent || '').replace(/\\s+/g, ' ').slice(0, 40) }));
  }
  return [...r.children].map(el => ({ tag: el.tagName.toLowerCase(), id: el.id || null,
    cls: (typeof el.className === 'string' ? el.className : '').slice(0, 70),
    h: Math.round(el.getBoundingClientRect().height),
    text: (el.textContent || '').replace(/\\s+/g, ' ').slice(0, 40) }));
})()
"""))
