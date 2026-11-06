import {
  addDays, differenceInCalendarDays, endOfDay, format, isBefore, isSameYear, isToday, isTomorrow, isYesterday, startOfDay,
} from 'date-fns'
import * as chrono from 'chrono-node'
import type { GroupKey, List, Recurrence, SortKey, Task, ViewKey } from './types'
import { PRIORITIES, STATUSES } from './types'

export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36))

export const isOpen = (t: Task) => t.status !== 'done' && !t.deleted_at
export const isOverdue = (t: Task, now = new Date()) => {
  if (!t.due_at || t.status === 'done') return false
  const d = new Date(t.due_at)
  return t.all_day ? isBefore(endOfDay(d), now) && !isToday(d) : isBefore(d, now)
}

export function formatDue(t: Pick<Task, 'due_at' | 'all_day'>): string {
  if (!t.due_at) return ''
  const d = new Date(t.due_at)
  let day: string
  if (isToday(d)) day = 'Today'
  else if (isTomorrow(d)) day = 'Tomorrow'
  else if (isYesterday(d)) day = 'Yesterday'
  else {
    const diff = differenceInCalendarDays(d, new Date())
    if (diff > 0 && diff < 7) day = format(d, 'EEEE')
    else day = format(d, isSameYear(d, new Date()) ? 'd MMM' : 'd MMM yyyy')
  }
  return t.all_day ? day : `${day}, ${format(d, 'h:mm a')}`
}

export function matchesView(t: Task, view: ViewKey, now = new Date()): boolean {
  if (view === 'trash') return !!t.deleted_at
  if (t.deleted_at) return false
  if (view === 'completed') return t.status === 'done'
  if (view.startsWith('list:')) return t.list_id === view.slice(5)
  if (view.startsWith('tag:')) return t.tags.includes(view.slice(4))
  if (t.status === 'done') return false
  const due = t.due_at ? new Date(t.due_at) : null
  switch (view) {
    case 'all': return true
    case 'today': return !!due && due <= endOfDay(now)
    case 'upcoming': return !!due && due > endOfDay(now) && due <= endOfDay(addDays(now, 7))
    case 'overdue': return isOverdue(t, now)
    case 'starred': return t.starred
    case 'gmail': return t.source === 'gmail'
    case 'nodate': return !due
    default: return true
  }
}

