import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import type { AnalyzedTask, GroupKey, Layout, List, Page, Settings, SortKey, Task, ViewKey } from './types'
import { uid } from './taskUtils'

export interface Toast { id: string; text: string; tone?: 'info' | 'error' | 'success'; action?: { label: string; run: () => void } }

export type NewTask = Partial<Omit<Task, 'id' | 'user_id' | 'created_at' | 'updated_at'>> & { title: string }

interface UIState {
  page: Page
  view: ViewKey
  layout: Layout
  search: string
  sort: SortKey
  group: GroupKey
  showCompleted: boolean
  openTaskId: string | null
  selected: Set<string>
  theme: 'system' | 'light' | 'dark'
}

interface Ctx extends UIState {
  session: Session | null
  authReady: boolean
  loading: boolean
  tasks: Task[]
  lists: List[]
  settings: Settings | null
  toasts: Toast[]
  setUI: (patch: Partial<UIState>) => void
  toast: (t: Omit<Toast, 'id'>) => void
  dismissToast: (id: string) => void
  refresh: () => Promise<void>
  createTask: (t: NewTask) => Promise<Task | null>
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>
  updateMany: (ids: string[], patch: Partial<Task>) => Promise<void>
  trashTasks: (ids: string[]) => Promise<void>
  restoreTasks: (ids: string[]) => Promise<void>
  purgeTasks: (ids: string[]) => Promise<void>
  duplicateTask: (id: string) => Promise<void>
  toggleDone: (t: Task) => Promise<void>
  createList: (name: string, color?: string) => Promise<List | null>
  updateList: (id: string, patch: Partial<List>) => Promise<void>
  deleteList: (id: string) => Promise<void>
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  analyzeEmail: (payload: Record<string, unknown>) => Promise<{ task: AnalyzedTask; warning?: string }>
  signOut: () => Promise<void>
}

const StoreCtx = createContext<Ctx | null>(null)
export const useStore = () => {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('useStore outside provider')
  return c
}

