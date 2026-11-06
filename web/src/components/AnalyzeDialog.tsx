import { useEffect, useState } from 'react'
import { Sparkles, Wand2 } from 'lucide-react'
import { useStore } from '../lib/store'
import type { AnalyzedTask } from '../lib/types'
import { PRIORITIES } from '../lib/types'
import { dueFromDateTime, toDateInput, toTimeInput, uid } from '../lib/taskUtils'
import { isNative } from '../lib/platform'
import { Button, Modal } from './ui'

export interface EmailDraft { subject?: string; from?: string; body?: string }

export default function AnalyzeDialog({ open, onClose, initial }: { open: boolean; onClose: () => void; initial?: EmailDraft | null }) {
  const { analyzeEmail, createTask, lists, settings, toast, setUI } = useStore()
  const [subject, setSubject] = useState('')
  const [from, setFrom] = useState('')
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<AnalyzedTask | null>(null)
  const [warning, setWarning] = useState('')
  const [listId, setListId] = useState<string>('')

  useEffect(() => {
    if (!open) return
    setSubject(initial?.subject ?? ''); setFrom(initial?.from ?? ''); setBody(initial?.body ?? ''); setRes(null); setWarning('')
    setListId(settings?.default_list_id ?? '')
    if (initial?.body || initial?.subject) setTimeout(() => document.getElementById('mt-analyze-btn')?.click(), 50)
  }, [open, initial, settings])

  async function run() {
    setBusy(true); setWarning('')
    try {
      const m = from.match(/^(.*?)\s*<([^>]+)>/)
      const r = await analyzeEmail({ subject, body, from_name: m ? m[1] : from, from_address: m ? m[2] : from.includes('@') ? from : '' })
      setRes(r.task); setWarning(r.warning ?? '')
      const sl = r.task.suggested_list && lists.find((l) => l.name.toLowerCase() === r.task.suggested_list!.toLowerCase())
      if (sl) setListId(sl.id)
    } catch (e) { toast({ text: (e as Error).message, tone: 'error' }) } finally { setBusy(false) }
  }

  async function save() {
    if (!res) return
    const m = from.match(/^(.*?)\s*<([^>]+)>/)
    const t = await createTask({
      title: res.title, notes: res.description, priority: res.priority, due_at: res.due_at, all_day: res.all_day, tags: res.tags,
      subtasks: res.subtasks.map((s) => ({ id: uid(), title: s, done: false })), estimate_minutes: res.estimate_minutes, list_id: listId || null,
      source: isNative ? 'mobile' : 'manual', ai_summary: res.summary || null, email_subject: subject || null,
      email_from_name: m ? m[1] : from || null, email_from_address: m ? m[2] : null, email_snippet: body.slice(0, 500) || null,
    })
    if (t) { toast({ text: 'Task created from email', tone: 'success' }); setUI({ openTaskId: t.id }); onClose() }
  }

  const date = res ? toDateInput(res.due_at) : ''
  const time = res ? toTimeInput(res.due_at, res.all_day) : ''

  return (
    <Modal open={open} onClose={onClose} title={<span className="flex items-center gap-2"><Sparkles size={16} className="text-brand-600" />Create task from email</span>} wide>
      {!res ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">Paste an email (or share it from the Gmail app on Android). AI extracts the task, deadline and steps.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <input className="input" placeholder="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            <input className="input" placeholder="From (optional)" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <textarea className="input min-h-48" placeholder="Email text…" value={body} onChange={(e) => setBody(e.target.value)} />
          <Button id="mt-analyze-btn" className="w-full" disabled={busy || (!body.trim() && !subject.trim())} onClick={run}>
            <Wand2 size={15} />{busy ? 'Analysing…' : 'Analyse with AI'}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {warning && <div className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">{warning}</div>}
          <div><label className="label">Title</label><input className="input font-medium" value={res.title} onChange={(e) => setRes({ ...res, title: e.target.value })} /></div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><label className="label">Due date</label><input type="date" className="input" value={date} onChange={(e) => setRes({ ...res, ...dueFromDateTime(e.target.value, time) })} /></div>
            <div><label className="label">Time</label><input type="time" className="input" value={time} disabled={!date} onChange={(e) => setRes({ ...res, ...dueFromDateTime(date, e.target.value) })} /></div>
            <div><label className="label">Priority</label>
              <select className="input" value={res.priority} onChange={(e) => setRes({ ...res, priority: Number(e.target.value) })}>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div><label className="label">List</label>
              <select className="input" value={listId} onChange={(e) => setListId(e.target.value)}>
                <option value="">No list</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">Tags (space separated)</label><input className="input" value={res.tags.join(' ')} onChange={(e) => setRes({ ...res, tags: e.target.value.split(/\s+/).filter(Boolean) })} /></div>
          <div><label className="label">Notes</label><textarea className="input min-h-24" value={res.description} onChange={(e) => setRes({ ...res, description: e.target.value })} /></div>
          {res.subtasks.length > 0 && (
            <div><label className="label">Steps</label>
              <ul className="space-y-1 text-sm">{res.subtasks.map((s, i) => <li key={i} className="flex gap-2"><span className="text-slate-400">☐</span>{s}</li>)}</ul>
            </div>
          )}
          <p className="text-xs text-slate-400">Analysed with {res.provider}{res.model ? ` · ${res.model}` : ''}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setRes(null)}>Back</Button>
            <Button className="flex-1" onClick={save}>Create task</Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