export function matchesSearch(t: Task, q: string, lists: List[]): boolean {
  if (!q.trim()) return true
  const list = lists.find((l) => l.id === t.list_id)?.name ?? ''
  const hay = [t.title, t.notes, t.email_subject, t.email_from_name, t.email_from_address, t.ai_summary, list, ...t.tags,
    ...t.subtasks.map((s) => s.title)].join(' ').toLowerCase()
  return q.toLowerCase().split(/\s+/).filter(Boolean).every((w) => hay.includes(w.replace(/^#/, '')))
}

export function sortTasks(tasks: Task[], sort: SortKey): Task[] {
  const arr = [...tasks]
  const dueVal = (t: Task) => (t.due_at ? new Date(t.due_at).getTime() : Number.POSITIVE_INFINITY)
  const doneLast = (a: Task, b: Task) => Number(a.status === 'done') - Number(b.status === 'done')
  arr.sort((a, b) => {
    const d = doneLast(a, b)
    if (d) return d
    switch (sort) {
      case 'due': return dueVal(a) - dueVal(b) || b.priority - a.priority
      case 'priority': return b.priority - a.priority || dueVal(a) - dueVal(b)
      case 'created': return b.created_at.localeCompare(a.created_at)
      case 'title': return a.title.localeCompare(b.title)
      case 'manual': return a.position - b.position || a.created_at.localeCompare(b.created_at)
      default: // smart: starred, overdue, due soon, priority
        return Number(b.starred) - Number(a.starred) || dueVal(a) - dueVal(b) || b.priority - a.priority ||
          b.created_at.localeCompare(a.created_at)
    }
  })
  return arr
}

export interface Group { key: string; label: string; color?: string; tasks: Task[] }

export function groupTasks(tasks: Task[], group: GroupKey, lists: List[]): Group[] {
  if (group === 'none') return [{ key: 'all', label: '', tasks }]
  const map = new Map<string, Group>()
  const push = (key: string, label: string, t: Task, color?: string, order?: number) => {
    if (!map.has(key)) map.set(key, { key: `${String(order ?? 0).padStart(4, '0')}|${key}`, label, color, tasks: [] })
    map.get(key)!.tasks.push(t)
  }
  const now = new Date()
  for (const t of tasks) {
    if (group === 'due') {
      if (t.status === 'done') { push('done', 'Completed', t, undefined, 9); continue }
      if (!t.due_at) { push('none', 'No date', t, undefined, 8); continue }
      const d = new Date(t.due_at)
      if (isOverdue(t, now)) push('overdue', 'Overdue', t, '#ef4444', 0)
      else if (isToday(d)) push('today', 'Today', t, '#6366f1', 1)
      else if (isTomorrow(d)) push('tomorrow', 'Tomorrow', t, undefined, 2)
      else if (d <= endOfDay(addDays(now, 7))) push('week', 'Next 7 days', t, undefined, 3)
      else push('later', 'Later', t, undefined, 4)
    } else if (group === 'list') {
      const l = lists.find((x) => x.id === t.list_id)
      push(l?.id ?? 'none', l?.name ?? 'No list', t, l?.color, l ? Math.round(l.position) + 1 : 999)
    } else if (group === 'priority') {
      const p = PRIORITIES[t.priority] ?? PRIORITIES[0]
      push(String(p.value), `${p.label} priority`, t, p.color, 10 - p.value)
    } else if (group === 'status') {
      const s = STATUSES.find((x) => x.value === t.status)!
      push(s.value, s.label, t, s.color, STATUSES.indexOf(s))
    }
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key))
}

// ---------------------------------------------------------------- quick add parser
export interface ParsedQuick {
  title: string
  due_at: string | null
  all_day: boolean
  priority: number | null
  tags: string[]
  list_id: string | null
  starred: boolean
  recurrence: Recurrence | null
}

const PRIORITY_WORDS: Record<string, number> = { urgent: 4, high: 3, med: 2, medium: 2, low: 1, none: 0 }

export function parseQuickAdd(input: string, lists: List[]): ParsedQuick {
  let text = ` ${input} `
  const tags: string[] = []
  let priority: number | null = null
  let list_id: string | null = null
  let starred = false
  let recurrence: Recurrence | null = null

  text = text.replace(/\s#([\p{L}\p{N}_-]+)/gu, (_, t: string) => { tags.push(t.toLowerCase()); return ' ' })
  text = text.replace(/\s!(urgent|high|medium|med|low|none|[0-4])\b/gi, (_, p: string) => {
    priority = /\d/.test(p) ? Number(p) : PRIORITY_WORDS[p.toLowerCase()]
    return ' '
  })
  text = text.replace(/\s!!+(?=\s)/g, () => { priority = 4; return ' ' })
  text = text.replace(/\s@([\p{L}\p{N}_-]+)/gu, (m, name: string) => {
    const l = lists.find((x) => x.name.toLowerCase() === name.toLowerCase()) ??
      lists.find((x) => x.name.toLowerCase().startsWith(name.toLowerCase()))
    if (l) { list_id = l.id; return ' ' }
    return m
  })
  text = text.replace(/\s\*(?=\s)/g, () => { starred = true; return ' ' })
  const rec: [RegExp, Recurrence][] = [
    [/\bevery\s+weekday\b/i, 'weekdays'], [/\b(every\s+day|daily)\b/i, 'daily'], [/\b(every\s+week|weekly)\b/i, 'weekly'],
    [/\b(every\s+month|monthly)\b/i, 'monthly'], [/\b(every\s+year|yearly|annually)\b/i, 'yearly'],
  ]
  for (const [re, r] of rec) if (re.test(text)) { recurrence = r; text = text.replace(re, ' '); break }

  let due_at: string | null = null
  let all_day = true
  const results = chrono.parse(text, new Date(), { forwardDate: true })
  if (results.length) {
    const r = results[0]
    const d = r.start.date()
    all_day = !r.start.isCertain('hour')
    if (all_day) d.setHours(9, 0, 0, 0)
    due_at = d.toISOString()
    text = text.slice(0, r.index) + ' ' + text.slice(r.index + r.text.length)
  }
  if (recurrence && !due_at) { const d = new Date(); d.setHours(9, 0, 0, 0); due_at = d.toISOString() }
  const title = text.replace(/\s+/g, ' ').trim()
  return { title, due_at, all_day, priority, tags, list_id, starred, recurrence }
}

export function dueFromDateTime(date: string, time: string): { due_at: string | null; all_day: boolean } {
  if (!date) return { due_at: null, all_day: true }
  const [y, m, d] = date.split('-').map(Number)
  if (!time) return { due_at: new Date(y, m - 1, d, 9, 0, 0).toISOString(), all_day: true }
  const [hh, mm] = time.split(':').map(Number)
  return { due_at: new Date(y, m - 1, d, hh, mm, 0).toISOString(), all_day: false }
}

export const toDateInput = (iso: string | null) => (iso ? format(new Date(iso), 'yyyy-MM-dd') : '')
export const toTimeInput = (iso: string | null, allDay: boolean) => (iso && !allDay ? format(new Date(iso), 'HH:mm') : '')
export const toLocalDateTimeInput = (iso: string | null) => (iso ? format(new Date(iso), "yyyy-MM-dd'T'HH:mm") : '')

export const quickDates = () => {
  const today = startOfDay(new Date())
  const at9 = (d: Date) => { const x = new Date(d); x.setHours(9, 0, 0, 0); return x.toISOString() }
  const nextMon = addDays(today, ((8 - today.getDay()) % 7) || 7)
  return [
    { label: 'Today', due_at: at9(today) },
    { label: 'Tomorrow', due_at: at9(addDays(today, 1)) },
    { label: 'Next week', due_at: at9(nextMon) },
    { label: 'In 2 weeks', due_at: at9(addDays(today, 14)) },
  ]
}

export function toCSV(tasks: Task[], lists: List[]): string {
  const cols = ['title', 'status', 'priority', 'due_at', 'list', 'tags', 'notes', 'email_subject', 'email_from_address', 'email_url', 'created_at', 'completed_at']
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const rows = tasks.map((t) => [t.title, t.status, PRIORITIES[t.priority]?.label, t.due_at, lists.find((l) => l.id === t.list_id)?.name,
    t.tags.join(' '), t.notes, t.email_subject, t.email_from_address, t.email_url, t.created_at, t.completed_at].map(esc).join(','))
  return [cols.join(','), ...rows].join('\n')
}

export function download(name: string, content: string, type = 'text/plain') {
  const blob = new Blob([content], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