const LS_KEY = 'mailtasks.ui'
function loadUI(): Partial<UIState> {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}') } catch { return {} }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const saved = loadUI()
  const [session, setSession] = useState<Session | null>(null)
  const [authReady, setAuthReady] = useState(false)
  const [loading, setLoading] = useState(false)
  const [tasks, setTasks] = useState<Task[]>([])
  const [lists, setLists] = useState<List[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [ui, setUIState] = useState<UIState>({
    page: 'tasks', view: 'today', layout: 'list', search: '', sort: 'smart', group: 'due', showCompleted: false,
    openTaskId: null, selected: new Set(), theme: 'system', ...saved,
  } as UIState)
  const tasksRef = useRef(tasks)
  tasksRef.current = tasks

  const setUI = useCallback((patch: Partial<UIState>) => setUIState((s) => ({ ...s, ...patch })), [])

  useEffect(() => {
    const { page, view, layout, sort, group, showCompleted, theme } = ui
    try { localStorage.setItem(LS_KEY, JSON.stringify({ page, view, layout, sort, group, showCompleted, theme })) } catch { /* ignore */ }
  }, [ui])

  // theme
  useEffect(() => {
    const apply = () => {
      const dark = ui.theme === 'dark' || (ui.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [ui.theme])

  const toast = useCallback((t: Omit<Toast, 'id'>) => {
    const id = uid()
    setToasts((x) => [...x.slice(-3), { ...t, id }])
    setTimeout(() => setToasts((x) => x.filter((y) => y.id !== id)), t.action ? 6000 : 3500)
  }, [])
  const dismissToast = useCallback((id: string) => setToasts((x) => x.filter((y) => y.id !== id)), [])
  const fail = useCallback((e: unknown) => toast({ text: (e as Error)?.message ?? String(e), tone: 'error' }), [toast])

  // auth
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true) })
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  const userId = session?.user.id

  const refresh = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    const [t, l, s] = await Promise.all([
      supabase.from('tasks').select('*').order('created_at', { ascending: false }).limit(5000),
      supabase.from('lists').select('*').order('position'),
      supabase.from('user_settings').select('*').maybeSingle(),
    ])
    setLoading(false)
    if (t.error) return fail(t.error)
    setTasks(t.data as Task[])
    if (!l.error) setLists(l.data as List[])
    if (!s.error && s.data) setSettings(s.data as Settings)
    else if (!s.error && !s.data) {
      const { data } = await supabase.from('user_settings').insert({ user_id: userId }).select().single()
      if (data) setSettings(data as Settings)
    }
  }, [userId, fail])

  useEffect(() => {
    if (!userId) { setTasks([]); setLists([]); setSettings(null); return }
    refresh()
    const ch = supabase.channel(`sync-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', filter: `user_id=eq.${userId}` }, (p) => {
        setTasks((cur) => {
          if (p.eventType === 'DELETE') return cur.filter((x) => x.id !== (p.old as Task).id)
          const row = p.new as Task
          const i = cur.findIndex((x) => x.id === row.id)
          if (i === -1) return [row, ...cur]
          const next = [...cur]; next[i] = row; return next
        })
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lists', filter: `user_id=eq.${userId}` }, (p) => {
        setLists((cur) => {
          if (p.eventType === 'DELETE') return cur.filter((x) => x.id !== (p.old as List).id)
          const row = p.new as List
          const i = cur.findIndex((x) => x.id === row.id)
          const next = i === -1 ? [...cur, row] : cur.map((x) => (x.id === row.id ? row : x))
          return next.sort((a, b) => a.position - b.position)
        })
      })
      .subscribe()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    return () => { supabase.removeChannel(ch); window.removeEventListener('focus', onFocus) }
  }, [userId, refresh])

  const patchLocal = (ids: string[], patch: Partial<Task>) =>
    setTasks((cur) => cur.map((t) => (ids.includes(t.id) ? { ...t, ...patch, updated_at: new Date().toISOString() } : t)))

  const createTask = useCallback(async (t: NewTask) => {
    if (!userId) return null
    const minPos = Math.min(0, ...tasksRef.current.map((x) => x.position))
    const row = { list_id: settings?.default_list_id ?? null, position: minPos - 1, ...t }
    const tempId = uid()
    const now = new Date().toISOString()
    const optimistic = {
      id: tempId, user_id: userId, notes: '', status: 'todo', priority: 0, due_at: null, all_day: true, remind_at: null, recurrence: null,
      tags: [], subtasks: [], starred: false, estimate_minutes: null, source: 'manual', email_subject: null, email_from_name: null,
      email_from_address: null, email_date: null, email_url: null, email_thread_id: null, email_snippet: null, ai_summary: null,
      completed_at: null, deleted_at: null, created_at: now, updated_at: now, ...row,
    } as Task
    setTasks((cur) => [optimistic, ...cur])
    const { data, error } = await supabase.from('tasks').insert(row).select().single()
    if (error) { setTasks((cur) => cur.filter((x) => x.id !== tempId)); fail(error); return null }
    setTasks((cur) => {
      const withoutTemp = cur.filter((x) => x.id !== tempId && x.id !== data.id)
      return [data as Task, ...withoutTemp]
    })
    return data as Task
  }, [userId, settings, fail])

  const updateMany = useCallback(async (ids: string[], patch: Partial<Task>) => {
    if (!ids.length) return
    const before = tasksRef.current.filter((t) => ids.includes(t.id))
    patchLocal(ids, patch)
    const { error } = await supabase.from('tasks').update(patch).in('id', ids)
    if (error) { setTasks((cur) => cur.map((t) => before.find((b) => b.id === t.id) ?? t)); fail(error) }
  }, [fail])

  const updateTask = useCallback((id: string, patch: Partial<Task>) => updateMany([id], patch), [updateMany])

  const toggleDone = useCallback(async (t: Task) => {
    const done = t.status !== 'done'
    await updateTask(t.id, { status: done ? 'done' : 'todo', completed_at: done ? new Date().toISOString() : null })
    if (done) {
      toast({ text: `Completed “${t.title.slice(0, 40)}”`, tone: 'success', action: { label: 'Undo', run: () => updateTask(t.id, { status: t.status, completed_at: null }) } })
      if (t.recurrence) setTimeout(() => refresh(), 800)
    }
  }, [updateTask, toast, refresh])

  const trashTasks = useCallback(async (ids: string[]) => {
    await updateMany(ids, { deleted_at: new Date().toISOString() })
    setUIState((s) => ({ ...s, openTaskId: ids.includes(s.openTaskId ?? '') ? null : s.openTaskId, selected: new Set() }))
    toast({ text: `${ids.length} task${ids.length > 1 ? 's' : ''} moved to trash`, action: { label: 'Undo', run: () => updateMany(ids, { deleted_at: null }) } })
  }, [updateMany, toast])

  const restoreTasks = useCallback((ids: string[]) => updateMany(ids, { deleted_at: null }), [updateMany])

  const purgeTasks = useCallback(async (ids: string[]) => {
    setTasks((cur) => cur.filter((t) => !ids.includes(t.id)))
    const { error } = await supabase.from('tasks').delete().in('id', ids)
    if (error) { fail(error); refresh() }
  }, [fail, refresh])

  const duplicateTask = useCallback(async (id: string) => {
    const t = tasksRef.current.find((x) => x.id === id)
    if (!t) return
    const { id: _i, user_id: _u, created_at: _c, updated_at: _up, completed_at: _co, ...rest } = t
    void _i; void _u; void _c; void _up; void _co
    const copy = await createTask({ ...rest, title: `${t.title} (copy)`, status: 'todo', subtasks: t.subtasks.map((s) => ({ ...s, id: uid(), done: false })) })
    if (copy) setUIState((s) => ({ ...s, openTaskId: copy.id }))
  }, [createTask])

  const createList = useCallback(async (name: string, color?: string) => {
    const pos = Math.max(0, ...lists.map((l) => l.position)) + 1
    const { data, error } = await supabase.from('lists').insert({ name, color: color ?? '#6366f1', position: pos }).select().single()
    if (error) { fail(error); return null }
    setLists((cur) => (cur.some((l) => l.id === data.id) ? cur : [...cur, data as List]))
    return data as List
  }, [lists, fail])

  const updateList = useCallback(async (id: string, patch: Partial<List>) => {
    setLists((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)).sort((a, b) => a.position - b.position))
    const { error } = await supabase.from('lists').update(patch).eq('id', id)
    if (error) fail(error)
  }, [fail])

  const deleteList = useCallback(async (id: string) => {
    setLists((cur) => cur.filter((l) => l.id !== id))
    setTasks((cur) => cur.map((t) => (t.list_id === id ? { ...t, list_id: null } : t)))
    const { error } = await supabase.from('lists').delete().eq('id', id)
    if (error) { fail(error); refresh() }
    setUIState((s) => (s.view === `list:${id}` ? { ...s, view: 'all' } : s))
  }, [fail, refresh])

  const saveSettings = useCallback(async (patch: Partial<Settings>) => {
    if (!userId) return
    setSettings((s) => (s ? { ...s, ...patch } : s))
    const { error } = await supabase.from('user_settings').upsert({ user_id: userId, ...patch })
    if (error) fail(error)
  }, [userId, fail])

  const analyzeEmail = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('analyze-email', {
      body: { now: new Date().toISOString(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, lists: lists.map((l) => l.name), ...payload },
    })
    if (error) throw error
    return data as { task: AnalyzedTask; warning?: string }
  }, [lists])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setUIState((s) => ({ ...s, openTaskId: null, selected: new Set() }))
  }, [])

  const value = useMemo<Ctx>(() => ({
    ...ui, session, authReady, loading, tasks, lists, settings, toasts, setUI, toast, dismissToast, refresh, createTask, updateTask,
    updateMany, trashTasks, restoreTasks, purgeTasks, duplicateTask, toggleDone, createList, updateList, deleteList, saveSettings,
    analyzeEmail, signOut,
  }), [ui, session, authReady, loading, tasks, lists, settings, toasts, setUI, toast, dismissToast, refresh, createTask, updateTask,
    updateMany, trashTasks, restoreTasks, purgeTasks, duplicateTask, toggleDone, createList, updateList, deleteList, saveSettings,
    analyzeEmail, signOut])

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}
