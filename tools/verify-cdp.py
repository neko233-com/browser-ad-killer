#!/usr/bin/env python3
"""CDP 实测脚本：通过 --remote-debugging-port 驱动本机 Edge，
统计百度首页热搜可见条目数、结果页推广卡片数，并截图留证。
用法: python tools/verify-cdp.py <debug_port> <with|without> <label>
只读统计 + 截图，不改动页面。
"""
import json, sys, time, base64, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9444
MODE = sys.argv[2] if len(sys.argv) > 2 else "with"
LABEL = sys.argv[3] if len(sys.argv) > 3 else MODE

QUERIES = [
    "%E5%BE%8B%E5%B8%88%E5%92%A8%E8%AF%A2",                    # 律师咨询
    "%E8%A3%85%E4%BF%AE%E5%85%AC%E5%8F%B8",                    # 装修公司
    "%E8%B4%B7%E6%AC%BE10%E4%B8%87",                          # 贷款10万
    "%E5%8A%A0%E7%9B%9F%E4%BB%80%E4%B9%88%E5%BA%97%E5%A5%BD",  # 加盟什么店好
    "%E7%94%B2%E4%BA%A2%E6%B2%BB%E7%96%97",                    # 甲亢治疗
]


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=5) as r:
        return json.loads(r.read().decode("utf-8"))


class Cdp:
    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=20)
        self.i = 0

    def send(self, method, params=None):
        self.i += 1
        self.ws.send(json.dumps({"id": self.i, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.i:
                return msg.get("result", {})

    def eval(self, expr, await_promise=False):
        res = self.send("Runtime.evaluate", {
            "expression": expr, "returnByValue": True, "awaitPromise": await_promise
        })
        if "exceptionDetails" in res:
            return {"error": res["exceptionDetails"]}
        return res.get("result", {}).get("value")

    def navigate(self, url, settle=5):
        self.send("Page.enable")
        self.send("Page.navigate", {"url": url})
        time.sleep(settle)

    def shot(self, path):
        res = self.send("Page.captureScreenshot", {"format": "png"})
        open(path, "wb").write(base64.b64decode(res["data"]))


def find_page():
    for t in http_json("/json/list"):
        if t.get("type") == "page" and "baidu.com" in t.get("url", ""):
            return t
    for t in http_json("/json/list"):
        if t.get("type") == "page":
            return t
    raise SystemExit("未找到 page 目标")


HOME_JS = r"""
(() => {
  const w = document.querySelector('#s-hotsearch-wrapper, .s-hotsearch-wrapper');
  if (!w) return {found: false};
  const cs = getComputedStyle(w);
  const items = [...document.querySelectorAll('#hotsearch-content-wrapper li, .s-hotsearch-content li')];
  const visible = items.filter(li => li.offsetParent !== null).length;
  return {found: true, display: cs.display, visibility: cs.visibility,
          itemCount: items.length, visibleItems: visible};
})()
"""

SEARCH_JS = r"""
(() => {
  const badgeRe = /^(广告|赞助|推广|Sponsored(\s*results)?|Promoted)(\s*[·•\-].*)?$/i;
  const cards = [...document.querySelectorAll('#content_left > div.c-container')];
  const badgeCards = cards.filter(c => [...c.querySelectorAll('span,div,a,b,em,i')].some(e => {
    const t = (e.textContent || '').trim();
    return t.length <= 14 && badgeRe.test(t);
  }));
  const textAd = cards.filter(c => /广告|推广|赞助/.test(c.textContent || ''));
  const known = ['#con-ad', '#pm-ad'].map(s => document.querySelector(s))
    .filter(Boolean).map(el => ({sel: el.className || el.tagName, hidden: el.offsetParent === null}));
  return {
    query: decodeURIComponent((location.href.match(/wd=([^&]+)/) || [])[1] || ''),
    totalCards: cards.length,
    visibleCards: cards.filter(c => c.offsetParent !== null).length,
    badgeCards: badgeCards.length,
    badgeVisible: badgeCards.filter(c => c.offsetParent !== null).length,
    textAdCards: textAd.length,
    knownAdSlots: known
  };
})()
"""


def main():
    page = find_page()
    cdp = Cdp(page["webSocketDebuggerUrl"])
    print(f"=== mode={MODE} label={LABEL} page={page['url']}")

    cdp.navigate("https://www.baidu.com", settle=5)
    print("HOME:", json.dumps(cdp.eval(HOME_JS), ensure_ascii=False))
    cdp.shot(f"home-{LABEL}.png")

    for idx, wd in enumerate(QUERIES):
        cdp.navigate(f"https://www.baidu.com/s?wd={wd}", settle=6)
        print("SEARCH:", json.dumps(cdp.eval(SEARCH_JS), ensure_ascii=False))
        cdp.shot(f"q{idx}-{LABEL}.png")


if __name__ == "__main__":
    main()
