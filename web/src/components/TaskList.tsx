import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useStore } from '../lib/store'
import type { Task } from '../lib/types'
import { groupTasks } from '../lib/taskUtils'
import TaskRow from './TaskRow'
import { cx } from './ui'

function SortableRow({ task, mobile }: { task: Task; mobile?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <TaskRow task={task} mobile={mobile} innerRef={setNodeRef} dragHandle={{ attributes, listeners }}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1, zIndex: isDragging ? 5 : undefined, position: 'relative' }} />
  )
}

export default function TaskList({ tasks, mobile }: { tasks: Task[]; mobile?: boolean }) {
  const { group, sort, lists, updateTask } = useStore()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(['done']))
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const manual = sort === 'manual' && !mobile
  const groups = groupTasks(tasks, manual ? 'none' : group, lists)

  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return
    const ids = tasks.map((t) => t.id)
    const from = ids.indexOf(String(e.active.id)), to = ids.indexOf(String(e.over.id))
    const reordered = [...tasks]
    const [m] = reordered.splice(from, 1)
    reordered.splice(to, 0, m)
    const prev = reordered[to - 1]?.position, next = reordered[to + 1]?.position
    const pos = prev === undefined ? (next ?? 0) - 1 : next === undefined ? prev + 1 : (prev + next) / 2
    updateTask(m.id, { position: pos })
  }

  if (manual) {
    return (
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          <div className="card overflow-hidden">{tasks.map((t) => <SortableRow key={t.id} task={t} />)}</div>
        </SortableContext>
      </DndContext>
    )
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const id = g.key.split('|')[1]
        const isCol = collapsed.has(id)
        return (
          <section key={g.key}>
            {g.label && (
              <button
                onClick={() => setCollapsed((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n })}
                className="mb-1.5 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                {isCol ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                {g.color && <span className="h-2 w-2 rounded-full" style={{ background: g.color }} />}
                <span style={g.key.includes('overdue') ? { color: '#ef4444' } : undefined}>{g.label}</span>
                <span className="font-normal text-slate-400">{g.tasks.length}</span>
              </button>
            )}
            {!isCol && (
              <div className={cx('overflow-hidden', mobile ? 'rounded-xl border border-slate-200 dark:border-slate-800' : 'card')}>
                {g.tasks.map((t) => <TaskRow key={t.id} task={t} mobile={mobile} />)}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
