import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { dbGet } from '@/lib/db'

type Rol = 'admin' | 'encargado' | 'tecnico' | 'vendedor' | string

interface AuthState {
  session: Session | null
  empresaId: string | null
  empresaNombre: string
  rol: Rol
  cargoId: string | null
  branchId: string | null  // null = global (admin sin sucursal), string = operando en esa sucursal
  nombre: string
  cargando: boolean
  planEstado: string | null   // 'trial' | 'activo' | 'vencido' | null (empresas antiguas, sin restricción)
  trialTermina: string | null // ISO date; solo aplica si planEstado === 'trial'
}

interface AuthContextValue extends AuthState {
  esAdmin: boolean  // true solo para el super admin (dueño) — puede eliminar registros
  recoveryMode: boolean  // true cuando el usuario llegó por el enlace de "olvidé mi contraseña"
  trialExpirado: boolean // true si el trial de 30 días ya venció y no hay plan activo
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  clearRecovery: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

const ESTADO_INICIAL: AuthState = {
  session: null,
  empresaId: null,
  empresaNombre: '',
  rol: 'admin',
  cargoId: null,
  branchId: null,
  nombre: '',
  cargando: true,
  planEstado: null,
  trialTermina: null,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<AuthState>(ESTADO_INICIAL)
  const [recoveryMode, setRecoveryMode] = useState(false)

  // Carga el perfil de la empresa para un usuario autenticado (equivale a _iniciarApp)
  async function cargarPerfil(session: Session) {
    const user = session.user
    const { data: perfil } = await supabase
      .from('user_profiles')
      .select('empresa_id,role,nombre,activo')
      .eq('id', user.id)
      .maybeSingle()

    if (perfil?.empresa_id) {
      const [{ data: emp }, uCfg] = await Promise.all([
        supabase.from('empresas').select('nombre,plan_estado,trial_termina').eq('id', perfil.empresa_id).maybeSingle(),
        dbGet<{ cargoId?: string; branchId?: string }>(perfil.empresa_id, `ucfg_${user.id}`),
      ])
      const roleRaw = perfil.role || 'tecnico'
      const cargoId = uCfg?.cargoId || (roleRaw !== 'admin' ? roleRaw : null)
      const rol = cargoId === 'encargado' ? 'encargado' : roleRaw
      const branchId = (roleRaw === 'admin' && !uCfg?.branchId) ? null : (uCfg?.branchId || null)
      setEstado({
        session,
        empresaId: perfil.empresa_id,
        empresaNombre: emp?.nombre || 'TallerPro',
        rol,
        cargoId,
        branchId,
        nombre: perfil.nombre || user.email || '',
        cargando: false,
        planEstado: emp?.plan_estado ?? null,
        trialTermina: emp?.trial_termina ?? null,
      })
    } else {
      // Flujo de propietario: la empresa se busca por owner_id
      const { data: emp } = await supabase
        .from('empresas')
        .select('id,nombre,plan_estado,trial_termina')
        .eq('owner_id', user.id)
        .maybeSingle()
      if (emp?.id) {
        // Crea (idempotente) el perfil admin del dueño — sin esta fila, las políticas
        // RLS de las tablas relacionales (productos, ventas, etc.) bloquean todo.
        await supabase.from('user_profiles').upsert(
          { id: user.id, empresa_id: emp.id, role: 'admin', nombre: emp.nombre, activo: true },
          { onConflict: 'id', ignoreDuplicates: true },
        )
      }
      setEstado({
        session,
        empresaId: emp?.id || null,
        empresaNombre: emp?.nombre || 'TallerPro',
        rol: 'admin',
        cargoId: null,
        branchId: null,
        nombre: emp?.nombre || user.email || '',
        cargando: false,
        planEstado: emp?.plan_estado ?? null,
        trialTermina: emp?.trial_termina ?? null,
      })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) cargarPerfil(data.session)
      else setEstado({ ...ESTADO_INICIAL, cargando: false })
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // El enlace de recuperación de contraseña genera una sesión temporal y dispara
      // PASSWORD_RECOVERY: mostramos la pantalla para fijar la nueva clave.
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (session) cargarPerfil(session)
      else setEstado({ ...ESTADO_INICIAL, cargando: false })
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function login(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      if (error.message.includes('Invalid login')) return 'Email o contraseña incorrectos'
      return error.message
    }
    return null
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  function clearRecovery() {
    setRecoveryMode(false)
  }

  const esAdmin = estado.rol === 'admin'
  const trialExpirado = estado.planEstado === 'trial' && !!estado.trialTermina && new Date(estado.trialTermina) < new Date()

  return <AuthContext.Provider value={{ ...estado, esAdmin, recoveryMode, trialExpirado, login, logout, clearRecovery }}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
