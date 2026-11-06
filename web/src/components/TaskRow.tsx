import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { Check, CheckCircle2, GripVertical, ListChecks, Mail, Repeat, Star, Trash2, AlarmClock, StickyNote } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Task } from '../lib/types'
import { PRIORITIES } from '../lib/types'
import { formatDue, isOverdue } from '../lib/taskUtils'
import { tap } from '../lib/platform'
import { Chip, cx } from './ui'

export function PriorityCheck({ task, onToggle, size = 20 }: { task: Task; onToggle: () => void; size?: number }) {
  const color = PRIORITIES[task.priority]?.color ?? '#94a3b8'
  const done = task.status === 'done'
  return (
    <button
      onClick={(e) => { e.stopPropagation(); tap(); onToggle() }}
      title={done ? 'Mark as not done' : 'Complete'}
      className="group/check flex shrink-0 items-center justify-center rounded-full border-2 transition"
      style={{ width: size, height: size, borderColor: color, background: done ? color : task.priority ? `${color}14` : undefined }}
    >
      <Check size={size - 8} strokeWidth={3} className={cx('transition', done ? 'text-white' : 'opacity-0 group-hover/check:opacity-60')} style={{ color: done ? '#fff' : color }} />
    </button>
  )
}

export function TaskMeta({ task, showList = true }: { task: Task; showList?: boolean }) {
  const { lists } = useStore()
  const list = lists.find((l) => l.id === task.list_id)
  const done = task.subtasks.filter((s) => s.done).length
  const overdue = isOverdue(task)
  const items = []
  if (task.due_at) items.push(
    <span key="due" className={cx('inline-flex items-center gap-1', overdue ? 'font-medium text-red-600 dark:text-red-400' : 'text-slate-500')}>
      {task.recurrence ? <Repeat size={11} /> : null}{formatDue(task)}
    </span>,
  )
  if (task.remind_at) items.push(<AlarmClock key="rem" size={12} className="text-slate-400" />)
  if (task.subtasks.length) items.push(<span key="sub" className="inline-flex items-center gap-0.5 text-slate-500"><ListChecks size={12} />{done}/{task.subtasks.length}</span>)
  if (task.notes) items.push(<StickyNote key="n" size={12} className="text-slate-400" />)
  if (task.source === 'gmail') items.push(<span key="m" className="inline-flex items-center gap-0.5 text-rose-500" title={task.email_subject ?? ''}><Mail size={12} />{task.email_from_name?.split(' ')[0] ?? 'Gmail'}</span>)
  if (showList && list) items.push(<span key="l" className="inline-flex items-center gap-1 text-slate-500"><span className="h-2 w-2 rounded-full" style={{ background: list.color }} />{list.name}</span>)
  for (const t of task.tags.slice(0, 4)) items.push(<Chip key={`t${t}`} className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">#{t}</Chip>)
  if (!items.length) return null
  return <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">{items}</div>
}

interface Props {
  task: Task
  dragHandle?: { attributes: object; listeners?: object }
  style?: CSSProperties
  innerRef?: (el: HTMLElement | null) => void
  mobile?: boolean
}

export default function TaskRow({ task, dragHandle, style, innerRef, mobile }: Props) {
  const { toggleDone, setUI, openTaskId, selected, updateTask, trashTasks } = useStore()
  const isSel = selected.has(task.id)
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number; locked?: 'h' | 'v' } | null>(null)

  const onClick = (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || selected.size) {
      const next = new Set(selected)
      if (next.has(task.id)) next.delete(task.id); else next.add(task.id)
      setUI({ selected: next })
      return
    }
    setUI({ openTaskId: task.id })
  }

  const touch = mobile ? {
    onTouchStart: (e: React.TouchEvent) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } },
    onTouchMove: (e: React.TouchEvent) => {
      const s = start.current
      if (!s) return
      const mx = e.touches[0].clientX - s.x, my = e.touches[0].clientY - s.y
      if (!s.locked) s.locked = Math.abs(mx) > Math.abs(my) + 4 ? 'h' : Math.abs(my) > 6 ? 'v' : undefined
      if (s.locked === 'h') setDx(Math.max(-140, Math.min(140, mx)))
    },
    onTouchEnd: () => {
      if (dx > 90) toggleDone(task)
      else if (dx < -90) { tap(); trashTasks([task.id]) }
      setDx(0)
      start.current = null
    },
  } : {}

  return (
    <div ref={innerRef} style={style} className="relative overflow-hidden">
      {mobile && dx !== 0 && (
        <div className={cx('absolute inset-0 flex items-center px-5 text-white', dx > 0 ? 'justify-start bg-emerald-500' : 'justify-end bg-red-500')}>
          {dx > 0 ? <CheckCircle2 size={22} /> : <Trash2 size={22} />}
        </div>
      )}
      <div
        {...touch}
        onClick={onClick}
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform .2s' }}
        className={cx(
          'group relative flex cursor-pointer items-start gap-3 border-b border-slate-100 bg-white px-4 py-2.5 dark:border-slate-800/70 dark:bg-slate-900',
          openTaskId === task.id && 'bg-brand-50/70 dark:bg-brand-500/10',
          isSel && 'bg-brand-50 ring-1 ring-inset ring-brand-400 dark:bg-brand-500/15',
          !mobile && 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
        )}
      >
        {dragHandle && (
          <span {...dragHandle.attributes} {...dragHandle.listeners} onClick={(e) => e.stopPropagation()}
            className="-ml-3 mt-0.5 cursor-grab text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600">
            <GripVertical size={16} />
          </span>
        )}
        <div className="pt-0.5"><PriorityCheck task={task} onToggle={() => toggleDone(task)} /></div>
        <div className="min-w-0 flex-1">
          <div className={cx('text-[15px] leading-snug md:text-sm', task.status === 'done' && 'text-slate-400 line-through')}>
            {task.title}
            {task.status === 'in_progress' && <Chip color="#3b82f6" className="ml-2 align-middle">In progress</Chip>}
            {task.status === 'waiting' && <Chip color="#a855f7" className="ml-2 align-middle">Waiting</Chip>}
          </div>
          <TaskMeta task={task} />
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); updateTask(task.id, { starred: !task.starred }) }}
          className={cx('mt-0.5 shrink-0 transition', task.starred ? 'text-amber-400' : 'text-slate-300 opacity-0 group-hover:opacity-100 dark:text-slate-600', mobile && !task.starred && 'hidden')}
          title="Star"
        >
          <Star size={16} fill={task.starred ? 'currentColor' : 'none'} />
        </button>
        {!mobile && (
          <button onClick={(e) => { e.stopPropagation(); trashTasks([task.id]) }} title="Delete"
            className="mt-0.5 shrink-0 text-slate-300 opacity-0 transition hover:text-red-500 group-hover:opacity-100 dark:text-slate-600">
            <Trash2 size={16} />
          </button>
        )}
      </div>
    </div>
  )
}
