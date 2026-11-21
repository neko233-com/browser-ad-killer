/* Options 设置页 */
const $ = (id) => document.getElementById(id);
const send = (msg) => chrome.runtime.sendMessage(msg);

let state = null;
const SUB_META_KEY = 'bak_sub_meta_v1';

async function loadMeta() {
  const r = await chrome.storage.local.get(SUB_META_KEY);
  return r[SUB_META_KEY] || {};
}
async function saveMeta(meta) {
  await chrome.storage.local.set({ [SUB_META_KEY]: meta });
}

async function refresh() {
  state = await send({ type: 'GET_STATE' });
  if (typeof BAK_VERSION === 'string') $('ver').textContent = 'v' + BAK_VERSION;
  $('optMaster').checked = !!state.enabled;
  $('optNetwork').checked = !!state.networkBlocking;
  $('optSearch').checked = !!state.searchClean;
  $('optHotlist').checked = !!state.removeHotlist;
  $('optStrip').checked = state.stripTracking !== false;
  $('optDefuse').checked = state.defuseAntiAdblock !== false;

  document.querySelectorAll('#engineGrid input').forEach((el) => {
    el.checked = state[el.dataset.key] !== false;
  });

  $('customFilters').value = (state.customFilters || []).join('\n');
  renderWhitelist();
  renderBlacklist();
  renderSubs();
}

// ---------- 开关 ----------
$('optMaster').addEventListener('change', (e) =>
  send({ type: 'UPDATE_SETTINGS', patch: { enabled: e.target.checked } }).then(refresh));
$('optNetwork').addEventListener('change', (e) =>
  send({ type: 'UPDATE_SETTINGS', patch: { networkBlocking: e.target.checked } }).then(refresh));
$('optSearch').addEventListener('change', (e) =>
  send({ type: 'UPDATE_SETTINGS', patch: { searchClean: e.target.checked } }).then(refresh));
$('optHotlist').addEventListener('change', (e) =>
  send({ type: 'UPDATE_SETTINGS', patch: { removeHotlist: e.target.checked } }).then(refresh));
$('optStrip').addEventListener('change', (e) =>
  send({ type: 'UPDATE_SETTINGS', patch: { stripTracking: e.target.checked } }).then(refresh));
$('optDefuse').addEventListener('change', (e) =>
  send({ type: 'UPDATE_SETTINGS', patch: { defuseAntiAdblock: e.target.checked } }).then(refresh));

document.querySelectorAll('#engineGrid input').forEach((el) => {
  el.addEventListener('change', () => {
    send({ type: 'UPDATE_SETTINGS', patch: { [el.dataset.key]: el.checked } }).then(refresh);
  });
});

// ---------- 订阅 ----------
async function renderSubs() {
  const meta = await loadMeta();
  const list = $('subList');
  list.innerHTML = '';
  for (const preset of BAK_PRESETS) {
    const on = !!state.subscriptions[preset.id];
    const m = meta[preset.id];
    const item = document.createElement('div');
    item.className = 'sub-item';
    const status = m
      ? m.ok
        ? `<span class="ok">已更新</span> · 规则约 ${m.added} 条 · ${fmtTime(m.fetchedAt)}`
        : `<span class="err">更新失败：${escapeHtml(m.error || '未知')}</span>`
      : '未拉取';
    item.innerHTML = `
      <div class="sub-item-head">
        <input type="checkbox" id="sub-${preset.id}" ${on ? 'checked' : ''}>
        <label class="sub-name" for="sub-${preset.id}">${preset.name}</label>
      </div>
      <div class="sub-status">${status} · <a href="${preset.homepage}" target="_blank" rel="noreferrer">主页</a></div>`;
    item.querySelector('input').addEventListener('change', async (e) => {
      const subscriptions = { ...state.subscriptions, [preset.id]: e.target.checked };
      await send({ type: 'UPDATE_SETTINGS', patch: { subscriptions } });
      await refresh();
    });
    list.appendChild(item);
  }
}

$('refreshSubs').addEventListener('click', async () => {
  const btn = $('refreshSubs');
  btn.disabled = true; btn.textContent = '更新中…';
  const results = await send({ type: 'REFRESH_SUBSCRIPTIONS' });
  const meta = await loadMeta();
  for (const r of results) {
    meta[r.id] = { ok: r.ok, added: r.added || 0, error: r.error, fetchedAt: Date.now() };
  }
  await saveMeta(meta);
  btn.disabled = false; btn.textContent = '立即更新全部';
  await refresh();
});

// ---------- 自定义规则 ----------
$('saveCustom').addEventListener('click', async () => {
  const lines = $('customFilters').value.split('\n').map((s) => s.trim()).filter(Boolean);
  await send({ type: 'UPDATE_SETTINGS', patch: { customFilters: lines } });
  $('customStatus').textContent = `已保存 ${lines.length} 条`;
  await refresh();
});

// ---------- 白名单 ----------
function renderWhitelist() {
  const ul = $('wlList');
  ul.innerHTML = '';
  (state.whitelist || []).forEach((d) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(d)}</span><span class="rm">移除</span>`;
    li.querySelector('.rm').addEventListener('click', async () => {
      await send({ type: 'SET_WHITELIST', domain: d, paused: false });
      await refresh();
    });
    ul.appendChild(li);
  });
  if (!state.whitelist?.length) ul.innerHTML = '<li><span class="hint">暂无，当前所有站点均在拦截</span></li>';
}

$('addWhitelist').addEventListener('click', async () => {
  const v = $('whitelistInput').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!v) return;
  await send({ type: 'SET_WHITELIST', domain: v, paused: true });
  $('whitelistInput').value = '';
  await refresh();
});

// ---------- 黑名单 ----------
function renderBlacklist() {
  const ul = $('blList');
  ul.innerHTML = '';
  (state.blacklist || []).forEach((d) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${escapeHtml(d)}</span><span class="rm">移除</span>`;
    li.querySelector('.rm').addEventListener('click', async () => {
      await send({ type: 'SET_BLACKLIST', domain: d, blocked: false });
      await refresh();
    });
    ul.appendChild(li);
  });
  if (!state.blacklist?.length) ul.innerHTML = '<li><span class="hint">暂无屏蔽站点</span></li>';
}

$('addBlacklist').addEventListener('click', async () => {
  const v = $('blacklistInput').value.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!v) return;
  const res = await send({ type: 'SET_BLACKLIST', domain: v, blocked: true });
  if (res && res.ok === false) { $('blacklistInput').value = v; return; }
  $('blacklistInput').value = '';
  await refresh();
});

// ---------- 导出 / 导入 ----------
$('exportBtn').addEventListener('click', async () => {
  const config = await send({ type: 'EXPORT_CONFIG' });
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `adkiller-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

$('importBtn').addEventListener('click', () => $('importFile').click());
$('importFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  let config;
  try { config = JSON.parse(text); }
  catch { $('syncStatus').innerHTML = '<span class="err">文件不是合法 JSON</span>'; return; }
  const res = await send({ type: 'IMPORT_CONFIG', config });
  $('syncStatus').innerHTML = res.ok
    ? '<span class="ok">导入成功，已应用全部设置</span>'
    : `<span class="err">导入失败：${escapeHtml(res.error || '')}</span>`;
  await refresh();
});

// ---------- 重置 ----------
$('resetBtn').addEventListener('click', async () => {
  if (!confirm('恢复默认设置？自定义规则与白名单会被清空。')) return;
  await send({ type: 'UPDATE_SETTINGS', patch: JSON.parse(JSON.stringify(BAK_DEFAULTS)) });
  await refresh();
});

function fmtTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

refresh();
