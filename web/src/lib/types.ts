export type Status = 'todo' | 'in_progress' | 'waiting' | 'done'
export type Recurrence = 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly'

export interface Subtask {
  id: string
  title: string
  done: boolean
}

export interface Task {
  id: string
  user_id: string
  list_id: string | null
  title: string
  notes: string
  status: Status
  priority: number
  due_at: string | null
  all_day: boolean
  remind_at: string | null
  recurrence: Recurrence | null
  tags: string[]
  subtasks: Subtask[]
  starred: boolean
  position: number
  estimate_minutes: number | null
  source: 'manual' | 'gmail' | 'mobile' | 'import'
  email_subject: string | null
  email_from_name: string | null
  email_from_address: string | null
  email_date: string | null
  email_url: string | null
  email_thread_id: string | null
  email_snippet: string | null
  ai_summary: string | null
  completed_at: string | null
  deleted_at: string | null
  created_at: string
  updated_at: string
}

export interface List {
  id: string
  user_id: string
  name: string
  color: string
  icon: string
  position: number
  archived: boolean
  created_at: string
}

export interface Settings {
  user_id: string
  display_name: string | null
  ai_provider: 'gemini' | 'openai' | 'anthropic' | 'openai_compatible' | 'none'
  ai_api_key: string | null
  ai_model: string | null
  ai_base_url: string | null
  default_list_id: string | null
  timezone: string | null
  preferences: Record<string, unknown>
}

export interface AnalyzedTask {
  title: string
  description: string
  summary: string
  due_at: string | null
  all_day: boolean
  priority: number
  tags: string[]
  subtasks: string[]
  suggested_list: string | null
  estimate_minutes: number | null
  action_required: boolean
  provider: string
  model: string | null
}

export type SmartView = 'all' | 'today' | 'upcoming' | 'overdue' | 'starred' | 'gmail' | 'nodate' | 'completed' | 'trash'
export type ViewKey = SmartView | `list:${string}` | `tag:${string}`
export type Page = 'tasks' | 'insights' | 'settings'
export type Layout = 'list' | 'board' | 'calendar'
export type SortKey = 'smart' | 'due' | 'priority' | 'created' | 'title' | 'manual'
export type GroupKey = 'due' | 'list' | 'priority' | 'status' | 'none'

export const PRIORITIES = [
  { value: 0, label: 'None', color: '#94a3b8' },
  { value: 1, label: 'Low', color: '#22c55e' },
  { value: 2, label: 'Medium', color: '#eab308' },
  { value: 3, label: 'High', color: '#f97316' },
  { value: 4, label: 'Urgent', color: '#ef4444' },
]

export const STATUSES: { value: Status; label: string; color: string }[] = [
  { value: 'todo', label: 'To do', color: '#64748b' },
  { value: 'in_progress', label: 'In progress', color: '#3b82f6' },
  { value: 'waiting', label: 'Waiting', color: '#a855f7' },
  { value: 'done', label: 'Done', color: '#22c55e' },
]

export const RECURRENCES: { value: Recurrence; label: string }[] = [
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
  { value: 'yearly', label: 'Every year' },
]

export const LIST_COLORS = ['#6366f1', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#ec4899', '#a855f7', '#14b8a6', '#64748b']
