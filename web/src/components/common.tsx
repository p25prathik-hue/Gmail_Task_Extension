import { useMemo } from 'react'
import { subDays } from 'date-fns'
import {
  AlertTriangle, Briefcase, CalendarClock, CalendarDays, CheckCircle2, CircleSlash, GraduationCap, Hash, Inbox, List as ListIcon, Mail, Star, Sun, Trash2, User,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { List, SmartView, Task, ViewKey } from '../lib/types'
import { PRIORITIES, STATUSES } from '../lib/types'
import { matchesSearch, matchesView, sortTasks } from '../lib/taskUtils'
import { Button } from './ui'

export const SMART: { key: SmartView; label: string; icon: React.ReactNode; color: string }[] = [
  { key: 'today', label: 'Today', icon: <Sun size={16} />, color: '#f59e0b' },
  { key: 'upcoming', label: 'Next 7 days', icon: <CalendarClock size={16} />, color: '#0ea5e9' },
  { key: 'all', label: 'All open', icon: <Inbox size={16} />, color: '#6366f1' },
  { key: 'overdue', label: 'Overdue', icon: <AlertTriangle size={16} />, color: '#ef4444' },
  { key: 'starred', label: 'Starred', icon: <Star size={16} />, color: '#eab308' },
  { key: 'gmail', label: 'From Gmail', icon: <Mail size={16} />, color: '#e11d48' },
  { key: 'nodate', label: 'No date', icon: <CircleSlash size={16} />, color: '#64748b' },
  { key: 'completed', label: 'Completed', icon: <CheckCircle2 size={16} />, color: '#22c55e' },
  { key: 'trash', label: 'Trash', icon: <Trash2 size={16} />, color: '#94a3b8' },
]

export function listIcon(l: List, size = 16) {
  const p = { size, style: { color: l.color } }
  switch (l.icon) {
    case 'inbox': return <Inbox {...p} />
    case 'briefcase': return <Briefcase {...p} />
    case 'user': return <User {...p} />
    case 'graduation-cap': return <GraduationCap {...p} />
    default: return <ListIcon {...p} />
  }
}

export function viewTitle(view: ViewKey, lists: List[]) {
  if (view.startsWith('list:')) return lists.find((l) => l.id === view.slice(5))?.name ?? 'List'
  if (view.startsWith('tag:')) return `#${view.slice(4)}`
  return SMART.find((s) => s.key === view)?.label ?? 'Tasks'
}

export function useCounts() {
  const { tasks } = useStore()
  return useMemo(() => {
    const c: Record<string, number> = {}
    const now = new Date()
    for (const s of SMART) if (s.key !== 'completed' && s.key !== 'trash') c[s.key] = tasks.filter((t) => matchesView(t, s.key, now)).length
    c.trash = tasks.filter((t) => t.deleted_at).length
    for (const t of tasks) {
      if (t.deleted_at || t.status === 'done') continue
      if (t.list_id) c[`list:${t.list_id}`] = (c[`list:${t.list_id}`] ?? 0) + 1
      for (const g of t.tags) c[`tag:${g}`] = (c[`tag:${g}`] ?? 0) + 1
    }
    return c
  }, [tasks])
}

export function useAllTags() {
  const { tasks } = useStore()
  return useMemo(() => {
    const m = new Map<string, number>()
    for (const t of tasks) if (!t.deleted_at) for (const g of t.tags) m.set(g, (m.get(g) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
  }, [tasks])
}

/** Tasks for the current view/search/sort, honoring "show completed". */
export function useVisibleTasks(forBoard = false): Task[] {
  const { tasks, view, search, sort, showCompleted, lists } = useStore()
  return useMemo(() => {
    const now = new Date()
    const weekAgo = subDays(now, 7)
    let out: Task[]
    const isCollection = view.startsWith('list:') || view.startsWith('tag:') || view === 'completed' || view === 'trash'
    if (isCollection) {
      out = tasks.filter((t) => matchesView(t, view, now))
      if (!showCompleted && view !== 'completed' && view !== 'trash' && !forBoard) out = out.filter((t) => t.status !== 'done')
      if (forBoard) out = out.filter((t) => t.status !== 'done' || (t.completed_at && new Date(t.completed_at) > weekAgo))
    } else {
      out = tasks.filter((t) => matchesView(t, view, now))
      if (showCompleted || forBoard) {
        const extra = tasks.filter((t) => !t.deleted_at && t.status === 'done' && t.completed_at && new Date(t.completed_at) > weekAgo &&
          matchesView({ ...t, status: 'todo' }, view, now))
        out = [...out, ...extra]
      }
    }
    out = out.filter((t) => matchesSearch(t, search, lists))
    return sortTasks(out, view === 'completed' ? 'created' : sort)
  }, [tasks, view, search, sort, showCompleted, lists, forBoard])
}

export function BulkBar() {
  const { selected, setUI, updateMany, trashTasks, lists, view, restoreTasks, purgeTasks } = useStore()
  if (!selected.size) return null
  const ids = [...selected]
  return (
    <div className="anim-pop fixed bottom-20 left-1/2 z-40 flex -translate-x-1/2 flex-wrap items-center gap-2 rounded-2xl bg-slate-900 px-4 py-2.5 text-sm text-white shadow-2xl md:bottom-6">
      <span className="font-medium">{ids.length} selected</span>
      {view === 'trash' ? (
        <>
          <Button size="sm" variant="soft" onClick={() => { restoreTasks(ids); setUI({ selected: new Set() }) }}>Restore</Button>
          <Button size="sm" variant="danger" onClick={() => { if (confirm('Delete forever?')) { purgeTasks(ids); setUI({ selected: new Set() }) } }}>Delete forever</Button>
        </>
      ) : (
        <>
          <Button size="sm" variant="soft" onClick={() => { updateMany(ids, { status: 'done' }); setUI({ selected: new Set() }) }}>Complete</Button>
          <select className="rounded-md bg-slate-800 px-2 py-1 text-xs" value="" onChange={(e) => updateMany(ids, { list_id: e.target.value || null })}>
            <option value="">Move to…</option>{lists.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
          <select className="rounded-md bg-slate-800 px-2 py-1 text-xs" value="" onChange={(e) => updateMany(ids, { priority: Number(e.target.value) })}>
            <option value="">Priority…</option>{PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select className="rounded-md bg-slate-800 px-2 py-1 text-xs" value="" onChange={(e) => updateMany(ids, { status: e.target.value as Task['status'] })}>
            <option value="">Status…</option>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <Button size="sm" variant="danger" onClick={() => trashTasks(ids)}>Delete</Button>
        </>
      )}
      <button className="ml-1 text-slate-400 hover:text-white" onClick={() => setUI({ selected: new Set() })}>Cancel</button>
    </div>
  )
}

export function TagIcon() { return <Hash size={16} className="text-slate-400" /> }
export const CalIcon = CalendarDays
