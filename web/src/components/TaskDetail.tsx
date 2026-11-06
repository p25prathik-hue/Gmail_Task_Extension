import { useEffect, useRef, useState } from 'react'
import { format } from 'date-fns'
import {
  AlarmClock, ArrowLeft, CalendarDays, Copy, ExternalLink, Flag, Hash, Link2, ListChecks, Mail, Plus, Repeat, RotateCcw, Sparkles,
  Star, Timer, Trash2, X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { Recurrence, Status, Subtask, Task } from '../lib/types'
import { PRIORITIES, RECURRENCES, STATUSES } from '../lib/types'
import { dueFromDateTime, quickDates, toDateInput, toLocalDateTimeInput, toTimeInput, uid } from '../lib/taskUtils'
import { Button, IconButton, cx } from './ui'
import { PriorityCheck } from './TaskRow'

function AutoText({ value, onSave, className, placeholder, minRows = 1 }: { value: string; onSave: (v: string) => void; className?: string; placeholder?: string; minRows?: number }) {
  const [v, setV] = useState(value)
  const ref = useRef<HTMLTextAreaElement>(null)
  const timer = useRef<number | undefined>(undefined)
  useEffect(() => { if (document.activeElement !== ref.current) setV(value) }, [value])
  useEffect(() => {
    const el = ref.current
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px` }
  }, [v])
  const commit = (x: string) => { window.clearTimeout(timer.current); if (x !== value) onSave(x) }
  return (
    <textarea
      ref={ref}
      rows={minRows}
      value={v}
      placeholder={placeholder}
      onChange={(e) => { setV(e.target.value); window.clearTimeout(timer.current); const x = e.target.value; timer.current = window.setTimeout(() => commit(x), 700) }}
      onBlur={() => commit(v)}
      className={cx('w-full resize-none bg-transparent outline-none placeholder:text-slate-400', className)}
    />
  )
}

function Row({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="flex w-28 shrink-0 items-center gap-2 pt-1.5 text-xs font-medium text-slate-500">{icon}{label}</div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}

export default function TaskDetail({ task, onClose, mobile }: { task: Task; onClose: () => void; mobile?: boolean }) {
  const { lists, tasks, updateTask, toggleDone, trashTasks, restoreTasks, purgeTasks, duplicateTask, toast } = useStore()
  const [tagInput, setTagInput] = useState('')
  const [newSub, setNewSub] = useState('')
  const up = (patch: Partial<Task>) => updateTask(task.id, patch)
  const allTags = [...new Set(tasks.flatMap((t) => t.tags))].filter((t) => !task.tags.includes(t))
  const tagSuggestions = tagInput ? allTags.filter((t) => t.startsWith(tagInput.toLowerCase())).slice(0, 6) : []

  const setSubs = (subtasks: Subtask[]) => up({ subtasks })
  const addTag = (raw: string) => {
    const t = raw.trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-')
    if (t && !task.tags.includes(t)) up({ tags: [...task.tags, t] })
    setTagInput('')
  }
  const date = toDateInput(task.due_at)
  const time = toTimeInput(task.due_at, task.all_day)
  const subDone = task.subtasks.filter((s) => s.done).length

  return (
    <div className="flex h-full flex-col bg-white dark:bg-slate-900">
      <div className={cx('flex items-center gap-1 border-b border-slate-100 px-3 py-2 dark:border-slate-800', mobile && 'safe-top')}>
        <IconButton title="Close" onClick={onClose}>{mobile ? <ArrowLeft size={18} /> : <X size={18} />}</IconButton>
        <div className="flex-1" />
        <IconButton title={task.starred ? 'Unstar' : 'Star'} onClick={() => up({ starred: !task.starred })} className={task.starred ? 'text-amber-400' : ''}>
          <Star size={17} fill={task.starred ? 'currentColor' : 'none'} />
        </IconButton>
        <IconButton title="Copy link" onClick={() => { navigator.clipboard?.writeText(`${location.origin}${location.pathname}#/task/${task.id}`); toast({ text: 'Link copied' }) }}><Link2 size={17} /></IconButton>
        <IconButton title="Duplicate" onClick={() => duplicateTask(task.id)}><Copy size={17} /></IconButton>
        {task.deleted_at ? (
          <>
            <IconButton title="Restore" onClick={() => restoreTasks([task.id])}><RotateCcw size={17} /></IconButton>
            <IconButton title="Delete forever" className="hover:text-red-600" onClick={() => { if (confirm('Delete forever?')) { purgeTasks([task.id]); onClose() } }}><Trash2 size={17} /></IconButton>
          </>
        ) : (
          <IconButton title="Move to trash" className="hover:text-red-600" onClick={() => { trashTasks([task.id]); onClose() }}><Trash2 size={17} /></IconButton>
        )}
      </div>

      <div className="scroll-thin flex-1 overflow-y-auto px-5 pb-10 pt-4">
        {task.deleted_at && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">This task is in the trash.</div>}
        <div className="flex items-start gap-3">
          <div className="pt-1.5"><PriorityCheck task={task} onToggle={() => toggleDone(task)} size={22} /></div>
          <AutoText value={task.title} onSave={(v) => v.trim() && up({ title: v.trim() })} className={cx('text-xl font-semibold leading-snug', task.status === 'done' && 'text-slate-400 line-through')} />
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button key={s.value} onClick={() => up({ status: s.value as Status })}
              className={cx('rounded-full border px-3 py-1 text-xs font-medium transition', task.status === s.value ? 'border-transparent text-white' : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800')}
              style={task.status === s.value ? { background: s.color } : undefined}>
              {s.label}
            </button>
          ))}
        </div>

        <div className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          <Row icon={<CalendarDays size={14} />} label="Due">
            <div className="flex flex-wrap items-center gap-2">
              <input type="date" className="input !w-auto" value={date} onChange={(e) => up(dueFromDateTime(e.target.value, time))} />
              <input type="time" className="input !w-auto" value={time} disabled={!date} onChange={(e) => up(dueFromDateTime(date, e.target.value))} />
              {task.due_at && <button className="text-xs text-slate-500 hover:text-red-600" onClick={() => up({ due_at: null, all_day: true, recurrence: null })}>Clear</button>}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickDates().map((q) => (
                <button key={q.label} onClick={() => up({ due_at: q.due_at, all_day: true })} className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300">{q.label}</button>
              ))}
            </div>
          </Row>
          <Row icon={<Flag size={14} />} label="Priority">
            <div className="flex flex-wrap gap-1.5">
              {PRIORITIES.map((p) => (
                <button key={p.value} onClick={() => up({ priority: p.value })}
                  className={cx('flex items-center gap-1 rounded-md border px-2 py-1 text-xs', task.priority === p.value ? 'border-transparent font-semibold' : 'border-slate-200 text-slate-500 dark:border-slate-700')}
                  style={task.priority === p.value ? { background: `${p.color}22`, color: p.color } : undefined}>
                  <Flag size={11} fill={p.value ? p.color : 'none'} color={p.color} />{p.label}
                </button>
              ))}
            </div>
          </Row>
          <Row icon={<ListChecks size={14} />} label="List">
            <select className="input" value={task.list_id ?? ''} onChange={(e) => up({ list_id: e.target.value || null })}>
              <option value="">No list</option>
              {lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </Row>
          <Row icon={<Repeat size={14} />} label="Repeat">
            <select className="input" value={task.recurrence ?? ''} onChange={(e) => {
              const r = (e.target.value || null) as Recurrence | null
              const patch: Partial<Task> = { recurrence: r }
              if (r && !task.due_at) { const d = new Date(); d.setHours(9, 0, 0, 0); patch.due_at = d.toISOString(); patch.all_day = true }
              up(patch)
            }}>
              <option value="">Does not repeat</option>
              {RECURRENCES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Row>
          <Row icon={<AlarmClock size={14} />} label="Reminder">
            <div className="flex items-center gap-2">
              <input type="datetime-local" className="input" value={toLocalDateTimeInput(task.remind_at)} onChange={(e) => up({ remind_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              {task.remind_at && <IconButton title="Clear reminder" onClick={() => up({ remind_at: null })}><X size={14} /></IconButton>}
            </div>
          </Row>
          <Row icon={<Hash size={14} />} label="Tags">
            <div className="flex flex-wrap items-center gap-1.5">
              {task.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  #{t}<button onClick={() => up({ tags: task.tags.filter((x) => x !== t) })} className="text-slate-400 hover:text-red-500"><X size={11} /></button>
                </span>
              ))}
              <div className="relative">
                <input value={tagInput} onChange={(e) => setTagInput(e.target.value)} placeholder="Add tag"
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(tagInput) } }}
                  onBlur={() => tagInput && addTag(tagInput)}
                  className="w-24 bg-transparent py-1 text-xs outline-none" />
                {tagSuggestions.length > 0 && (
                  <div className="absolute left-0 top-7 z-10 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-800">
                    {tagSuggestions.map((s) => <button key={s} onMouseDown={(e) => { e.preventDefault(); addTag(s) }} className="block w-full px-3 py-1 text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-700">#{s}</button>)}
                  </div>
                )}
              </div>
            </div>
          </Row>
          <Row icon={<Timer size={14} />} label="Estimate">
            <div className="flex items-center gap-2">
              <input type="number" min={0} step={5} className="input !w-24" value={task.estimate_minutes ?? ''} placeholder="—"
                onChange={(e) => up({ estimate_minutes: e.target.value ? Number(e.target.value) : null })} />
              <span className="text-xs text-slate-500">minutes</span>
            </div>
          </Row>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-sm font-semibold">Subtasks</h4>
            {task.subtasks.length > 0 && <span className="text-xs text-slate-500">{subDone}/{task.subtasks.length}</span>}
          </div>
          {task.subtasks.length > 0 && (
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${(subDone / task.subtasks.length) * 100}%` }} />
            </div>
          )}
          <div className="space-y-0.5">
            {task.subtasks.map((s, i) => (
              <div key={s.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                <input type="checkbox" checked={s.done} className="h-4 w-4 accent-emerald-500"
                  onChange={() => setSubs(task.subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} />
                <input defaultValue={s.title} className={cx('min-w-0 flex-1 bg-transparent text-sm outline-none', s.done && 'text-slate-400 line-through')}
                  onBlur={(e) => e.target.value !== s.title && setSubs(task.subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))}
                  onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
                <div className="flex opacity-0 group-hover:opacity-100">
                  {i > 0 && <button className="px-1 text-xs text-slate-400" title="Move up" onClick={() => { const a = [...task.subtasks];[a[i - 1], a[i]] = [a[i], a[i - 1]]; setSubs(a) }}>↑</button>}
                  <button className="px-1 text-slate-400 hover:text-red-500" title="Remove" onClick={() => setSubs(task.subtasks.filter((x) => x.id !== s.id))}><X size={13} /></button>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex items-center gap-2 px-1">
            <Plus size={15} className="text-slate-400" />
            <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Add a step"
              onKeyDown={(e) => { if (e.key === 'Enter' && newSub.trim()) { setSubs([...task.subtasks, { id: uid(), title: newSub.trim(), done: false }]); setNewSub('') } }}
              className="flex-1 bg-transparent py-1 text-sm outline-none" />
          </div>
        </div>

        <div className="mt-6">
          <h4 className="mb-2 text-sm font-semibold">Notes</h4>
          <AutoText value={task.notes} onSave={(v) => up({ notes: v })} placeholder="Add details, links, context…" minRows={4}
            className="rounded-lg border border-slate-200 p-3 text-sm leading-relaxed dark:border-slate-700" />
        </div>

        {(task.source === 'gmail' || task.email_subject) && (
          <div className="mt-6 rounded-xl border border-rose-100 bg-rose-50/50 p-4 dark:border-rose-500/20 dark:bg-rose-500/5">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300"><Mail size={15} /> From Gmail</div>
            <div className="text-sm font-medium">{task.email_subject}</div>
            <div className="text-xs text-slate-500">
              {task.email_from_name} {task.email_from_address && `<${task.email_from_address}>`}
              {task.email_date && ` · ${format(new Date(task.email_date), 'd MMM yyyy, h:mm a')}`}
            </div>
            {task.ai_summary && (
              <div className="mt-3 flex gap-2 rounded-lg bg-white/70 p-2.5 text-sm dark:bg-slate-900/60">
                <Sparkles size={14} className="mt-0.5 shrink-0 text-brand-500" /><span>{task.ai_summary}</span>
              </div>
            )}
            {task.email_snippet && !task.ai_summary && <p className="mt-2 line-clamp-4 text-sm text-slate-600 dark:text-slate-400">{task.email_snippet}</p>}
            {task.email_url && (
              <Button variant="outline" size="sm" className="mt-3" onClick={() => window.open(task.email_url!, '_blank')}>
                <ExternalLink size={13} /> Open email in Gmail
              </Button>
            )}
          </div>
        )}

        <div className="mt-8 space-y-0.5 text-xs text-slate-400">
          <div>Created {format(new Date(task.created_at), 'd MMM yyyy, h:mm a')} {task.source !== 'manual' && `via ${task.source}`}</div>
          <div>Updated {format(new Date(task.updated_at), 'd MMM yyyy, h:mm a')}</div>
          {task.completed_at && <div>Completed {format(new Date(task.completed_at), 'd MMM yyyy, h:mm a')}</div>}
        </div>
      </div>
    </div>
  )
}
