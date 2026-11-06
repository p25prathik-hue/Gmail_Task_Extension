import { useEffect, useRef, useState } from 'react'
import { App as CapApp } from '@capacitor/app'
import {
  BarChart3, CalendarDays, ChevronRight, Columns3, Eye, EyeOff, Inbox, LayoutGrid, List as ListIcon, Plus, RefreshCw, Search, Settings as Cog, Sparkles, Sun, X,
} from 'lucide-react'
import { useStore } from '../lib/store'
import type { SortKey, ViewKey } from '../lib/types'
import { isNative, tap } from '../lib/platform'
import { BulkBar, SMART, listIcon, useAllTags, useCounts, useVisibleTasks, viewTitle } from './common'
import QuickAdd from './QuickAdd'
import TaskList from './TaskList'
import Board from './Board'
import CalendarView from './CalendarView'
import TaskDetail from './TaskDetail'
import Insights from './Insights'
import Settings from './Settings'
import AnalyzeDialog from './AnalyzeDialog'
import type { EmailDraft } from './AnalyzeDialog'
import { Empty, IconButton, cx } from './ui'

type Tab = 'today' | 'all' | 'calendar' | 'browse' | 'settings'

export default function MobileShell({ shared, clearShared }: { shared: EmailDraft | null; clearShared: () => void }) {
  const { view, page, layout, setUI, lists, tasks, openTaskId, refresh, loading, search, sort, showCompleted, selected } = useStore()
  const counts = useCounts()
  const tags = useAllTags()
  const [tab, setTab] = useState<Tab>(() => (view === 'today' ? 'today' : view === 'all' ? 'all' : 'browse'))
  const [sub, setSub] = useState<'menu' | 'view' | 'insights'>(view === 'today' || view === 'all' ? 'menu' : 'view')
  const [sheet, setSheet] = useState(false)
  const [ai, setAI] = useState(false)
  const [searching, setSearching] = useState(false)
  const [pull, setPull] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)
  const startY = useRef<number | null>(null)
  const visible = useVisibleTasks(layout === 'board')
  const open = tasks.find((t) => t.id === openTaskId)

  useEffect(() => { if (shared) setAI(true) }, [shared])

  // Android back button
  const stateRef = useRef({ open, sheet, ai, searching, tab, sub })
  stateRef.current = { open, sheet, ai, searching, tab, sub }
  useEffect(() => {
    if (!isNative) return
    const h = CapApp.addListener('backButton', () => {
      const s = stateRef.current
      if (s.open) setUI({ openTaskId: null })
      else if (s.ai) { setAI(false); clearShared() }
      else if (s.sheet) setSheet(false)
      else if (s.searching) { setSearching(false); setUI({ search: '' }) }
      else if (s.tab === 'browse' && s.sub !== 'menu') setSub('menu')
      else if (s.tab !== 'today') goTab('today')
      else CapApp.minimizeApp()
    })
    return () => { h.then((x) => x.remove()) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function goTab(t: Tab) {
    tap()
    setTab(t)
    if (t === 'today') setUI({ view: 'today', page: 'tasks', layout: layout === 'calendar' ? 'list' : layout })
    if (t === 'all') setUI({ view: 'all', page: 'tasks', layout: layout === 'calendar' ? 'list' : layout })
    if (t === 'calendar') setUI({ page: 'tasks', layout: 'calendar' })
    if (t === 'settings') setUI({ page: 'settings' })
    if (t === 'browse') { setSub('menu'); setUI({ page: 'tasks', layout: layout === 'calendar' ? 'list' : layout }) }
    scroller.current?.scrollTo({ top: 0 })
  }
  const openView = (v: ViewKey) => { tap(); setUI({ view: v, page: 'tasks', selected: new Set() }); setSub('view') }

  const title = tab === 'settings' ? 'Settings' : tab === 'calendar' ? 'Calendar' : tab === 'browse' ? (sub === 'menu' ? 'Browse' : sub === 'insights' ? 'Insights' : viewTitle(view, lists)) : viewTitle(view, lists)
  const showTasks = (tab === 'today' || tab === 'all' || (tab === 'browse' && sub === 'view'))

  const onTouchStart = (e: React.TouchEvent) => { if ((scroller.current?.scrollTop ?? 1) <= 0) startY.current = e.touches[0].clientY }
  const onTouchMove = (e: React.TouchEvent) => { if (startY.current !== null) setPull(Math.max(0, Math.min(90, e.touches[0].clientY - startY.current))) }
  const onTouchEnd = async () => { if (pull > 70) { tap(); await refresh() } setPull(0); startY.current = null }

  return (
    <div className="flex h-full flex-col bg-slate-50 dark:bg-slate-950">
      <header className="safe-top sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
        {searching ? (
          <div className="flex items-center gap-2 px-3 py-2.5">
            <Search size={18} className="text-slate-400" />
            <input autoFocus value={search} onChange={(e) => setUI({ search: e.target.value })} placeholder="Search tasks, tags, emails…" className="flex-1 bg-transparent text-[15px] outline-none" />
            <IconButton title="Close search" onClick={() => { setSearching(false); setUI({ search: '' }) }}><X size={18} /></IconButton>
          </div>
        ) : (
          <div className="flex items-center gap-1 px-4 py-2.5">
            {tab === 'browse' && sub !== 'menu' && <IconButton title="Back" onClick={() => setSub('menu')} className="-ml-2"><ChevronRight size={18} className="rotate-180" /></IconButton>}
            <h1 className="flex-1 truncate text-xl font-bold">{title}</h1>
            {showTasks && (
              <>
                <IconButton title="Search" onClick={() => setSearching(true)}><Search size={18} /></IconButton>
                <IconButton title={layout === 'board' ? 'List view' : 'Board view'} onClick={() => setUI({ layout: layout === 'board' ? 'list' : 'board' })}>
                  {layout === 'board' ? <ListIcon size={18} /> : <Columns3 size={18} />}
                </IconButton>
                <IconButton title="Show completed" onClick={() => setUI({ showCompleted: !showCompleted })}>{showCompleted ? <Eye size={18} /> : <EyeOff size={18} />}</IconButton>
              </>
            )}
          </div>
        )}
        {showTasks && layout === 'list' && !searching && (
          <div className="scroll-thin flex gap-1.5 overflow-x-auto px-4 pb-2">
            {(['smart', 'due', 'priority', 'created', 'title'] as SortKey[]).map((s) => (
              <button key={s} onClick={() => setUI({ sort: s })}
                className={cx('shrink-0 rounded-full px-3 py-1 text-xs font-medium', sort === s ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300')}>
                {{ smart: 'Smart', due: 'Due date', priority: 'Priority', created: 'Newest', title: 'A–Z', manual: 'Manual' }[s]}
              </button>
            ))}
          </div>
        )}
      </header>

      <div ref={scroller} className="flex-1 overflow-y-auto" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        {(pull > 0 || loading) && (
          <div className="flex justify-center py-2 text-slate-400" style={{ height: loading ? 36 : pull / 2 }}>
            <RefreshCw size={18} className={loading || pull > 70 ? 'animate-spin text-brand-600' : ''} style={{ transform: `rotate(${pull * 3}deg)` }} />
          </div>
        )}
        <div className="px-3 pb-28 pt-3">
          {tab === 'settings' ? <Settings /> :
            tab === 'calendar' ? <CalendarView mobile tasks={tasks.filter((t) => !t.deleted_at && (showCompleted || t.status !== 'done'))} /> :
              tab === 'browse' && sub === 'insights' ? <Insights /> :
                tab === 'browse' && sub === 'menu' ? (
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-2">
                      {SMART.filter((s) => s.key !== 'today' && s.key !== 'all').map((s) => (
                        <button key={s.key} onClick={() => openView(s.key)} className="card flex items-center gap-2.5 p-3 text-left active:scale-[.98]">
                          <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${s.color}1a`, color: s.color }}>{s.icon}</span>
                          <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{s.label}</span><span className="text-xs text-slate-500">{counts[s.key] ?? ''}</span></span>
                        </button>
                      ))}
                      <button onClick={() => setSub('insights')} className="card flex items-center gap-2.5 p-3 text-left">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600 dark:bg-brand-500/15"><BarChart3 size={16} /></span>
                        <span className="text-sm font-medium">Insights</span>
                      </button>
                    </div>
                    <div>
                      <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Lists</div>
                      <div className="card divide-y divide-slate-100 overflow-hidden dark:divide-slate-800">
                        {lists.map((l) => (
                          <button key={l.id} onClick={() => openView(`list:${l.id}`)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-slate-50 dark:active:bg-slate-800">
                            {listIcon(l, 18)}<span className="flex-1 text-[15px]">{l.name}</span><span className="text-sm text-slate-400">{counts[`list:${l.id}`] ?? ''}</span><ChevronRight size={16} className="text-slate-300" />
                          </button>
                        ))}
                      </div>
                    </div>
                    {tags.length > 0 && (
                      <div>
                        <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Tags</div>
                        <div className="flex flex-wrap gap-2">
                          {tags.map((t) => <button key={t} onClick={() => openView(`tag:${t}`)} className="rounded-full bg-white px-3 py-1.5 text-sm shadow-sm dark:bg-slate-900">#{t} <span className="text-slate-400">{counts[`tag:${t}`] ?? ''}</span></button>)}
                        </div>
                      </div>
                    )}
                  </div>
                ) : layout === 'board' ? <div className="h-[70vh]"><Board tasks={visible} /></div>
                  : visible.length ? <TaskList tasks={visible} mobile />
                    : <Empty icon={<Sparkles size={26} />} title={view === 'today' ? 'All clear for today 🎉' : 'No tasks here'} hint="Tap + to add a task, or share an email from Gmail to MailTasks." />}
          {showTasks && layout === 'list' && visible.length > 0 && <p className="mt-4 text-center text-xs text-slate-400">Swipe right to complete · left to delete</p>}
        </div>
      </div>

      {page !== 'settings' && !open && (
        <button onClick={() => { tap(); setSheet(true) }} title="Add task"
          className="fixed bottom-24 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-600/30 active:scale-95">
          <Plus size={26} />
        </button>
      )}

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="grid grid-cols-5">
          {([['today', 'Today', <Sun size={21} />, counts.today], ['all', 'Inbox', <Inbox size={21} />, counts.all], ['calendar', 'Calendar', <CalendarDays size={21} />, 0],
            ['browse', 'Browse', <LayoutGrid size={21} />, 0], ['settings', 'Settings', <Cog size={21} />, 0]] as [Tab, string, React.ReactNode, number][]).map(([k, label, icon, n]) => (
            <button key={k} onClick={() => goTab(k)} className={cx('relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium', tab === k ? 'text-brand-600 dark:text-brand-400' : 'text-slate-500')}>
              {icon}{label}
              {n ? <span className="absolute right-[22%] top-1 min-w-4 rounded-full bg-brand-600 px-1 text-[10px] leading-4 text-white">{n}</span> : null}
            </button>
          ))}
        </div>
      </nav>

      {sheet && (
        <div className="anim-fade fixed inset-0 z-40 bg-slate-900/40" onClick={() => setSheet(false)}>
          <div className="anim-up safe-bottom absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            <QuickAdd autoFocus onCreated={() => setSheet(false)} />
            <p className="mt-2 px-1 text-xs text-slate-500">Try “Call bank tomorrow 10am !high #finance @Personal”</p>
            <button onClick={() => { setSheet(false); setAI(true) }} className="mt-3 flex w-full items-center gap-3 rounded-xl bg-brand-50 p-3 text-left text-sm text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              <Sparkles size={18} /> <span><b>Create from email text</b><br /><span className="text-xs opacity-80">Paste an email and let AI build the task</span></span>
            </button>
          </div>
        </div>
      )}

      {open && (
        <div className="anim-left fixed inset-0 z-50">
          <TaskDetail key={open.id} task={open} mobile onClose={() => setUI({ openTaskId: null })} />
        </div>
      )}
      {selected.size > 0 && <BulkBar />}
      <AnalyzeDialog open={ai} initial={shared} onClose={() => { setAI(false); clearShared() }} />
    </div>
  )
}
