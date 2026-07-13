import { createClient } from '@supabase/supabase-js'

// Mismas credenciales que el ERP actual (apuntan a la MISMA base de datos)
const SUPABASE_URL = 'https://nfcdqdbhrsjhbnbtqewl.supabase.co'
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mY2RxZGJocnNqaGJuYnRxZXdsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MjU0NDksImV4cCI6MjA5NTQwMTQ0OX0.crMaV1oIodW1fTa2oTmYr2rk8hVLJbQPqUFHe6oFAV8'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Necesario para procesar el enlace de recuperación de contraseña (?code=...)
    // que llega por email y dispara el evento PASSWORD_RECOVERY.
    detectSessionInUrl: true,
    flowType: 'pkce', // token en query string → compatible con HashRouter
    storage: window.localStorage,
    storageKey: 'sb-erp-stevedocs-auth',
  },
})
