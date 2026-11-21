#!/usr/bin/env python3
"""用 CDP 抓商店截图：加载本机已安装的扩展，按 1280x800 视口截图，页面本身即证据。
用法: python tools/store-shots.py
输出: store/shot-*.png（1280x800 或原始视口），随后由 tools/store-assets.mjs 统一合成
"""
import base64
import json
import os
import subprocess
import time
import urllib.parse
import urllib.request
import shutil
import sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
EXT = os.path.join(os.environ["LOCALAPPDATA"], "browser-ad-killer", "extension")
PROFILE = os.path.join(ROOT, "dist", "_profile")
PORT = 9445
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
OUT = os.path.join(ROOT, "store")


def http_json(path, method="GET"):
    req = urllib.request.Request(f"http://127.0.0.1:{PORT}{path}", method=method)
    with urllib.request.urlopen(req, timeout=10) as r:
        body = r.read().decode("utf-8", "ignore")
    try:
        return json.loads(body) if body.strip() else {}
    except json.JSONDecodeError:
        return {"raw": body}


def wait_port(timeout=25):
    end = time.time() + timeout
    while time.time() < end:
        try:
            return http_json("/json/version")
        except Exception:
            time.sleep(0.5)
    raise RuntimeError("Edge 调试端口未就绪")


class Cdp:
    def __init__(self, ws_url):
        import websocket
        self.ws = websocket.create_connection(ws_url, suppress_origin=True, timeout=30)
        self.i = 0

    def send(self, method, params=None):
        self.i += 1
        self.ws.send(json.dumps({"id": self.i, "method": method, "params": params or {}}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.i:
                if "error" in msg:
                    raise RuntimeError(f"{method}: {msg['error']}")
                return msg.get("result", {})

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass


def open_tab(url, width, height, wait=1.0):
    tgt = http_json("/json/new?" + urllib.parse.quote(url, safe=":/?=&%"), method="PUT")
    ws = tgt["webSocketDebuggerUrl"]
    c = Cdp(ws)
    c.send("Page.enable")
    c.send("Emulation.setDeviceMetricsOverride", {
        "width": width, "height": height, "deviceScaleFactor": 1, "mobile": False
    })
    c.send("Page.navigate", {"url": url})
    time.sleep(wait)
    return c, tgt["id"]


def shot(c, path):
    res = c.send("Page.captureScreenshot", {"format": "png", "captureBeyondViewport": False})
    data = base64.b64decode(res["data"])
    with open(path, "wb") as f:
        f.write(data)
    print("saved", path, len(data))


def main():
    if not os.path.isdir(EXT):
        sys.exit(f"扩展目录不存在: {EXT}")
    shutil.rmtree(PROFILE, ignore_errors=True)
    os.makedirs(OUT, exist_ok=True)

    proc = subprocess.Popen([
        EDGE,
        f"--remote-debugging-port={PORT}",
        f"--user-data-dir={PROFILE}",
        f"--load-extension={EXT}",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=msEdgeSidebarV2,DisableLoadExtensionCommandLineSwitch",
        "--window-size=1280,800",
        "about:blank",
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        wait_port()
        time.sleep(20)  # 等扩展 service worker 起来并拉规则

        # 找扩展 id（service worker 的 URL）
        targets = http_json("/json/list")
        ext_id = None
        for t in targets:
            u = t.get("url", "")
            if u.startswith("chrome-extension://"):
                ext_id = u.split("/")[2]
                break
        print("extension id:", ext_id)

        def baidu(q):
            return "https://www.baidu.com/s?wd=" + urllib.parse.quote(q)

        shots = [
            (("shot-baidu-earphone.png", baidu("耳机"), 12.0)),
            ("shot-baidu-zhuangxiu.png", baidu("装修公司"), 6.0),
        ]
        for name, url, wait in shots:
            c, tid = open_tab(url, 1280, 800, wait)
            time.sleep(1.5)
            shot(c, os.path.join(OUT, name))
            c.close()
            http_json(f"/json/close/{tid}")

        c, tid = open_tab("https://www.baidu.com/", 1280, 800, 6)
        time.sleep(1.0)
        shot(c, os.path.join(OUT, "shot-baidu-home.png"))
        c.close()
        http_json(f"/json/close/{tid}")

        if ext_id:
            popup = f"chrome-extension://{ext_id}/src/popup/popup.html"
            c, tid = open_tab(popup, 420, 560, 2)
            time.sleep(1.0)
            shot(c, os.path.join(OUT, "shot-popup.png"))
            c.close()
            http_json(f"/json/close/{tid}")
    finally:
        try:
            subprocess.call(["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        except Exception:
            proc.terminate()


if __name__ == "__main__":
    main()


