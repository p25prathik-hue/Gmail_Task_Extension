// MailTasks content script: floating button + review panel inside Gmail.
(() => {
  if (window.__mailtasksLoaded) return;
  window.__mailtasksLoaded = true;

  const send = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      try {
        chrome.runtime.sendMessage({ type, ...payload }, (res) => {
          if (chrome.runtime.lastError) return reject(new Error('Extension was updated — reload Gmail (F5).'));
          if (!res) return reject(new Error('No response from extension'));
          if (res.ok) resolve(res.data);
          else reject(Object.assign(new Error(res.error), { code: res.code }));
        });
      } catch (e) {
        reject(new Error('Extension was updated — reload Gmail (F5).'));
      }
    });

  const PRIORITIES = [
    { v: 0, label: 'None', color: '#94a3b8' },
    { v: 1, label: 'Low', color: '#22c55e' },
    { v: 2, label: 'Med', color: '#eab308' },
    { v: 3, label: 'High', color: '#f97316' },
    { v: 4, label: 'Urgent', color: '#ef4444' },
  ];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const toDate = (iso) => { if (!iso) return ''; const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const toTime = (iso, allDay) => { if (!iso || allDay) return ''; const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

  // ------------------------------------------------------------------ Gmail DOM
  const visible = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  function currentThread() {
    const subjects = [...document.querySelectorAll('h2.hP')].filter(visible);
    return subjects[0] || null;
  }

  function extractEmail() {
    const h2 = currentThread();
    if (!h2) return null;
    const root = h2.closest('[role="main"]') || document;
    const subject = h2.textContent.trim();
    const threadId = h2.getAttribute('data-legacy-thread-id') || h2.getAttribute('data-thread-perm-id') || location.hash.split('/').pop();
    const msgs = [...root.querySelectorAll('div.adn')].filter(visible);
    const expanded = msgs.filter((m) => m.querySelector('div.a3s'));
    const last = expanded[expanded.length - 1] || msgs[msgs.length - 1];
    const sender = last?.querySelector('span.gD') || root.querySelector('span.gD');
    const dateEl = last?.querySelector('span.g3') || root.querySelector('span.g3');
    const bodyParts = expanded.map((m) => {
      const from = m.querySelector('span.gD');
      const when = m.querySelector('span.g3')?.getAttribute('title') || '';
      const text = (m.querySelector('div.a3s')?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
      return expanded.length > 1 ? `--- ${from?.getAttribute('name') || ''} <${from?.getAttribute('email') || ''}> ${when}\n${text}` : text;
    });
    let body = bodyParts.join('\n\n');
    if (body.length > 14000) body = '…' + body.slice(-14000);
    const m = location.pathname.match(/\/mail\/u\/(\d+)/);
    const acct = m ? m[1] : '0';
    const legacy = h2.getAttribute('data-legacy-thread-id');
    const url = legacy ? `https://mail.google.com/mail/u/${acct}/#all/${legacy}` : location.href;
    let date = null;
    const t = dateEl?.getAttribute('title');
    if (t) { const p = Date.parse(t.replace(' at ', ' ')); if (!isNaN(p)) date = new Date(p).toISOString(); }
    return {
      subject,
      threadId,
      from_name: sender?.getAttribute('name') || sender?.textContent?.trim() || '',
      from_address: sender?.getAttribute('email') || '',
      date,
      dateText: t || '',
      body,
      url,
    };
  }

  // ------------------------------------------------------------------ UI (shadow DOM)
  const host = document.createElement('div');
  host.id = 'mailtasks-root';
  host.style.cssText = 'position:fixed;z-index:2147483000;top:0;left:0;width:0;height:0;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
  <style>
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Google Sans", Inter, Roboto, system-ui, sans-serif; }
    .fab { position: fixed; display: none; align-items: center; gap: 8px; padding: 0 16px 0 12px; height: 46px; border-radius: 23px;
      background: linear-gradient(135deg,#6366f1,#4f46e5); color: #fff; border: 0; cursor: pointer; font-size: 14px; font-weight: 600;
      box-shadow: 0 8px 24px rgba(79,70,229,.35), 0 2px 6px rgba(0,0,0,.15); transition: transform .15s, box-shadow .15s; user-select: none; touch-action: none; }
    .fab:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(79,70,229,.45); }
    .fab.show { display: flex; }
    .fab .badge { background: #22c55e; border-radius: 10px; font-size: 11px; padding: 2px 7px; }
    .fab svg { flex: none; }
    .panel { position: fixed; width: 380px; max-height: min(640px, calc(100vh - 40px)); overflow: auto; background: #fff; color: #0f172a;
      border-radius: 16px; box-shadow: 0 24px 60px rgba(15,23,42,.28), 0 0 0 1px rgba(15,23,42,.06); display: none; animation: pop .16s ease-out; }
    .panel.show { display: block; }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98) } to { opacity: 1; transform: none } }
    .hd { display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-bottom: 1px solid #eef2f7; position: sticky; top: 0; background: #fff; z-index: 1; }
    .hd .t { font-weight: 700; font-size: 15px; flex: 1; }
    .x { background: none; border: 0; cursor: pointer; color: #64748b; font-size: 20px; line-height: 1; padding: 4px 6px; border-radius: 8px; }
    .x:hover { background: #f1f5f9; }
    .bd { padding: 14px 16px 16px; }
    label { display: block; font-size: 11px; font-weight: 600; color: #64748b; margin: 10px 0 4px; text-transform: uppercase; letter-spacing: .03em; }
    input, select, textarea { width: 100%; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; font-size: 13px; color: #0f172a; background: #fff; outline: none; }
    input:focus, select:focus, textarea:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.15); }
    textarea { resize: vertical; min-height: 70px; line-height: 1.45; }
    .title { font-size: 15px; font-weight: 600; }
    .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .prio { display: flex; gap: 4px; }
    .prio button { flex: 1; border: 1px solid #e2e8f0; background: #fff; border-radius: 8px; padding: 6px 0; font-size: 12px; cursor: pointer; color: #475569; }
    .prio button.on { color: #fff; border-color: transparent; font-weight: 600; }
    .subs { margin: 0; padding: 0; list-style: none; }
    .subs li { display: flex; gap: 8px; align-items: center; font-size: 13px; padding: 3px 0; }
    .subs input { width: auto; }
    .sum { background: #eef2ff; color: #3730a3; border-radius: 10px; padding: 10px 12px; font-size: 12.5px; line-height: 1.45; margin-bottom: 4px; }
    .warn { background: #fffbeb; color: #92400e; border-radius: 10px; padding: 8px 12px; font-size: 12px; margin-bottom: 8px; }
    .err { background: #fef2f2; color: #b91c1c; border-radius: 10px; padding: 10px 12px; font-size: 13px; }
    .meta { font-size: 12px; color: #64748b; display: flex; gap: 6px; align-items: center; }
    .btns { display: flex; gap: 8px; margin-top: 16px; }
    .btn { flex: 1; border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 600; font-size: 13px; cursor: pointer; background: #4f46e5; color: #fff; }
    .btn:hover { background: #4338ca; }
    .btn.sec { background: #f1f5f9; color: #334155; flex: none; }
    .btn.sec:hover { background: #e2e8f0; }
    .btn:disabled { opacity: .55; cursor: default; }
    .skel { height: 12px; border-radius: 6px; background: linear-gradient(90deg,#f1f5f9,#e2e8f0,#f1f5f9); background-size: 200% 100%; animation: sh 1.2s infinite; margin: 10px 0; }
    @keyframes sh { to { background-position: -200% 0 } }
    .center { text-align: center; padding: 10px 0; }
    .ok { width: 52px; height: 52px; border-radius: 50%; background: #dcfce7; color: #16a34a; display: inline-flex; align-items: center; justify-content: center; font-size: 28px; }
    a { color: #4f46e5; text-decoration: none; font-weight: 600; cursor: pointer; }
    .chip { display: inline-block; background: #f1f5f9; border-radius: 6px; padding: 2px 8px; font-size: 12px; margin: 2px 4px 2px 0; }
    .exist { border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; margin-top: 6px; font-size: 13px; display: flex; justify-content: space-between; gap: 8px; }
    .foot { font-size: 11px; color: #94a3b8; margin-top: 10px; text-align: center; }
    @media (prefers-color-scheme: dark) {
      .panel, .hd { background: #0f172a; color: #e2e8f0; } .hd { border-color: #1e293b; }
      input, select, textarea, .prio button { background: #0b1220; color: #e2e8f0; border-color: #334155; }
      .sum { background: rgba(99,102,241,.15); color: #c7d2fe; } .btn.sec { background: #1e293b; color: #e2e8f0; }
      .x:hover { background: #1e293b; } .chip { background: #1e293b; } .exist { border-color: #334155; }
      .skel { background: linear-gradient(90deg,#1e293b,#334155,#1e293b); background-size: 200% 100%; }
    }
  </style>
  <button class="fab" title="Create a task from this email with AI (Alt+Shift+T)">
    <svg width="22" height="22" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="rgba(255,255,255,.18)"/><path d="M14 22l18 13 18-13" fill="none" stroke="#fff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="46" cy="44" r="11" fill="#22c55e"/><path d="M41 44l3.5 3.5L51 41" fill="none" stroke="#fff" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <span class="lbl">Create task</span><span class="badge" style="display:none"></span>
  </button>
  <div class="panel"></div>`;
  document.documentElement.appendChild(host);

  const fab = shadow.querySelector('.fab');
  const panel = shadow.querySelector('.panel');
  const badge = shadow.querySelector('.badge');

  // ------------------------------------------------------------------ position + drag
  let pos = { right: 28, bottom: 96 };
  chrome.storage.local.get(['mt_pos', 'mt_hidden']).then((r) => {
    if (r.mt_pos) pos = r.mt_pos;
    applyPos();
  });
  function applyPos() {
    pos.right = Math.max(8, Math.min(window.innerWidth - 80, pos.right));
    pos.bottom = Math.max(8, Math.min(window.innerHeight - 56, pos.bottom));
    fab.style.right = pos.right + 'px';
    fab.style.bottom = pos.bottom + 'px';
    placePanel();
  }
  function placePanel() {
    const w = 380;
    const right = Math.min(Math.max(12, pos.right), window.innerWidth - w - 12);
    panel.style.right = right + 'px';
    const above = pos.bottom + 58;
    if (window.innerHeight - above > 360) { panel.style.bottom = above + 'px'; panel.style.top = 'auto'; }
    else { panel.style.top = '20px'; panel.style.bottom = 'auto'; }
  }
  window.addEventListener('resize', applyPos);
  let drag = null;
  fab.addEventListener('pointerdown', (e) => {
    drag = { x: e.clientX, y: e.clientY, r: pos.right, b: pos.bottom, moved: false };
    fab.setPointerCapture(e.pointerId);
  });
  fab.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
    if (drag.moved) { pos = { right: drag.r - dx, bottom: drag.b - dy }; applyPos(); }
  });
  fab.addEventListener('pointerup', () => {
    const wasDrag = drag?.moved;
    drag = null;
    if (wasDrag) chrome.storage.local.set({ mt_pos: pos });
    else togglePanel();
  });

  // ------------------------------------------------------------------ visibility tracking
  let lastThread = null;
  let existing = [];
  async function refreshVisibility() {
    const h2 = currentThread();
    fab.classList.toggle('show', !!h2);
    if (!h2) { if (panel.classList.contains('show') && state.mode !== 'saved') closePanel(); lastThread = null; return; }
    const tid = h2.getAttribute('data-legacy-thread-id') || h2.getAttribute('data-thread-perm-id');
    if (tid !== lastThread) {
      lastThread = tid;
      if (panel.classList.contains('show')) closePanel();
      existing = [];
      badge.style.display = 'none';
      try {
        existing = await send('findByThread', { threadId: tid });
        if (lastThread === tid && existing.length) { badge.textContent = `✓ ${existing.length}`; badge.style.display = 'inline'; }
      } catch (_) { /* not signed in yet */ }
    }
  }
  let t = null;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(refreshVisibility, 250); }).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('hashchange', () => setTimeout(refreshVisibility, 300));
  refreshVisibility();

  // ------------------------------------------------------------------ panel state machine
  const state = { mode: 'closed', email: null, boot: null, task: null, warning: '', provider: '', saved: null, error: '' };

  function closePanel() { panel.classList.remove('show'); state.mode = 'closed'; }
  function togglePanel() { if (panel.classList.contains('show')) closePanel(); else start(); }

  chrome.runtime.onMessage.addListener((m) => { if (m?.type === 'trigger' && currentThread()) start(); });

  async function start(force = false) {
    placePanel();
    panel.classList.add('show');
    state.email = extractEmail();
    if (!state.email) { state.mode = 'error'; state.error = 'Open an email first.'; return render(); }
    if (existing.length && !force) { state.mode = 'exists'; return render(); }
    state.mode = 'loading'; render();
    try {
      state.boot = await send('bootstrap');
      if (!state.boot.signedIn) { state.mode = 'login'; return render(); }
      const res = await send('analyze', {
        email: {
          subject: state.email.subject, from_name: state.email.from_name, from_address: state.email.from_address,
          date: state.email.dateText || state.email.date, body: state.email.body, url: state.email.url,
          now: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          lists: state.boot.lists.map((l) => l.name),
        },
      });
      const a = res.task;
      const suggested = a.suggested_list && state.boot.lists.find((l) => l.name.toLowerCase() === a.suggested_list.toLowerCase());
      state.task = {
        title: a.title, notes: a.description || '', due_at: a.due_at, all_day: a.all_day !== false, priority: a.priority || 0,
        tags: a.tags || [], subtasks: (a.subtasks || []).map((s) => ({ title: s, on: true })), list_id: suggested?.id || state.boot.defaultListId || '',
        summary: a.summary || '', estimate: a.estimate_minutes ?? null, actionRequired: a.action_required !== false,
      };
      state.warning = res.warning || '';
      state.provider = a.provider + (a.model ? ` · ${a.model}` : '');
      const quick = (await chrome.storage.local.get('mt_quick')).mt_quick;
      if (quick) return save();
      state.mode = 'review'; render();
    } catch (e) {
      if (e.code === 'AUTH') { state.mode = 'login'; state.error = ''; return render(); }
      state.mode = 'error'; state.error = e.message; render();
    }
  }

  async function save() {
    const tsk = state.task, em = state.email;
    const row = {
      title: tsk.title.trim() || em.subject || 'Email task',
      notes: tsk.notes, due_at: tsk.due_at, all_day: tsk.all_day, priority: tsk.priority, tags: tsk.tags,
      subtasks: tsk.subtasks.filter((s) => s.on && s.title.trim()).map((s) => ({ id: uid(), title: s.title.trim(), done: false })),
      list_id: tsk.list_id || null, estimate_minutes: tsk.estimate, source: 'gmail',
      email_subject: em.subject, email_from_name: em.from_name, email_from_address: em.from_address, email_date: em.date,
      email_url: em.url, email_thread_id: em.threadId, email_snippet: em.body.slice(0, 600), ai_summary: tsk.summary || null,
    };
    state.mode = 'saving'; render();
    try {
      state.saved = await send('createTask', { task: row });
      existing = [state.saved, ...existing];
      badge.textContent = `✓ ${existing.length}`; badge.style.display = 'inline';
      state.mode = 'saved'; render();
    } catch (e) {
      if (e.code === 'AUTH') { state.mode = 'login'; return render(); }
      state.mode = 'error'; state.error = e.message; render();
    }
  }

  const header = (title) => `<div class="hd"><span class="t">${title}</span><button class="x" data-a="close" title="Close">×</button></div>`;
  const fmtDue = (iso, allDay) => { if (!iso) return 'No date'; const d = new Date(iso); return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + (allDay ? '' : ' ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })); };

  function render() {
    const s = state;
    let html = '';
    if (s.mode === 'loading') {
      html = header('✨ Reading email…') + `<div class="bd"><div class="meta">${esc(s.email?.subject)}</div><div class="skel" style="width:85%"></div><div class="skel" style="width:60%"></div><div class="skel" style="width:75%"></div><div class="skel" style="width:40%"></div></div>`;
    } else if (s.mode === 'login') {
      html = header('Sign in to MailTasks') + `<div class="bd">
        <div class="meta" style="margin-bottom:6px">Use the same account as the web & Android app.</div>
        ${s.error ? `<div class="err">${esc(s.error)}</div>` : ''}
        <label>Email</label><input id="em" type="email" autocomplete="email">
        <label>Password</label><input id="pw" type="password" autocomplete="current-password">
        <div class="btns"><button class="btn" data-a="login">Sign in & analyse</button></div>
        <div class="foot">No account? <a data-a="signup">Create one in the web app</a></div></div>`;
    } else if (s.mode === 'exists') {
      html = header('Already saved') + `<div class="bd"><div class="meta">This email already has ${existing.length} task${existing.length > 1 ? 's' : ''}:</div>
        ${existing.map((x) => `<div class="exist"><span>${x.status === 'done' ? '✅' : '•'} ${esc(x.title)}</span><a data-a="open" data-id="${x.id}">Open</a></div>`).join('')}
        <div class="btns"><button class="btn sec" data-a="close">Close</button><button class="btn" data-a="force">Create another task</button></div></div>`;
    } else if (s.mode === 'review' || s.mode === 'saving') {
      const t = s.task;
      html = header('New task from email') + `<div class="bd">
        ${s.warning ? `<div class="warn">${esc(s.warning)}</div>` : ''}
        ${!t.actionRequired ? '<div class="warn">AI thinks this email may not need any action.</div>' : ''}
        ${t.summary ? `<div class="sum">✨ ${esc(t.summary)}</div>` : ''}
        <label>Task</label><input id="title" class="title" value="${esc(t.title)}">
        <div class="row">
          <div><label>Due date</label><input id="date" type="date" value="${toDate(t.due_at)}"></div>
          <div><label>Time</label><input id="time" type="time" value="${toTime(t.due_at, t.all_day)}"></div>
        </div>
        <label>Priority</label>
        <div class="prio">${PRIORITIES.map((p) => `<button data-p="${p.v}" class="${t.priority === p.v ? 'on' : ''}" style="${t.priority === p.v ? `background:${p.color}` : ''}">${p.label}</button>`).join('')}</div>
        <div class="row">
          <div><label>List</label><select id="list"><option value="">No list</option>${s.boot.lists.map((l) => `<option value="${l.id}" ${l.id === t.list_id ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
          <div><label>Tags</label><input id="tags" value="${esc(t.tags.join(' '))}" placeholder="space separated"></div>
        </div>
        ${t.subtasks.length ? `<label>Steps</label><ul class="subs">${t.subtasks.map((st, i) => `<li><input type="checkbox" data-s="${i}" ${st.on ? 'checked' : ''}><span>${esc(st.title)}</span></li>`).join('')}</ul>` : ''}
        <label>Notes</label><textarea id="notes">${esc(t.notes)}</textarea>
        <div class="btns"><button class="btn sec" data-a="close">Cancel</button><button class="btn" data-a="save" ${s.mode === 'saving' ? 'disabled' : ''}>${s.mode === 'saving' ? 'Saving…' : 'Save task'}</button></div>
        <div class="foot">${esc(s.provider)}${!s.boot.aiConfigured ? ' · <a data-a="settings">Add a free AI key</a> for smarter results' : ''}</div>
      </div>`;
    } else if (s.mode === 'saved') {
      html = header('Task saved') + `<div class="bd center"><div class="ok">✓</div>
        <div style="font-weight:600;margin:10px 0 4px">${esc(s.saved.title)}</div>
        <div class="meta" style="justify-content:center">${fmtDue(s.saved.due_at, s.saved.all_day)} · ${PRIORITIES[s.saved.priority]?.label || ''}</div>
        <div style="margin-top:6px">${(s.saved.tags || []).map((g) => `<span class="chip">#${esc(g)}</span>`).join('')}</div>
        <div class="btns"><button class="btn sec" data-a="undo">Undo</button><button class="btn" data-a="open" data-id="${s.saved.id}">Open in MailTasks</button></div></div>`;
      clearTimeout(s._close);
      s._close = setTimeout(() => { if (state.mode === 'saved') closePanel(); }, 9000);
    } else if (s.mode === 'error') {
      html = header('Something went wrong') + `<div class="bd"><div class="err">${esc(s.error)}</div>
        <div class="btns"><button class="btn sec" data-a="close">Close</button><button class="btn" data-a="retry">Try again</button></div></div>`;
    }
    panel.innerHTML = html;
    bind();
  }

  function readForm() {
    const q = (id) => panel.querySelector('#' + id);
    const t = state.task;
    if (!q('title')) return;
    t.title = q('title').value;
    const date = q('date').value, time = q('time').value;
    if (!date) { t.due_at = null; t.all_day = true; }
    else {
      const [y, m, d] = date.split('-').map(Number);
      if (time) { const [hh, mm] = time.split(':').map(Number); t.due_at = new Date(y, m - 1, d, hh, mm).toISOString(); t.all_day = false; }
      else { t.due_at = new Date(y, m - 1, d, 9, 0).toISOString(); t.all_day = true; }
    }
    t.list_id = q('list').value;
    t.tags = q('tags').value.split(/[\s,]+/).map((x) => x.replace(/^#/, '').toLowerCase()).filter(Boolean);
    t.notes = q('notes').value;
    panel.querySelectorAll('[data-s]').forEach((cb) => { t.subtasks[Number(cb.dataset.s)].on = cb.checked; });
  }

  function bind() {
    panel.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { readForm(); state.task.priority = Number(b.dataset.p); render(); }));
    panel.querySelectorAll('[data-a]').forEach((el) => el.addEventListener('click', async () => {
      const a = el.dataset.a;
      if (a === 'close') closePanel();
      else if (a === 'save') { readForm(); save(); }
      else if (a === 'retry') start(true);
      else if (a === 'force') start(true);
      else if (a === 'open') send('openApp', { path: `#/task/${el.dataset.id}` });
      else if (a === 'signup') send('openApp', {});
      else if (a === 'settings') send('openApp', {});
      else if (a === 'undo') {
        try { await send('deleteTask', { id: state.saved.id }); existing = existing.filter((x) => x.id !== state.saved.id); } catch (_) { /* ignore */ }
        badge.style.display = existing.length ? 'inline' : 'none'; badge.textContent = `✓ ${existing.length}`;
        state.mode = 'review'; render();
      } else if (a === 'login') {
        const email = panel.querySelector('#em').value.trim(), password = panel.querySelector('#pw').value;
        el.disabled = true; el.textContent = 'Signing in…';
        try { await send('signIn', { email, password }); state.error = ''; start(true); }
        catch (e) { state.error = e.message; render(); }
      }
    }));
    const title = panel.querySelector('#title');
    if (title) title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { readForm(); save(); } });
    const pw = panel.querySelector('#pw');
    if (pw) pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') panel.querySelector('[data-a=login]').click(); });
  }

  // Stop Gmail keyboard shortcuts from firing while typing in our panel.
  ['keydown', 'keypress', 'keyup'].forEach((ev) => panel.addEventListener(ev, (e) => {
    e.stopPropagation();
    if (ev === 'keydown' && e.key === 'Escape') closePanel();
  }));
})();
