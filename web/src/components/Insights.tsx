import { useMemo } from 'react'
import { addDays, format, isSameDay, startOfDay, subDays } from 'date-fns'
import { AlertTriangle, CheckCircle2, Flame, Inbox, Mail, Target } from 'lucide-react'
import { useStore } from '../lib/store'
import { PRIORITIES } from '../lib/types'
import { isOpen, isOverdue, matchesView } from '../lib/taskUtils'

function Stat({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string | number; sub?: string; color: string }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg" style={{ background: `${color}1a`, color }}>{icon}</span>{label}
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-slate-500">{sub}</div>}
    </div>
  )
}

export default function Insights() {
  const { tasks, lists } = useStore()
  const live = tasks.filter((t) => !t.deleted_at)
  const stats = useMemo(() => {
    const today = startOfDay(new Date())
    const days = Array.from({ length: 14 }, (_, i) => subDays(today, 13 - i))
    const completedPerDay = days.map((d) => live.filter((t) => t.completed_at && isSameDay(new Date(t.completed_at), d)).length)
    const createdPerDay = days.map((d) => live.filter((t) => isSameDay(new Date(t.created_at), d)).length)
    const doneDays = new Set(live.filter((t) => t.completed_at).map((t) => startOfDay(new Date(t.completed_at!)).getTime()))
    let streak = 0
    let d = doneDays.has(today.getTime()) ? today : addDays(today, -1)
    while (doneDays.has(d.getTime()) && streak < 3650) { streak++; d = addDays(d, -1) }
    const weekAgo = subDays(today, 6)
    const doneWeek = live.filter((t) => t.completed_at && new Date(t.completed_at) >= weekAgo).length
    const createdWeek = live.filter((t) => new Date(t.created_at) >= weekAgo).length
    return { days, completedPerDay, createdPerDay, streak, doneWeek, createdWeek }
  }, [live])

  const open = live.filter(isOpen)
  const overdue = open.filter((t) => isOverdue(t)).length
  const today = open.filter((t) => matchesView(t, 'today')).length
  const fromGmail = live.filter((t) => t.source === 'gmail')
  const max = Math.max(1, ...stats.completedPerDay, ...stats.createdPerDay)
  const W = 640, H = 180, bw = W / 14

  const byList = lists.map((l) => ({ l, n: open.filter((t) => t.list_id === l.id).length })).filter((x) => x.n).sort((a, b) => b.n - a.n)
  const maxList = Math.max(1, ...byList.map((x) => x.n))
  const tagCounts = Object.entries(open.flatMap((t) => t.tags).reduce<Record<string, number>>((m, t) => ({ ...m, [t]: (m[t] ?? 0) + 1 }), {}))
    .sort((a, b) => b[1] - a[1]).slice(0, 12)

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat icon={<Inbox size={15} />} label="Open tasks" value={open.length} sub={`${today} due today`} color="#6366f1" />
        <Stat icon={<AlertTriangle size={15} />} label="Overdue" value={overdue} sub={overdue ? 'needs attention' : 'all clear'} color="#ef4444" />
        <Stat icon={<CheckCircle2 size={15} />} label="Done this week" value={stats.doneWeek} sub={`${stats.createdWeek} added`} color="#22c55e" />
        <Stat icon={<Flame size={15} />} label="Streak" value={`${stats.streak}d`} sub="days with a completion" color="#f97316" />
        <Stat icon={<Mail size={15} />} label="From Gmail" value={fromGmail.length} sub={`${fromGmail.filter((t) => t.status === 'done').length} completed`} color="#e11d48" />
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold">Last 14 days</h3>
          <div className="flex gap-3 text-xs text-slate-500">
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-brand-500" />Completed</span>
            <span className="flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-slate-600" />Created</span>
          </div>
        </div>
        <svg viewBox={`0 0 ${W} ${H + 22}`} className="w-full">
          {stats.days.map((d, i) => {
            const c = stats.completedPerDay[i], n = stats.createdPerDay[i]
            const hc = (c / max) * H, hn = (n / max) * H
            return (
              <g key={i}>
                <rect x={i * bw + bw * 0.18} y={H - hn} width={bw * 0.3} height={hn} rx={2} className="fill-slate-300 dark:fill-slate-600"><title>{`${n} created`}</title></rect>
                <rect x={i * bw + bw * 0.52} y={H - hc} width={bw * 0.3} height={hc} rx={2} className="fill-brand-500"><title>{`${c} completed`}</title></rect>
                {c > 0 && <text x={i * bw + bw * 0.67} y={H - hc - 4} textAnchor="middle" className="fill-slate-500 text-[10px]">{c}</text>}
                <text x={i * bw + bw / 2} y={H + 16} textAnchor="middle" className="fill-slate-400 text-[10px]">{format(d, i === 13 ? "'Today'" : 'd/M')}</text>
              </g>
            )
          })}
        </svg>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold"><Target size={16} />Open by list</h3>
          <div className="space-y-2">
            {byList.length ? byList.map(({ l, n }) => (
              <div key={l.id}>
                <div className="flex justify-between text-sm"><span>{l.name}</span><span className="text-slate-500">{n}</span></div>
                <div className="mt-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full" style={{ width: `${(n / maxList) * 100}%`, background: l.color }} /></div>
              </div>
            )) : <div className="text-sm text-slate-400">No open tasks</div>}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 font-semibold">Open by priority</h3>
          <div className="space-y-2">
            {[...PRIORITIES].reverse().map((p) => {
              const n = open.filter((t) => t.priority === p.value).length
              return (
                <div key={p.value} className="flex items-center gap-3 text-sm">
                  <span className="w-16">{p.label}</span>
                  <div className="h-2 flex-1 rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full" style={{ width: `${open.length ? (n / open.length) * 100 : 0}%`, background: p.color }} /></div>
                  <span className="w-6 text-right text-slate-500">{n}</span>
                </div>
              )
            })}
          </div>
        </div>
        <div className="card p-4">
          <h3 className="mb-3 font-semibold">Top tags</h3>
          <div className="flex flex-wrap gap-1.5">
            {tagCounts.length ? tagCounts.map(([t, n]) => (
              <span key={t} className="rounded-md bg-slate-100 px-2 py-1 text-xs dark:bg-slate-800">#{t} <span className="text-slate-400">{n}</span></span>
            )) : <span className="text-sm text-slate-400">No tags yet</span>}
          </div>
        </div>
      </div>
    </div>
  )
}
