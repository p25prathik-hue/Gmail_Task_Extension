import { useEffect, useRef, useState } from 'react'
import {
  BarChart3, CalendarDays, CheckSquare, Columns3, Eye, EyeOff, Keyboard, List as ListIcon, Moon, Plus, RefreshCw, Search, Settings as Cog, Sparkles, Sun,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { GroupKey, Layout, SortKey, ViewKey } from '../lib/types'
import { LIST_COLORS } from '../lib/types'
import { BulkBar, SMART, listIcon, useAllTags, useCounts, useVisibleTasks, viewTitle } from './common'
import QuickAdd from './QuickAdd'
import TaskList from './TaskList'
import Board from './Board'
import CalendarView from './CalendarView'
import TaskDetail from './TaskDetail'
import Insights from './Insights'
import Settings from './Settings'
import AnalyzeDialog from './AnalyzeDialog'
import { Empty, IconButton, Logo, Modal, Segmented, cx } from './ui'

function NavItem({ active, onClick, icon, label, count, danger }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; count?: number; danger?: boolean }) {
  return (
    <button onClick={onClick}
      className={cx('flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition',
        active ? 'bg-brand-50 font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')}>
      <span className="shrink-0">{icon}</span>
      <span className="min-w-0 flex-1 truncate text-left">{label}</span>
      {count ? <span className={cx('text-xs', danger ? 'font-semibold text-red-500' : 'text-slate-400')}>{count}</span> : null}
    </button>
  )
}

