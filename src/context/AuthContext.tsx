import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { dbGet, dbSet } from '@/lib/db'
import { TIER_LIMITS } from '@/lib/queries/usePlanLimits'
import { EQUIPOS_SEED } from '@/lib/seed/equiposSeed'

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
  impersonatedEmpresaId: string | null
  impersonatedEmpresaNombre: string | null
}

interface AuthContextValue extends AuthState {
  esAdmin: boolean  // true solo para el super admin (dueño) — puede eliminar registros
  esPlatformAdmin: boolean // true solo para el dueño de Pixit — ve/gestiona TODAS las empresas
  recoveryMode: boolean  // true cuando el usuario llegó por el enlace de "olvidé mi contraseña"
  trialExpirado: boolean // true si el trial de 30 días ya venció y no hay plan activo
  cuentaSuspendida: boolean // true si un platform admin marcó la empresa como 'suspendida'
  login: (email: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  clearRecovery: () => void
  startImpersonation: (id: string, nombre: string) => void
  stopImpersonation: () => void
  realEmpresaId: string | null
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
  impersonatedEmpresaId: null,
  impersonatedEmpresaNombre: null,
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<AuthState>(ESTADO_INICIAL)
  const [recoveryMode, setRecoveryMode] = useState(false)
  const [esPlatformAdmin, setEsPlatformAdmin] = useState(false)

  // Primer ingreso de un dueño que confirmó su correo: crea la empresa/trial a
  // partir de los datos que dejó en user_metadata al registrarse. Antes esto se
  // hacía en el propio registro, pero con la confirmación de correo la empresa no
  // debe existir hasta que la persona confirme (evita cuentas basura / spam).
  async function bootstrapEmpresaDesdeMetadata(user: User) {
    const nombre = ((user.user_metadata?.empresa_nombre as string) || '').trim()
    if (!nombre) return null
    const trialTermina = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: empData, error } = await supabase.from('empresas').insert({
      nombre, owner_id: user.id, plan_estado: 'trial', trial_termina: trialTermina,
    }).select('id,nombre,plan_estado,trial_termina').single()
    if (error || !empData) {
      // Carrera (el índice único por owner_id la rechazó): la empresa ya se creó
      // en un render paralelo, la reutilizamos en vez de duplicarla.
      const { data: existente } = await supabase.from('empresas')
        .select('id,nombre,plan_estado,trial_termina').eq('owner_id', user.id).maybeSingle()
      return existente ?? null
    }
    // Trial al 100%: se deja el tier en Scale para que al vencer el trial sin
    // upgrade la empresa quede en el tier más alto, no en Starter.
    await dbSet(empData.id, 'plan_limits', { tier: 'scale', ...TIER_LIMITS.scale })
    await dbSet(empData.id, 'tp_equipos', EQUIPOS_SEED)
    // El lead pasa de 'registrado' a 'confirmado' y queda vinculado a la empresa.
    await supabase.from('leads').update({
      estado: 'confirmado', empresa_id: empData.id, confirmado_en: new Date().toISOString(),
    }).eq('user_id', user.id).then(() => {}, () => {})
    return empData
  }

  // Carga el perfil de la empresa para un usuario autenticado (equivale a _iniciarApp)
  async function cargarPerfil(session: Session) {
    const user = session.user

    // Independiente de a qué empresa pertenece: ¿es el dueño de Pixit?
    supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle()
      .then(({ data }) => setEsPlatformAdmin(!!data))

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
      const savedImpersonatedId = sessionStorage.getItem('pixit_impersonated_id')
      const savedImpersonatedNombre = sessionStorage.getItem('pixit_impersonated_nombre')

      setEstado({
        session,
        empresaId: perfil.empresa_id,
        empresaNombre: emp?.nombre || 'Mi Empresa',
        rol,
        cargoId,
        branchId,
        nombre: perfil.nombre || user.email || '',
        cargando: false,
        planEstado: emp?.plan_estado ?? null,
        trialTermina: emp?.trial_termina ?? null,
        impersonatedEmpresaId: savedImpersonatedId,
        impersonatedEmpresaNombre: savedImpersonatedNombre,
      })
    } else {
      // Flujo de propietario: la empresa se busca por owner_id
      const { data: empExistente } = await supabase
        .from('empresas')
        .select('id,nombre,plan_estado,trial_termina')
        .eq('owner_id', user.id)
        .maybeSingle()
      // Si aún no existe pero hay datos de registro en user_metadata, es el primer
      // ingreso confirmado: se crea aquí la empresa/trial.
      const emp = empExistente?.id ? empExistente : await bootstrapEmpresaDesdeMetadata(user)
      if (emp?.id) {
        // Crea (idempotente) el perfil admin del dueño — sin esta fila, las políticas
        // RLS de las tablas relacionales (productos, ventas, etc.) bloquean todo.
        await supabase.from('user_profiles').upsert(
          { id: user.id, empresa_id: emp.id, role: 'admin', nombre: emp.nombre, activo: true },
          { onConflict: 'id', ignoreDuplicates: true },
        )
      }
      
      const savedImpersonatedId = sessionStorage.getItem('pixit_impersonated_id')
      const savedImpersonatedNombre = sessionStorage.getItem('pixit_impersonated_nombre')

      setEstado({
        session,
        empresaId: emp?.id || null,
        empresaNombre: emp?.nombre || 'Mi Empresa',
        rol: 'admin',
        cargoId: null,
        branchId: null,
        nombre: emp?.nombre || user.email || '',
        cargando: false,
        planEstado: emp?.plan_estado ?? null,
        trialTermina: emp?.trial_termina ?? null,
        impersonatedEmpresaId: savedImpersonatedId,
        impersonatedEmpresaNombre: savedImpersonatedNombre,
      })
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) cargarPerfil(data.session)
      else { setEstado({ ...ESTADO_INICIAL, cargando: false }); setEsPlatformAdmin(false) }
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      // El enlace de recuperación de contraseña genera una sesión temporal y dispara
      // PASSWORD_RECOVERY: mostramos la pantalla para fijar la nueva clave.
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true)
      if (session) cargarPerfil(session)
      else { setEstado({ ...ESTADO_INICIAL, cargando: false }); setEsPlatformAdmin(false) }
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

  function startImpersonation(id: string, nombre: string) {
    if (!esPlatformAdmin) return
    sessionStorage.setItem('pixit_impersonated_id', id)
    sessionStorage.setItem('pixit_impersonated_nombre', nombre)
    window.location.href = window.location.pathname + '#/'
    window.location.reload()
  }

  function stopImpersonation() {
    sessionStorage.removeItem('pixit_impersonated_id')
    sessionStorage.removeItem('pixit_impersonated_nombre')
    window.location.href = window.location.pathname + '#/pixit-admin'
    window.location.reload()
  }

  const esAdmin = estado.rol === 'admin'
  const trialExpirado = estado.planEstado === 'trial' && !!estado.trialTermina && new Date(estado.trialTermina) < new Date()
  const cuentaSuspendida = estado.planEstado === 'suspendida'

  const value: AuthContextValue = {
    ...estado,
    realEmpresaId: estado.empresaId,
    empresaId: estado.impersonatedEmpresaId || estado.empresaId,
    empresaNombre: estado.impersonatedEmpresaNombre || estado.empresaNombre,
    esAdmin,
    esPlatformAdmin,
    recoveryMode,
    trialExpirado,
    cuentaSuspendida,
    login,
    logout,
    clearRecovery,
    startImpersonation,
    stopImpersonation,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
