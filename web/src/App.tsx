import { useEffect, useState } from 'react'
import { StatusBar, Style } from '@capacitor/status-bar'
import { SplashScreen } from '@capacitor/splash-screen'
import { StoreProvider, useStore } from './lib/store'
import { supabase } from './lib/supabase'
import { isNative, onNotificationTap, onShared, syncReminders, useIsMobile } from './lib/platform'
import Auth, { PasswordRecovery } from './components/Auth'
import DesktopShell from './components/DesktopShell'
import MobileShell from './components/MobileShell'
import type { EmailDraft } from './components/AnalyzeDialog'
import { Logo, Toasts } from './components/ui'

function parseShared(p: { text?: string; subject?: string }): EmailDraft {
  const text = p.text ?? ''
  const from = text.match(/^From:\s*(.+)$/im)?.[1]
  const subj = p.subject || text.match(/^Subject:\s*(.+)$/im)?.[1]
  return { subject: subj ?? '', from: from ?? '', body: text }
}

function Root() {
  const { session, authReady, tasks, setUI } = useStore()
  const mobile = useIsMobile()
  const [recovery, setRecovery] = useState(false)
  const [shared, setShared] = useState<EmailDraft | null>(null)

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === 'PASSWORD_RECOVERY') setRecovery(true) })
    return () => data.subscription.unsubscribe()
  }, [])

  // deep links: #/task/<id>
  useEffect(() => {
    const go = () => {
      const m = location.hash.match(/#\/task\/([0-9a-f-]{36})/)
      if (m) setUI({ openTaskId: m[1], page: 'tasks' })
    }
    go()
    window.addEventListener('hashchange', go)
    return () => window.removeEventListener('hashchange', go)
  }, [setUI])

  useEffect(() => { if (session) syncReminders(tasks) }, [tasks, session])
  useEffect(() => onNotificationTap((id) => setUI({ openTaskId: id, page: 'tasks' })), [setUI])
  useEffect(() => onShared((p) => setShared(parseShared(p))), [])
  useEffect(() => {
    if (!isNative) return
    SplashScreen.hide().catch(() => {})
    const dark = document.documentElement.classList.contains('dark')
    StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {})
    StatusBar.setBackgroundColor({ color: dark ? '#0f172a' : '#ffffff' }).catch(() => {})
  }, [session])

  if (!authReady) return <div className="flex h-full items-center justify-center"><div className="animate-pulse"><Logo size={56} /></div></div>
  if (recovery && session) return <PasswordRecovery onDone={() => setRecovery(false)} />
  if (!session) return <Auth />
  return mobile ? <MobileShell shared={shared} clearShared={() => setShared(null)} /> : <DesktopShell />
}

export default function App() {
  return (
    <StoreProvider>
      <Root />
      <Toasts />
    </StoreProvider>
  )
}
