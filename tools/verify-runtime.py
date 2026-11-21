#!/usr/bin/env python3
"""运行时验证：检查扩展是否真的建好索引、注入了隐藏规则、拦截了网络请求。
用法: python tools/verify-runtime.py <port> [--wait seconds]
"""
import json, sys, time, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450
WAIT = int(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[2] == '--wait' else 0


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


class Cdp:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=40)
        self.i = 0

    def send(self, method, params=None):
        self.i += 1
        self.ws.send(json.dumps({"id": self.i, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.i:
                return msg.get("result", {})

    def ev(self, expr):
        r = self.send("Runtime.evaluate", {"expression": expr, "returnByValue": True, "awaitPromise": True})
        if "exceptionDetails" in r:
            return {"__error": str(r["exceptionDetails"])[:200]}
        return r.get("result", {}).get("value")

    def nav(self, url, wait=6):
        self.send("Page.enable")
        self.send("Page.navigate", {"url": url})
        time.sleep(wait)


def find(pred):
    for t in http_json("/json/list"):
        if pred(t):
            return t
    return None


def main():
    if WAIT:
        print(f"waiting {WAIT}s for first subscription refresh ...")
        time.sleep(WAIT)

    # 扩展的 options 页可执行 chrome.* API
    ext = find(lambda t: t.get("type") == "page" and "chrome-extension://" in t.get("url", "") and "options" in t.get("url", ""))
    if not ext:
        allt = http_json("/json/list")
        print("targets:", [(t.get("type"), t.get("url", "")[:80]) for t in allt])
        raise SystemExit("未找到扩展 options 页面；请先打开 options 页")

    cdp = Cdp(ext["webSocketDebuggerUrl"])
    print("=== 索引状态 ===")
    print(cdp.ev("""
      new Promise(r => chrome.storage.local.get(['bak_netset_v1','bak_cosmetic_meta_v1','bak_cosmetic_global_v1'], (res) => {
        r({
          netDomains: (res['bak_netset_v1'] || {}).domains ? res['bak_netset_v1'].domains.length : 0,
          meta: res['bak_cosmetic_meta_v1'] || null,
          globalSelectors: (res['bak_cosmetic_global_v1'] || []).length
        });
      }))
    """))

    print("=== DNR 动态规则 ===")
    print(cdp.ev("""
      new Promise(r => chrome.declarativeNetRequest.getDynamicRules().then(rules => r({
        count: rules.length,
        sample: rules.slice(0, 2).map(x => ({ id: x.id, domains: (x.condition.requestDomains || []).length }))
      })))
    """))

    print("=== 启用的规则集 ===")
    print(cdp.ev("new Promise(r => chrome.declarativeNetRequest.getEnabledRulesets().then(r))"))

    # 在真实站点上检查注入
    page = find(lambda t: t.get("type") == "page" and "http" in t.get("url", "") and "chrome-extension" not in t.get("url", ""))
    if page:
        p = Cdp(page["webSocketDebuggerUrl"])
        for url in ["https://www.163.com/", "https://www.csdn.net/"]:
            p.nav(url, 7)
            print(f"=== {url} ===")
            print(p.ev("""
              (() => {
                const st = document.getElementById('bak-cosmetic-style');
                const rules = st ? st.textContent.split('{display:none').length - 1 : 0;
                const chars = st ? st.textContent.length : 0;
                return { stylePresent: !!st, groups: rules, cssChars: chars, host: location.hostname };
              })()
            """))


if __name__ == "__main__":
    main()
