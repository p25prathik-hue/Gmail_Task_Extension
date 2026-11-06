import { useState } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { Plus } from 'lucide-react'
import { useStore } from '../lib/store'
import type { Status, Task } from '../lib/types'
import { STATUSES } from '../lib/types'
import { PriorityCheck, TaskMeta } from './TaskRow'
import { cx } from './ui'

function Card({ task, overlay }: { task: Task; overlay?: boolean }) {
  const { setUI, toggleDone } = useStore()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: task.id })
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      onClick={() => setUI({ openTaskId: task.id })}
      className={cx('cursor-grab rounded-lg border border-slate-200 bg-white p-3 shadow-sm transition hover:shadow dark:border-slate-700 dark:bg-slate-900',
        isDragging && !overlay && 'opacity-30', overlay && 'rotate-2 shadow-xl')}
    >
      <div className="flex items-start gap-2">
        <div className="pt-0.5"><PriorityCheck task={task} onToggle={() => toggleDone(task)} size={18} /></div>
        <div className={cx('min-w-0 flex-1 text-sm', task.status === 'done' && 'text-slate-400 line-through')}>{task.title}</div>
      </div>
      <div className="pl-6"><TaskMeta task={task} /></div>
    </div>
  )
}

function Column({ status, label, color, tasks }: { status: Status; label: string; color: string; tasks: Task[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: status })
  const { createTask } = useStore()
  const [adding, setAdding] = useState('')
  return (
    <div ref={setNodeRef} className={cx('flex w-72 shrink-0 flex-col rounded-xl bg-slate-100/80 p-2 transition dark:bg-slate-900/60', isOver && 'ring-2 ring-brand-400')}>
      <div className="mb-2 flex items-center gap-2 px-1.5 pt-1 text-sm font-semibold">
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}
        <span className="ml-auto text-xs font-normal text-slate-500">{tasks.length}</span>
      </div>
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto pb-2">
        {tasks.map((t) => <Card key={t.id} task={t} />)}
      </div>
      <div className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm text-slate-500 focus-within:bg-white dark:focus-within:bg-slate-800">
        <Plus size={15} />
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add card"
          onKeyDown={(e) => { if (e.key === 'Enter' && adding.trim()) { createTask({ title: adding.trim(), status }); setAdding('') } }}
          className="min-w-0 flex-1 bg-transparent outline-none" />
      </div>
    </div>
  )
}

export default function Board({ tasks }: { tasks: Task[] }) {
  const { updateTask } = useStore()
  const [active, setActive] = useState<Task | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }))
  const onEnd = (e: DragEndEvent) => {
    setActive(null)
    const to = e.over?.id as Status | undefined
    const t = tasks.find((x) => x.id === e.active.id)
    if (t && to && t.status !== to) updateTask(t.id, { status: to })
  }
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(tasks.find((t) => t.id === e.active.id) ?? null)} onDragEnd={onEnd} onDragCancel={() => setActive(null)}>
      <div className="scroll-thin flex h-full gap-3 overflow-x-auto pb-4">
        {STATUSES.map((s) => <Column key={s.value} status={s.value} label={s.label} color={s.color} tasks={tasks.filter((t) => t.status === s.value)} />)}
      </div>
      <DragOverlay>{active ? <Card task={active} overlay /> : null}</DragOverlay>
    </DndContext>
  )
}
