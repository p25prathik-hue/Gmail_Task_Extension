import { useState } from 'react'
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Task } from '../lib/types'
import { PRIORITIES } from '../lib/types'
import { isOverdue } from '../lib/taskUtils'
import TaskRow from './TaskRow'
import { Button, IconButton, cx } from './ui'

export default function CalendarView({ tasks, mobile }: { tasks: Task[]; mobile?: boolean }) {
  const { setUI, updateTask, createTask, settings } = useStore()
  const [month, setMonth] = useState(startOfMonth(new Date()))
  const [selDay, setSelDay] = useState<Date>(new Date())
  const [dragId, setDragId] = useState<string | null>(null)
  const start = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
  const end = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
  const days: Date[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
  const dated = tasks.filter((t) => t.due_at)
  const onDay = (d: Date) => dated.filter((t) => isSameDay(new Date(t.due_at!), d))

  const moveTo = (id: string, d: Date) => {
    const t = tasks.find((x) => x.id === id)
    if (!t) return
    const old = t.due_at ? new Date(t.due_at) : null
    const nd = new Date(d)
    if (old && !t.all_day) nd.setHours(old.getHours(), old.getMinutes(), 0, 0); else nd.setHours(9, 0, 0, 0)
    updateTask(id, { due_at: nd.toISOString() })
  }

  const header = (
    <div className="mb-3 flex items-center gap-2">
      <h2 className="text-lg font-semibold">{format(month, 'MMMM yyyy')}</h2>
      <div className="flex-1" />
      <IconButton title="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft size={18} /></IconButton>
      <Button variant="outline" size="sm" onClick={() => { setMonth(startOfMonth(new Date())); setSelDay(new Date()) }}>Today</Button>
      <IconButton title="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight size={18} /></IconButton>
    </div>
  )
  const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

  if (mobile) {
    const sel = onDay(selDay)
    return (
      <div>
        {header}
        <div className="grid grid-cols-7 text-center text-[11px] font-medium text-slate-400">{weekdays.map((w) => <div key={w}>{w[0]}</div>)}</div>
        <div className="mt-1 grid grid-cols-7 gap-y-1">
          {days.map((d) => {
            const ts = onDay(d)
            const active = isSameDay(d, selDay)
            return (
              <button key={d.toISOString()} onClick={() => setSelDay(d)} className="flex flex-col items-center py-1">
                <span className={cx('flex h-8 w-8 items-center justify-center rounded-full text-sm', !isSameMonth(d, month) && 'text-slate-300 dark:text-slate-600',
                  isToday(d) && !active && 'font-bold text-brand-600', active && 'bg-brand-600 font-semibold text-white')}>{format(d, 'd')}</span>
                <span className="mt-0.5 flex h-1.5 gap-0.5">
                  {ts.slice(0, 3).map((t) => <span key={t.id} className="h-1.5 w-1.5 rounded-full" style={{ background: t.status === 'done' ? '#cbd5e1' : PRIORITIES[t.priority].color }} />)}
                </span>
              </button>
            )
          })}
        </div>
        <div className="mt-4 mb-2 flex items-center justify-between">
          <div className="text-sm font-semibold">{format(selDay, 'EEEE, d MMMM')}</div>
          <button className="text-sm font-medium text-brand-600" onClick={async () => {
            const title = prompt('New task')
            if (title) { const d = new Date(selDay); d.setHours(9, 0, 0, 0); await createTask({ title, due_at: d.toISOString(), all_day: true, list_id: settings?.default_list_id ?? null }) }
          }}>+ Add</button>
        </div>
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
          {sel.length ? sel.map((t) => <TaskRow key={t.id} task={t} mobile />) : <div className="p-6 text-center text-sm text-slate-400">Nothing scheduled</div>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      {header}
      <div className="grid grid-cols-7 border-b border-slate-200 pb-1 text-xs font-medium text-slate-500 dark:border-slate-800">
        {weekdays.map((w) => <div key={w} className="px-2">{w}</div>)}
      </div>
      <div className="grid flex-1 auto-rows-fr grid-cols-7 border-l border-slate-200 dark:border-slate-800">
        {days.map((d) => {
          const ts = onDay(d)
          return (
            <div
              key={d.toISOString()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragId) moveTo(dragId, d); setDragId(null) }}
              onDoubleClick={async () => {
                const title = prompt(`New task on ${format(d, 'd MMM')}`)
                if (title) { const x = new Date(d); x.setHours(9, 0, 0, 0); createTask({ title, due_at: x.toISOString(), all_day: true }) }
              }}
              className={cx('min-h-24 overflow-hidden border-b border-r border-slate-200 p-1.5 dark:border-slate-800', !isSameMonth(d, month) && 'bg-slate-50/60 dark:bg-slate-900/40')}
            >
              <div className={cx('mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs', isToday(d) ? 'bg-brand-600 font-semibold text-white' : !isSameMonth(d, month) ? 'text-slate-300 dark:text-slate-600' : 'text-slate-600 dark:text-slate-300')}>
                {format(d, 'd')}
              </div>
              <div className="space-y-0.5">
                {ts.slice(0, 4).map((t) => (
                  <div key={t.id} draggable onDragStart={() => setDragId(t.id)} onClick={() => setUI({ openTaskId: t.id })}
                    title={t.title}
                    className={cx('cursor-pointer truncate rounded px-1.5 py-0.5 text-[11px] font-medium', t.status === 'done' && 'line-through opacity-50', isOverdue(t) && 'ring-1 ring-red-400')}
                    style={{ background: `${PRIORITIES[t.priority].color}22`, color: t.priority ? PRIORITIES[t.priority].color : undefined }}>
                    {!t.all_day && <span className="opacity-70">{format(new Date(t.due_at!), 'HH:mm')} </span>}{t.title}
                  </div>
                ))}
                {ts.length > 4 && <div className="px-1 text-[11px] text-slate-500">+{ts.length - 4} more</div>}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-xs text-slate-400">Drag tasks between days to reschedule · double-click a day to add a task</p>
    </div>
  )
}
