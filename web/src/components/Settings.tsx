import { useState } from 'react'
import { ArrowDown, ArrowUp, Puzzle, Download, KeyRound, LogOut, Palette, Plus, Smartphone, Sparkles, Trash2, Upload, User } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Settings as S, Task } from '../lib/types'
import { LIST_COLORS } from '../lib/types'
import { download, toCSV } from '../lib/taskUtils'
import { RELEASES_URL, supabase } from '../lib/supabase'
import { isNative } from '../lib/platform'
import { Button, Segmented, cx } from './ui'

function Section({ icon, title, desc, children }: { icon: React.ReactNode; title: string; desc?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">{icon}</div>
        <div><h3 className="font-semibold">{title}</h3>{desc && <p className="text-sm text-slate-500">{desc}</p>}</div>
      </div>
      {children}
    </section>
  )
}

const PROVIDERS: { value: S['ai_provider']; label: string; hint: string; model: string }[] = [
  { value: 'gemini', label: 'Google Gemini (free tier)', hint: 'Get a free key at aistudio.google.com/apikey', model: 'gemini-flash-latest' },
  { value: 'openai', label: 'OpenAI', hint: 'platform.openai.com/api-keys', model: 'gpt-4.1-mini' },
  { value: 'anthropic', label: 'Anthropic Claude', hint: 'console.anthropic.com', model: 'claude-haiku-4-5' },
  { value: 'openai_compatible', label: 'OpenAI-compatible (Groq, OpenRouter…)', hint: 'Set the base URL, e.g. https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { value: 'none', label: 'No AI (basic extraction only)', hint: 'Uses simple rules to find dates & priority', model: '' },
]

export default function Settings() {
  const { session, settings, saveSettings, lists, createList, updateList, deleteList, tasks, theme, setUI, signOut, analyzeEmail, toast, createTask } = useStore()
  const [aiDraft, setAiDraft] = useState<Partial<S>>({})
  const [testing, setTesting] = useState(false)
  const [newList, setNewList] = useState('')
  const [pw, setPw] = useState('')
  if (!settings) return <div className="p-8 text-sm text-slate-500">Loading settings…</div>
  const ai = { ...settings, ...aiDraft }
  const prov = PROVIDERS.find((p) => p.value === ai.ai_provider) ?? PROVIDERS[0]

  async function testAI() {
    setTesting(true)
    try {
      await saveSettings(aiDraft); setAiDraft({})
      const r = await analyzeEmail({
        subject: 'Reminder: project report due Friday 5pm', from_name: 'Prof. Sharma', from_address: 'sharma@example.edu',
        body: 'Hi team, please submit the final project report (PDF, max 10 pages) on the LMS by this Friday 5 PM. Include the appendix with data sources. Late submissions will not be accepted.',
      })
      toast({ text: `${r.task.provider === 'heuristic' ? '⚠️ Basic mode' : '✅ ' + r.task.provider}: “${r.task.title}”${r.warning ? ` — ${r.warning}` : ''}`, tone: r.warning ? 'error' : 'success' })
    } catch (e) {
      toast({ text: `AI test failed: ${(e as Error).message}`, tone: 'error' })
    } finally { setTesting(false) }
  }

  async function importJSON(file: File) {
    try {
      const data = JSON.parse(await file.text())
      const rows: Partial<Task>[] = Array.isArray(data) ? data : data.tasks
      let n = 0
      for (const r of rows) {
        if (!r.title) continue
        await createTask({
          title: r.title, notes: r.notes ?? '', status: r.status ?? 'todo', priority: r.priority ?? 0, due_at: r.due_at ?? null,
          all_day: r.all_day ?? true, tags: r.tags ?? [], subtasks: r.subtasks ?? [], starred: r.starred ?? false, source: 'import',
          list_id: lists.find((l) => l.id === r.list_id)?.id ?? settings?.default_list_id ?? null,
        })
        n++
      }
      toast({ text: `Imported ${n} tasks`, tone: 'success' })
    } catch (e) { toast({ text: `Import failed: ${(e as Error).message}`, tone: 'error' }) }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 pb-16">
      <Section icon={<User size={18} />} title="Account" desc={session?.user.email}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Display name</label>
            <input className="input" defaultValue={settings.display_name ?? ''} onBlur={(e) => saveSettings({ display_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Change password</label>
            <div className="flex gap-2">
              <input className="input" type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} />
              <Button variant="outline" disabled={pw.length < 6} onClick={async () => {
                const { error } = await supabase.auth.updateUser({ password: pw })
                toast(error ? { text: error.message, tone: 'error' } : { text: 'Password updated', tone: 'success' }); setPw('')
              }}>Save</Button>
            </div>
          </div>
        </div>
        <Button variant="outline" className="mt-4" onClick={signOut}><LogOut size={15} /> Sign out</Button>
      </Section>

      <Section icon={<Sparkles size={18} />} title="AI email analysis" desc="Used when you press the button in Gmail or paste an email here. Your key is stored in your own database, visible only to you.">
        <div className="space-y-3">
          <div>
            <label className="label">Provider</label>
            <select className="input" value={ai.ai_provider} onChange={(e) => setAiDraft({ ...aiDraft, ai_provider: e.target.value as S['ai_provider'] })}>
              {PROVIDERS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            <p className="mt-1 text-xs text-slate-500">{prov.hint}</p>
          </div>
          {ai.ai_provider !== 'none' && (
            <>
              <div>
                <label className="label">API key</label>
                <input className="input font-mono" type="password" autoComplete="off" placeholder="Paste your API key" value={ai.ai_api_key ?? ''}
                  onChange={(e) => setAiDraft({ ...aiDraft, ai_api_key: e.target.value })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Model (optional)</label>
                  <input className="input" placeholder={prov.model} value={ai.ai_model ?? ''} onChange={(e) => setAiDraft({ ...aiDraft, ai_model: e.target.value || null })} />
                </div>
                {ai.ai_provider === 'openai_compatible' && (
                  <div>
                    <label className="label">Base URL</label>
                    <input className="input" placeholder="https://api.groq.com/openai/v1" value={ai.ai_base_url ?? ''} onChange={(e) => setAiDraft({ ...aiDraft, ai_base_url: e.target.value || null })} />
                  </div>
                )}
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Button disabled={!Object.keys(aiDraft).length} onClick={async () => { await saveSettings(aiDraft); setAiDraft({}); toast({ text: 'AI settings saved', tone: 'success' }) }}>Save</Button>
            <Button variant="outline" disabled={testing} onClick={testAI}><Sparkles size={14} />{testing ? 'Testing…' : 'Save & test'}</Button>
          </div>
        </div>
      </Section>

      <Section icon={<Palette size={18} />} title="Preferences">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Theme</label>
            <Segmented value={theme} onChange={(v) => setUI({ theme: v })} options={[{ value: 'system', label: 'System' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} />
          </div>
          <div>
            <label className="label">Default list for new & Gmail tasks</label>
            <select className="input" value={settings.default_list_id ?? ''} onChange={(e) => saveSettings({ default_list_id: e.target.value || null })}>
              <option value="">No list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
        </div>
      </Section>

      <Section icon={<Palette size={18} />} title="Lists" desc="Rename, recolour, reorder or delete lists. Deleting a list keeps its tasks.">
        <div className="space-y-1.5">
          {lists.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2">
              <div className="flex gap-1">
                {LIST_COLORS.map((c) => (
                  <button key={c} onClick={() => updateList(l.id, { color: c })} className={cx('h-4 w-4 rounded-full', l.color === c && 'ring-2 ring-offset-1 ring-slate-400 dark:ring-offset-slate-900')} style={{ background: c }} />
                ))}
              </div>
              <input className="input !py-1.5" defaultValue={l.name} onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && updateList(l.id, { name: e.target.value.trim() })} />
              <button className="p-1 text-slate-400 disabled:opacity-30" disabled={i === 0} onClick={() => { const p = lists[i - 1]; updateList(l.id, { position: p.position }); updateList(p.id, { position: l.position }) }}><ArrowUp size={15} /></button>
              <button className="p-1 text-slate-400 disabled:opacity-30" disabled={i === lists.length - 1} onClick={() => { const n = lists[i + 1]; updateList(l.id, { position: n.position }); updateList(n.id, { position: l.position }) }}><ArrowDown size={15} /></button>
              <button className="p-1 text-slate-400 hover:text-red-600" onClick={() => confirm(`Delete list “${l.name}”? Tasks are kept.`) && deleteList(l.id)}><Trash2 size={15} /></button>
            </div>
          ))}
          <div className="flex gap-2 pt-2">
            <input className="input" placeholder="New list name" value={newList} onChange={(e) => setNewList(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && newList.trim()) { createList(newList.trim(), LIST_COLORS[lists.length % LIST_COLORS.length]); setNewList('') } }} />
            <Button variant="outline" onClick={() => { if (newList.trim()) { createList(newList.trim(), LIST_COLORS[lists.length % LIST_COLORS.length]); setNewList('') } }}><Plus size={15} />Add</Button>
          </div>
        </div>
      </Section>

      <Section icon={<Puzzle size={18} />} title="Your devices" desc="Everything signs in with this same account.">
        <div className="grid gap-3 sm:grid-cols-2">
          <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 p-4 hover:border-brand-400 dark:border-slate-700">
            <div className="flex items-center gap-2 font-medium"><Puzzle size={16} /> Gmail extension</div>
            <p className="mt-1 text-xs text-slate-500">Download <b>mailtasks-extension.zip</b>, unzip, then chrome://extensions → Developer mode → Load unpacked.</p>
          </a>
          <a href={RELEASES_URL} target="_blank" rel="noreferrer" className="rounded-xl border border-slate-200 p-4 hover:border-brand-400 dark:border-slate-700">
            <div className="flex items-center gap-2 font-medium"><Smartphone size={16} /> Android app</div>
            <p className="mt-1 text-xs text-slate-500">Download <b>MailTasks.apk</b> on your phone and install it. Share any email from the Gmail app to MailTasks to turn it into a task.</p>
          </a>
        </div>
      </Section>

      <Section icon={<KeyRound size={18} />} title="Your data">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => download(`mailtasks-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ lists, tasks }, null, 2), 'application/json')}><Download size={15} />Export JSON</Button>
          <Button variant="outline" onClick={() => download(`mailtasks-${new Date().toISOString().slice(0, 10)}.csv`, toCSV(tasks.filter((t) => !t.deleted_at), lists), 'text/csv')}><Download size={15} />Export CSV</Button>
          {!isNative && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900">
              <Upload size={15} />Import JSON
              <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importJSON(e.target.files[0])} />
            </label>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">{tasks.filter((t) => !t.deleted_at).length} tasks · {lists.length} lists · stored in your Supabase project</p>
      </Section>
    </div>
  )
}
