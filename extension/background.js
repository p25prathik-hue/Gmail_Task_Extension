// MailTasks service worker: owns the Supabase session and all network calls.
import { CONFIG } from './config.js';

const { SUPABASE_URL: URL_, SUPABASE_ANON_KEY: ANON } = CONFIG;
const SESSION_KEY = 'mt_session';

async function getStored() {
  const r = await chrome.storage.local.get(SESSION_KEY);
  return r[SESSION_KEY] || null;
}
async function setStored(s) {
  if (s) await chrome.storage.local.set({ [SESSION_KEY]: s });
  else await chrome.storage.local.remove(SESSION_KEY);
}

async function authRequest(grant, body) {
  const r = await fetch(`${URL_}/auth/v1/token?grant_type=${grant}`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error_description || d.msg || d.message || `Auth failed (${r.status})`);
  return {
    access_token: d.access_token,
    refresh_token: d.refresh_token,
    expires_at: d.expires_at || Math.floor(Date.now() / 1000) + (d.expires_in || 3600),
    user: { id: d.user?.id, email: d.user?.email },
  };
}

let refreshing = null;
async function session() {
  const s = await getStored();
  if (!s) return null;
  if (s.expires_at - 90 > Date.now() / 1000) return s;
  if (!refreshing) {
    refreshing = authRequest('refresh_token', { refresh_token: s.refresh_token })
      .then(async (n) => { await setStored(n); return n; })
      .catch(async (e) => { if (/invalid|expired|not found/i.test(e.message)) await setStored(null); throw e; })
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function authed() {
  const s = await session();
  if (!s) throw Object.assign(new Error('Please sign in to MailTasks'), { code: 'AUTH' });
  return s;
}

async function rest(path, { method = 'GET', body, prefer } = {}) {
  const s = await authed();
  const r = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: ANON,
      Authorization: `Bearer ${s.access_token}`,
      'Content-Type': 'application/json',
      ...(prefer ? { Prefer: prefer } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  if (r.status === 401) { await setStored(null); throw Object.assign(new Error('Session expired, please sign in again'), { code: 'AUTH' }); }
  if (!r.ok) throw new Error(data?.message || `Request failed (${r.status})`);
  return data;
}

async function analyze(email) {
  const s = await authed();
  const r = await fetch(`${URL_}/functions/v1/analyze-email`, {
    method: 'POST',
    headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(email),
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401) throw Object.assign(new Error(d.error || 'Please sign in again'), { code: 'AUTH' });
  if (!r.ok) throw new Error(d.error || `AI request failed (${r.status})`);
  return d;
}

async function bootstrap() {
  const s = await session();
  if (!s) return { signedIn: false };
  const [lists, settings] = await Promise.all([
    rest('lists?select=id,name,color,position&order=position'),
    rest('user_settings?select=default_list_id,ai_provider,ai_api_key'),
  ]);
  const st = settings?.[0] || {};
  return {
    signedIn: true,
    email: s.user?.email,
    lists,
    defaultListId: st.default_list_id || null,
    aiConfigured: !!st.ai_api_key || st.ai_provider === 'none',
  };
}

const handlers = {
  async status() {
    const s = await session().catch(() => null);
    return { signedIn: !!s, email: s?.user?.email || null, webAppUrl: CONFIG.WEB_APP_URL };
  },
  async signIn({ email, password }) {
    const s = await authRequest('password', { email, password });
    await setStored(s);
    return { signedIn: true, email: s.user.email };
  },
  async signOut() {
    const s = await getStored();
    if (s) fetch(`${URL_}/auth/v1/logout`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${s.access_token}` } }).catch(() => {});
    await setStored(null);
    return { signedIn: false };
  },
  bootstrap,
  analyze: ({ email }) => analyze(email),
  async findByThread({ threadId }) {
    if (!threadId) return [];
    return rest(`tasks?select=id,title,status,due_at&deleted_at=is.null&email_thread_id=eq.${encodeURIComponent(threadId)}&order=created_at.desc`);
  },
  async createTask({ task }) {
    const rows = await rest('tasks', { method: 'POST', body: task, prefer: 'return=representation' });
    return rows[0];
  },
  async deleteTask({ id }) {
    await rest(`tasks?id=eq.${id}`, { method: 'DELETE' });
    return true;
  },
  async recent() {
    return rest('tasks?select=id,title,status,due_at,priority,source&deleted_at=is.null&order=created_at.desc&limit=6');
  },
  async toggleDone({ id, done }) {
    await rest(`tasks?id=eq.${id}`, { method: 'PATCH', body: { status: done ? 'done' : 'todo' } });
    return true;
  },
  openApp({ path = '' }) {
    chrome.tabs.create({ url: CONFIG.WEB_APP_URL + path });
    return true;
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const h = handlers[msg?.type];
  if (!h) return false;
  Promise.resolve()
    .then(() => h(msg))
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e), code: e.code }));
  return true;
});

chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== 'create-task') return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && tab.url?.startsWith('https://mail.google.com/')) chrome.tabs.sendMessage(tab.id, { type: 'trigger' }).catch(() => {});
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === 'install') chrome.action.setBadgeText({ text: '' });
});
