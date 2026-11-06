import { createClient } from '@supabase/supabase-js'
import cfg from '../../../config/supabase.json'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || cfg.url
const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || cfg.anonKey

export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = anonKey
export const isConfigured = Boolean(url && anonKey)

export const supabase = createClient(url || 'https://placeholder.supabase.co', anonKey || 'placeholder', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
})

export const REPO_URL = 'https://github.com/p25prathik-hue/Gmail_Task_Extension'
export const RELEASES_URL = `${REPO_URL}/releases/latest`
