/* Popup：总开关 / 站点暂停 / 网络与搜索开关 / 统计 / 导出配置 */
const $ = (id) => document.getElementById(id);

let state = null;
let currentDomain = '';

async function send(msg) {
  return chrome.runtime.sendMessage(msg);
}

async function refresh() {
  state = await send({ type: 'GET_STATE' });
  $('masterToggle').checked = !!state.enabled;
  $('networkToggle').checked = !!state.networkBlocking;
  $('searchToggle').checked = !!state.searchClean;

  // 当前站点白名单状态
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentDomain = tab && tab.url ? hostFromUrl(tab.url) : '';
  $('siteDomain').textContent = currentDomain || '当前页面不适用';
  $('sitePauseToggle').checked = currentDomain && state.whitelist.includes(currentDomain);
  $('sitePauseToggle').disabled = !currentDomain;

  const stats = await send({ type: 'GET_STATS' });
  $('blockedCount').textContent = stats.blocked >= 0 ? String(stats.blocked) : '—';
}

function hostFromUrl(url) {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; }
}

$('masterToggle').addEventListener('change', async (e) => {
  state = await send({ type: 'TOGGLE_MASTER', value: e.target.checked });
  refresh();
});
$('networkToggle').addEventListener('change', async (e) => {
  state = await send({ type: 'TOGGLE_NETWORK', value: e.target.checked });
  refresh();
});
$('searchToggle').addEventListener('change', async (e) => {
  state = await send({ type: 'TOGGLE_SEARCH', value: e.target.checked });
  refresh();
});
$('sitePauseToggle').addEventListener('change', async (e) => {
  if (!currentDomain) return;
  state = await send({ type: 'SET_WHITELIST', domain: currentDomain, paused: e.target.checked });
  refresh();
});

$('openOptions').addEventListener('click', () => chrome.runtime.openOptionsPage());

$('exportBtn').addEventListener('click', async () => {
  const config = await send({ type: 'EXPORT_CONFIG' });
  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `adkiller-config-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

refresh();
