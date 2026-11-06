import { forwardRef, useMemo, useState } from 'react'
import { CalendarDays, Flag, Hash, List as ListIcon, Plus, Repeat, Sparkles, Star } from 'lucide-react'
import { useStore } from '../lib/store'
import type { NewTask } from '../lib/store'
import { formatDue, parseQuickAdd } from '../lib/taskUtils'
import { PRIORITIES, RECURRENCES } from '../lib/types'
import { Chip, cx } from './ui'

export function useViewDefaults(): Partial<NewTask> {
  const { view, settings } = useStore()
  const d: Partial<NewTask> = {}
  if (view.startsWith('list:')) d.list_id = view.slice(5)
  else d.list_id = settings?.default_list_id ?? null
  if (view.startsWith('tag:')) d.tags = [view.slice(4)]
  if (view === 'today') { const x = new Date(); x.setHours(9, 0, 0, 0); d.due_at = x.toISOString(); d.all_day = true }
  if (view === 'starred') d.starred = true
  return d
}

interface Props { onCreated?: () => void; autoFocus?: boolean; onAI?: () => void; className?: string; dueOverride?: string | null }

const QuickAdd = forwardRef<HTMLInputElement, Props>(function QuickAdd({ onCreated, autoFocus, onAI, className, dueOverride }, ref) {
  const { lists, createTask } = useStore()
  const defaults = useViewDefaults()
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseQuickAdd(text, lists), [text, lists])
  const list = lists.find((l) => l.id === (parsed.list_id ?? defaults.list_id))

  async function submit() {
    if (!parsed.title) return
    const t: NewTask = {
      ...defaults,
      title: parsed.title,
      ...(dueOverride ? { due_at: dueOverride, all_day: true } : {}),
      ...(parsed.due_at ? { due_at: parsed.due_at, all_day: parsed.all_day } : {}),
      ...(parsed.priority !== null ? { priority: parsed.priority } : {}),
      ...(parsed.list_id ? { list_id: parsed.list_id } : {}),
      ...(parsed.starred ? { starred: true } : {}),
      ...(parsed.recurrence ? { recurrence: parsed.recurrence } : {}),
      tags: [...new Set([...(defaults.tags ?? []), ...parsed.tags])],
    }
    setText('')
    await createTask(t)
    onCreated?.()
  }

  const hasMeta = text && (parsed.due_at || parsed.priority !== null || parsed.tags.length || parsed.list_id || parsed.starred || parsed.recurrence)

  return (
    <div className={cx('card overflow-hidden shadow-sm focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/15', className)}>
      <div className="flex items-center gap-2 px-3">
        <Plus size={18} className="shrink-0 text-brand-600" />
        <input
          ref={ref}
          autoFocus={autoFocus}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') (e.target as HTMLInputElement).blur() }}
          placeholder='Add a task… try "Submit report fri 5pm #college !high @Work"'
          className="min-w-0 flex-1 bg-transparent py-3 text-sm outline-none placeholder:text-slate-400"
        />
        {onAI && (
          <button onClick={onAI} title="Create from email text with AI"
            className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/10">
            <Sparkles size={14} /> <span className="hidden sm:inline">From email</span>
          </button>
        )}
      </div>
      {hasMeta ? (
        <div className="flex flex-wrap gap-1.5 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
          {parsed.due_at && <Chip color="#4f46e5"><CalendarDays size={11} />{formatDue(parsed)}</Chip>}
          {parsed.recurrence && <Chip color="#0891b2"><Repeat size={11} />{RECURRENCES.find((r) => r.value === parsed.recurrence)?.label}</Chip>}
          {parsed.priority !== null && <Chip color={PRIORITIES[parsed.priority].color}><Flag size={11} />{PRIORITIES[parsed.priority].label}</Chip>}
          {parsed.list_id && list && <Chip color={list.color}><ListIcon size={11} />{list.name}</Chip>}
          {parsed.tags.map((t) => <Chip key={t} color="#64748b"><Hash size={11} />{t}</Chip>)}
          {parsed.starred && <Chip color="#f59e0b"><Star size={11} />Starred</Chip>}
        </div>
      ) : null}
    </div>
  )
})

export default QuickAdd
