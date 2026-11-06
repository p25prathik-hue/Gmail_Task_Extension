import { useState } from 'react'
import { CalendarCheck, KanbanSquare, Mail, Smartphone, Sparkles } from 'lucide-react'
import { supabase, isConfigured } from '../lib/supabase'
import { isNative } from '../lib/platform'
import { Button, Logo } from './ui'

type Mode = 'signin' | 'signup' | 'reset' | 'magic'

export default function Auth() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; tone: 'error' | 'ok' } | null>(null)

  const redirect = isNative ? undefined : window.location.origin + window.location.pathname

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirect, data: { full_name: name } } })
        if (error) throw error
        if (!data.session) setMsg({ text: 'Account created. Check your inbox to confirm your email, then sign in.', tone: 'ok' })
      } else if (mode === 'magic') {
        const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: redirect, shouldCreateUser: false } })
        if (error) throw error
        setMsg({ text: 'Magic link sent. Open it on this device to sign in.', tone: 'ok' })
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect })
        if (error) throw error
        setMsg({ text: 'Password reset email sent.', tone: 'ok' })
      }
    } catch (err) {
      setMsg({ text: (err as Error).message, tone: 'error' })
    } finally {
      setBusy(false)
    }
  }

  const features = [
    { icon: <Mail size={18} />, t: 'One click in Gmail', d: 'A floating button turns any email into a task.' },
    { icon: <Sparkles size={18} />, t: 'AI extraction', d: 'Title, deadline, priority, tags and steps, filled in for you.' },
    { icon: <KanbanSquare size={18} />, t: 'List, board & calendar', d: 'Organise with lists, tags, smart views and drag & drop.' },
    { icon: <Smartphone size={18} />, t: 'Synced everywhere', d: 'Web app and Android app, live-synced with reminders.' },
  ]

  return (
    <div className="flex min-h-full">
      <div className="hidden flex-1 flex-col justify-between bg-gradient-to-br from-brand-600 via-brand-700 to-indigo-900 p-12 text-white lg:flex">
        <div className="flex items-center gap-3 text-lg font-semibold"><Logo size={36} /> MailTasks</div>
        <div>
          <h1 className="max-w-md text-4xl font-bold leading-tight">Your inbox, turned into a to-do list you actually finish.</h1>
          <div className="mt-10 grid max-w-lg gap-5">
            {features.map((f) => (
              <div key={f.t} className="flex gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15">{f.icon}</div>
                <div><div className="font-semibold">{f.t}</div><div className="text-sm text-indigo-100">{f.d}</div></div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-indigo-200"><CalendarCheck size={16} /> Your data lives in your own Supabase database.</div>
      </div>

      <div className="safe-top flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center lg:hidden">
            <Logo size={56} />
            <h1 className="mt-3 text-2xl font-bold">MailTasks</h1>
            <p className="text-sm text-slate-500">Email → AI → tasks, synced everywhere</p>
          </div>
          <h2 className="text-xl font-semibold">
            {mode === 'signin' ? 'Welcome back' : mode === 'signup' ? 'Create your account' : mode === 'magic' ? 'Email me a sign-in link' : 'Reset password'}
          </h2>
          <p className="mb-6 mt-1 text-sm text-slate-500">
            {mode === 'signup' ? 'One account for the extension, web app and Android app.' : 'Use the same account on every device.'}
          </p>
          {!isConfigured && (
            <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Supabase is not configured yet (config/supabase.json).</div>
          )}
          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" /></div>
            )}
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
            </div>
            {(mode === 'signin' || mode === 'signup') && (
              <div>
                <div className="flex items-center justify-between">
                  <label className="label">Password</label>
                  {mode === 'signin' && <button type="button" className="mb-1 text-xs text-brand-600" onClick={() => setMode('reset')}>Forgot?</button>}
                </div>
                <input className="input" type="password" required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
              </div>
            )}
            {msg && <div className={`rounded-lg p-3 text-sm ${msg.tone === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>{msg.text}</div>}
            <Button type="submit" disabled={busy} className="w-full py-2.5">
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : mode === 'magic' ? 'Send link' : 'Send reset email'}
            </Button>
          </form>
          <div className="mt-6 space-y-2 text-center text-sm text-slate-500">
            {mode === 'signin' ? (
              <>
                <div>New here? <button className="font-medium text-brand-600" onClick={() => setMode('signup')}>Create an account</button></div>
                {!isNative && <div><button className="text-brand-600" onClick={() => setMode('magic')}>Sign in with a magic link</button></div>}
              </>
            ) : (
              <div>Have an account? <button className="font-medium text-brand-600" onClick={() => setMode('signin')}>Sign in</button></div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function PasswordRecovery({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  return (
    <div className="flex min-h-full items-center justify-center p-6">
      <form
        className="card w-full max-w-sm space-y-3 p-6"
        onSubmit={async (e) => {
          e.preventDefault()
          const { error } = await supabase.auth.updateUser({ password: pw })
          if (error) setErr(error.message)
          else onDone()
        }}
      >
        <h2 className="text-lg font-semibold">Choose a new password</h2>
        <input className="input" type="password" minLength={6} required value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <div className="text-sm text-red-600">{err}</div>}
        <Button className="w-full">Update password</Button>
      </form>
    </div>
  )
}
