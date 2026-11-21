#!/usr/bin/env python3
"""在扩展 service worker 内直接诊断 DNR 动态规则写入失败原因。
用法: python tools/probe-dnr.py <port>
"""
import json, sys, urllib.request
import websocket

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 9450


def http_json(path):
    with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{path}", timeout=8) as r:
        return json.loads(r.read().decode("utf-8"))


sw = next(t for t in http_json("/json/list")
          if t.get("type") == "service_worker" and "service-worker" in t.get("url", ""))
ws = websocket.create_connection(sw["webSocketDebuggerUrl"], suppress_origin=True, timeout=60)
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
                return {"__exception": str(r["exceptionDetails"])[:600]}
            return r.get("result", {}).get("value")


print("=== 设置与域名规模 ===")
print(ev("""
(async () => {
  const s = await getSettings();
  const hosts = collectBlockDomains(s);
  return {
    enabled: s.enabled, networkBlocking: s.networkBlocking,
    whitelist: s.whitelist.length, hosts: hosts.length,
    BAK_DOMAINS_PER_RULE: typeof BAK_DOMAINS_PER_RULE !== 'undefined' ? BAK_DOMAINS_PER_RULE : null,
    BAK_MAX_DYNAMIC_RULES: typeof BAK_MAX_DYNAMIC_RULES !== 'undefined' ? BAK_MAX_DYNAMIC_RULES : null
  };
})()
"""))

print("=== 单条最小规则写入测试 ===")
print(ev("""
(async () => {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeAllRules: true,
      addRules: [{ id: 1, priority: 1, action: { type: 'block' },
                  condition: { requestDomains: ['doubleclick.net'] } }]
    });
    const n = (await chrome.declarativeNetRequest.getDynamicRules()).length;
    return { ok: true, count: n };
  } catch (e) { return { ok: false, error: String(e && e.message || e) }; }
})()
"""))

print("=== 真实批量写入测试（原逻辑） ===")
print(ev("""
(async () => {
  try {
    const s = await getSettings();
    const hosts = collectBlockDomains(s);
    const per = BAK_DOMAINS_PER_RULE;
    const batches = chunk(hosts, per);
    const rules = batches.map((b, k) => ({
      id: k + 1, priority: 1, action: { type: 'block' },
      condition: { requestDomains: b, resourceTypes: ['script','image','sub_frame','xmlhttprequest','media','font','websocket','ping','other'] }
    }));
    await chrome.declarativeNetRequest.updateDynamicRules({ removeAllRules: true, addRules: rules.slice(0, BAK_MAX_DYNAMIC_RULES) });
    const n = (await chrome.declarativeNetRequest.getDynamicRules()).length;
    return { ok: true, rules: rules.length, count: n };
  } catch (e) { return { ok: false, error: String(e && e.message || e), rules_attempted: 'n/a' }; }
})()
"""))

print("=== 权限/限制 ===")
print(ev("""
(async () => {
  const m = chrome.declarativeNetRequest;
  const out = { maxDynamicRules: null, availDynamic: null,
                enabledRulesets: await m.getEnabledRulesets(),
                availableRulesets: await m.getAvailableRulesets() };
  if (typeof m.getAvailableDynamicRuleCount === 'function') {
    try { out.availDynamic = await m.getAvailableDynamicRuleCount(); } catch (e) {}
  }
  if (typeof m.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES !== 'undefined') out.maxDynamicRules = m.MAX_NUMBER_OF_DYNAMIC_AND_SESSION_RULES;
  out.manifest = chrome.runtime.getManifest().declarative_net_request || null;
  return out;
})()
"""))