function Sidebar({ searchRef }: { searchRef: React.RefObject<HTMLInputElement | null> }) {
  const { view, page, setUI, lists, createList, search, session, settings, theme } = useStore()
  const counts = useCounts()
  const tags = useAllTags()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const go = (v: ViewKey) => setUI({ view: v, page: 'tasks', selected: new Set() })
  const dark = document.documentElement.classList.contains('dark')
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white/70 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="flex items-center gap-2.5 px-4 pb-3 pt-4">
        <Logo size={30} /><span className="text-[17px] font-bold tracking-tight">MailTasks</span>
        <div className="flex-1" />
        <IconButton title="Toggle theme" onClick={() => setUI({ theme: dark ? 'light' : 'dark' })}>{dark ? <Sun size={16} /> : <Moon size={16} />}</IconButton>
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-lg bg-slate-100 px-2.5 dark:bg-slate-800">
          <Search size={15} className="text-slate-400" />
          <input ref={searchRef} value={search} onChange={(e) => setUI({ search: e.target.value, page: 'tasks' })} placeholder="Search  ( / )"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none" />
        </div>
      </div>
      <nav className="scroll-thin flex-1 space-y-4 overflow-y-auto px-3 pb-4">
        <div className="space-y-0.5">
          {SMART.map((s) => (
            <NavItem key={s.key} active={page === 'tasks' && view === s.key} onClick={() => go(s.key)} label={s.label}
              icon={<span style={{ color: s.color }}>{s.icon}</span>} count={counts[s.key]} danger={s.key === 'overdue'} />
          ))}
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between px-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Lists <button title="New list" onClick={() => setAdding(true)} className="hover:text-brand-600"><Plus size={14} /></button>
          </div>
          <div className="space-y-0.5">
            {lists.map((l) => (
              <NavItem key={l.id} active={page === 'tasks' && view === `list:${l.id}`} onClick={() => go(`list:${l.id}`)} label={l.name} icon={listIcon(l)} count={counts[`list:${l.id}`]} />
            ))}
            {adding && (
              <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="List name" className="input !py-1.5"
                onBlur={() => { setAdding(false); setName('') }}
                onKeyDown={async (e) => {
                  if (e.key === 'Enter' && name.trim()) { const l = await createList(name.trim(), LIST_COLORS[lists.length % LIST_COLORS.length]); setAdding(false); setName(''); if (l) go(`list:${l.id}`) }
                  if (e.key === 'Escape') setAdding(false)
                }} />
            )}
          </div>
        </div>
        {tags.length > 0 && (
          <div>
            <div className="mb-1 px-2.5 text-xs font-semibold uppercase tracking-wide text-slate-400">Tags</div>
            <div className="flex flex-wrap gap-1 px-2">
              {tags.slice(0, 30).map((t) => (
                <button key={t} onClick={() => go(`tag:${t}`)}
                  className={cx('rounded-md px-2 py-0.5 text-xs', view === `tag:${t}` && page === 'tasks' ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300')}>
                  #{t}
                </button>
              ))}
            </div>
          </div>
        )}
      </nav>
      <div className="space-y-0.5 border-t border-slate-200 p-3 dark:border-slate-800">
        <NavItem active={page === 'insights'} onClick={() => setUI({ page: 'insights' })} icon={<BarChart3 size={16} />} label="Insights" />
        <NavItem active={page === 'settings'} onClick={() => setUI({ page: 'settings' })} icon={<Cog size={16} />} label="Settings" />
        <div className="flex items-center gap-2 px-2.5 pt-2 text-xs text-slate-500">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-600 text-[11px] font-semibold text-white">
            {(settings?.display_name || session?.user.email || '?')[0].toUpperCase()}
          </div>
          <span className="truncate">{session?.user.email}</span>
          <span className="sr-only">{theme}</span>
        </div>
      </div>
    </aside>
  )
}

const SHORTCUTS = [
  ['n', 'New task'], ['/', 'Search'], ['e', 'Create task from email text (AI)'], ['1 / 2 / 3', 'List · Board · Calendar'],
  ['t / u / a', 'Today · Next 7 days · All'], ['Ctrl/⌘ + click', 'Multi-select tasks'], ['Esc', 'Close panel / clear selection'], ['?', 'This help'],
]

export default function DesktopShell() {
  const { page, view, layout, sort, group, showCompleted, setUI, lists, tasks, openTaskId, loading, refresh, selected } = useStore()
  const visible = useVisibleTasks(layout === 'board')
  const quickRef = useRef<HTMLInputElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const [help, setHelp] = useState(false)
  const [ai, setAI] = useState(false)
  const open = tasks.find((t) => t.id === openTaskId)

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) {
        if (e.key === 'Escape') el.blur?.()
        return
      }
      const map: Record<string, () => void> = {
        n: () => { setUI({ page: 'tasks' }); setTimeout(() => quickRef.current?.focus(), 0) },
        '/': () => searchRef.current?.focus(),
        e: () => setAI(true),
        '1': () => setUI({ layout: 'list', page: 'tasks' }), '2': () => setUI({ layout: 'board', page: 'tasks' }), '3': () => setUI({ layout: 'calendar', page: 'tasks' }),
        t: () => setUI({ view: 'today', page: 'tasks' }), u: () => setUI({ view: 'upcoming', page: 'tasks' }), a: () => setUI({ view: 'all', page: 'tasks' }),
        '?': () => setHelp(true),
        Escape: () => setUI({ openTaskId: null, selected: new Set() }),
      }
      const f = map[e.key]
      if (f) { e.preventDefault(); f() }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [setUI])

  const title = page === 'insights' ? 'Insights' : page === 'settings' ? 'Settings' : viewTitle(view, lists)

  return (
    <div className="flex h-full">
      <Sidebar searchRef={searchRef} />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white/60 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/40">
          <h1 className="text-lg font-semibold">{title}</h1>
          {page === 'tasks' && <span className="text-sm text-slate-400">{visible.filter((t) => t.status !== 'done').length}</span>}
          <div className="flex-1" />
          {page === 'tasks' && (
            <>
              <Segmented<Layout> value={layout} onChange={(v) => setUI({ layout: v })} options={[
                { value: 'list', label: <><ListIcon size={14} />List</> }, { value: 'board', label: <><Columns3 size={14} />Board</> },
                { value: 'calendar', label: <><CalendarDays size={14} />Calendar</> },
              ]} />
              {layout === 'list' && (
                <>
                  <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" value={sort} onChange={(e) => setUI({ sort: e.target.value as SortKey })} title="Sort">
                    <option value="smart">Sort: Smart</option><option value="due">Sort: Due date</option><option value="priority">Sort: Priority</option>
                    <option value="created">Sort: Newest</option><option value="title">Sort: A–Z</option><option value="manual">Sort: Manual (drag)</option>
                  </select>
                  {sort !== 'manual' && (
                    <select className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs dark:border-slate-700 dark:bg-slate-900" value={group} onChange={(e) => setUI({ group: e.target.value as GroupKey })} title="Group">
                      <option value="due">Group: Due</option><option value="list">Group: List</option><option value="priority">Group: Priority</option>
                      <option value="status">Group: Status</option><option value="none">Group: None</option>
                    </select>
                  )}
                </>
              )}
              <IconButton title={showCompleted ? 'Hide completed' : 'Show completed'} onClick={() => setUI({ showCompleted: !showCompleted })}>
                {showCompleted ? <Eye size={16} /> : <EyeOff size={16} />}
              </IconButton>
            </>
          )}
          <IconButton title="Refresh" onClick={() => refresh()}><RefreshCw size={16} className={loading ? 'animate-spin' : ''} /></IconButton>
          <IconButton title="Keyboard shortcuts (?)" onClick={() => setHelp(true)}><Keyboard size={16} /></IconButton>
        </header>

        <div className="flex min-h-0 flex-1">
          <div className="scroll-thin min-w-0 flex-1 overflow-y-auto px-6 py-5">
            {page === 'insights' ? <Insights /> : page === 'settings' ? <Settings /> : (
              <div className={cx('mx-auto', layout === 'list' ? 'max-w-3xl' : 'h-full')}>
                {layout !== 'calendar' && view !== 'trash' && view !== 'completed' && (
                  <QuickAdd ref={quickRef} onAI={() => setAI(true)} className="mb-5 max-w-3xl" />
                )}
                {layout === 'board' ? <div className="h-[calc(100%-4.5rem)]"><Board tasks={visible} /></div>
                  : layout === 'calendar' ? <CalendarView tasks={tasks.filter((t) => !t.deleted_at && (showCompleted || t.status !== 'done'))} />
                    : visible.length ? <TaskList tasks={visible} />
                      : (
                        <Empty icon={view === 'today' ? <Sparkles size={26} /> : <CheckSquare size={26} />}
                          title={view === 'today' ? 'Nothing due today 🎉' : view === 'trash' ? 'Trash is empty' : 'No tasks here'}
                          hint={view === 'trash' ? undefined : 'Add one above, or open an email in Gmail and press the MailTasks button.'} />
                      )}
              </div>
            )}
          </div>
          {open && page === 'tasks' && (
            <div className="anim-left w-[440px] shrink-0 border-l border-slate-200 shadow-xl dark:border-slate-800">
              <TaskDetail key={open.id} task={open} onClose={() => setUI({ openTaskId: null })} />
            </div>
          )}
        </div>
      </main>
      {selected.size > 0 && <BulkBar />}
      <AnalyzeDialog open={ai} onClose={() => setAI(false)} />
      <Modal open={help} onClose={() => setHelp(false)} title="Keyboard shortcuts">
        <div className="space-y-2">
          {SHORTCUTS.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between text-sm"><span>{d}</span><kbd className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-800">{k}</kbd></div>
          ))}
          <div className="border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800">
            Quick add syntax: <code>tomorrow 5pm</code>, <code>#tag</code>, <code>!high</code> / <code>!1–4</code>, <code>@List</code>, <code>every week</code>, <code>*</code> to star.
          </div>
        </div>
      </Modal>
    </div>
  )
}
