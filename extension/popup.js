const app = document.getElementById('app');
const who = document.getElementById('who');

const send = (type, payload = {}) => new Promise((resolve, reject) => {
  chrome.runtime.sendMessage({ type, ...payload }, (res) => {
    if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
    res?.ok ? resolve(res.data) : reject(new Error(res?.error || 'Error'));
  });
});
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const due = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '');

async function render() {
  const st = await send('status');
  if (!st.signedIn) {
    who.textContent = '';
    app.innerHTML = `
      <div class="hint">Sign in with your MailTasks account. Then open any email in Gmail and press the floating <b>Create task</b> button (or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>T</kbd>).</div>
      <label>Email</label><input id="em" type="email" autocomplete="email">
      <label>Password</label><input id="pw" type="password" autocomplete="current-password">
      <div class="err" id="err"></div>
      <button id="go">Sign in</button>
      <a class="btn sec" href="${st.webAppUrl}" target="_blank">Create an account</a>`;
    const go = async () => {
      const btn = document.getElementById('go');
      btn.textContent = 'Signing in…'; btn.disabled = true;
      try { await send('signIn', { email: document.getElementById('em').value.trim(), password: document.getElementById('pw').value }); render(); }
      catch (e) { const er = document.getElementById('err'); er.textContent = e.message; er.style.display = 'block'; btn.textContent = 'Sign in'; btn.disabled = false; }
    };
    document.getElementById('go').onclick = go;
    document.getElementById('pw').onkeydown = (e) => e.key === 'Enter' && go();
    document.getElementById('em').focus();
    return;
  }
  who.textContent = st.email;
  const { mt_quick } = await chrome.storage.local.get('mt_quick');
  app.innerHTML = `
    <div class="muted">Recent tasks</div>
    <div id="list"><div class="muted" style="padding:10px 0">Loading…</div></div>
    <div class="toggle"><span>Quick save (skip review)</span><input type="checkbox" id="quick" ${mt_quick ? 'checked' : ''}></div>
    <button id="open">Open MailTasks</button>
    <button id="gmail" class="sec">Go to Gmail</button>
    <button id="out" class="sec">Sign out</button>`;
  document.getElementById('quick').onchange = (e) => chrome.storage.local.set({ mt_quick: e.target.checked });
  document.getElementById('open').onclick = () => send('openApp', {});
  document.getElementById('gmail').onclick = () => chrome.tabs.create({ url: 'https://mail.google.com/' });
  document.getElementById('out').onclick = async () => { await send('signOut'); render(); };
  try {
    const tasks = await send('recent');
    const list = document.getElementById('list');
    list.innerHTML = tasks.length ? tasks.map((t) => `
      <div class="task"><input type="checkbox" data-id="${t.id}" ${t.status === 'done' ? 'checked' : ''}>
        <span class="t ${t.status === 'done' ? 'done' : ''}" data-open="${t.id}">${t.source === 'gmail' ? '✉️ ' : ''}${esc(t.title)}</span>
        <span class="d">${due(t.due_at)}</span></div>`).join('') : '<div class="muted" style="padding:10px 0">No tasks yet — open an email in Gmail.</div>';
    list.querySelectorAll('input[data-id]').forEach((cb) => cb.onchange = async () => {
      await send('toggleDone', { id: cb.dataset.id, done: cb.checked });
      cb.nextElementSibling.classList.toggle('done', cb.checked);
    });
    list.querySelectorAll('[data-open]').forEach((el) => el.onclick = () => send('openApp', { path: `#/task/${el.dataset.open}` }));
  } catch (e) {
    document.getElementById('list').innerHTML = `<div class="err" style="display:block">${esc(e.message)}</div>`;
  }
}
render();
