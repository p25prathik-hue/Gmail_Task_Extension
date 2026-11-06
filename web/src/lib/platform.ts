import { useEffect, useState } from 'react'
import { Capacitor, registerPlugin } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import type { Task } from './types'

export const isNative = Capacitor.isNativePlatform()

export function useIsMobile() {
  const q = '(max-width: 767px)'
  const [m, setM] = useState(() => isNative || window.matchMedia(q).matches)
  useEffect(() => {
    if (isNative) return
    const mq = window.matchMedia(q)
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

export const tap = () => { if (isNative) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {}) }

const hashId = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h) % 2147483000
}

let lastSig = ''
/** Schedule Android notifications for upcoming reminders / timed due dates. */
export async function syncReminders(tasks: Task[]) {
  if (!isNative) return
  const now = Date.now()
  const upcoming = tasks
    .filter((t) => t.status !== 'done' && !t.deleted_at)
    .map((t) => {
      const at = t.remind_at ? new Date(t.remind_at) : t.due_at ? new Date(t.due_at) : null
      return at && at.getTime() > now ? { t, at } : null
    })
    .filter(Boolean)
    .sort((a, b) => a!.at.getTime() - b!.at.getTime())
    .slice(0, 60) as { t: Task; at: Date }[]
  const sig = upcoming.map((u) => `${u.t.id}${u.at.getTime()}${u.t.title}`).join('|')
  if (sig === lastSig) return
  lastSig = sig
  try {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display !== 'granted') {
      const r = await LocalNotifications.requestPermissions()
      if (r.display !== 'granted') return
    }
    const pending = await LocalNotifications.getPending()
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) })
    if (!upcoming.length) return
    await LocalNotifications.schedule({
      notifications: upcoming.map(({ t, at }) => ({
        id: hashId(t.id),
        title: t.remind_at ? '⏰ Reminder' : '📅 Task due',
        body: t.title,
        schedule: { at, allowWhileIdle: true },
        extra: { taskId: t.id },
        smallIcon: 'ic_stat_notify',
      })),
    })
  } catch (e) {
    console.warn('reminder sync failed', e)
  }
}

export function onNotificationTap(cb: (taskId: string) => void) {
  if (!isNative) return () => {}
  const h = LocalNotifications.addListener('localNotificationActionPerformed', (a) => {
    const id = a.notification.extra?.taskId
    if (id) cb(id)
  })
  return () => { h.then((x) => x.remove()) }
}

// ---------------------------------------------------------------- Android share target ("Share" from Gmail app)
export interface SharedPayload { text?: string; subject?: string }
interface ShareReceiverPlugin {
  getPending(): Promise<SharedPayload>
  addListener(event: 'shared', cb: (p: SharedPayload) => void): Promise<PluginListenerHandle>
}
const ShareReceiver = registerPlugin<ShareReceiverPlugin>('ShareReceiver')

export function onShared(cb: (p: SharedPayload) => void) {
  if (!isNative) return () => {}
  ShareReceiver.getPending().then((p) => { if (p?.text || p?.subject) cb(p) }).catch(() => {})
  const h = ShareReceiver.addListener('shared', (p) => { if (p?.text || p?.subject) cb(p) })
  return () => { h.then((x) => x.remove()).catch(() => {}) }
}
