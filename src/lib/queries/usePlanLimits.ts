import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { dbGet, dbSet } from '@/lib/db'
import { useAuth } from '@/context/AuthContext'

export type PlanTier = 'starter' | 'pro' | 'scale'

export interface PlanLimits {
  tier: PlanTier
  max_usuarios: number
  max_sucursales: number
}

export const DEFAULT_PLAN_LIMITS: PlanLimits = {
  tier: 'starter',
  max_usuarios: 999,
  max_sucursales: 1
}

// Límites de cada tier — única fuente de verdad usada tanto al activar un plan
// pagado (Panel Pixit) como al asignar el plan del trial (Login.tsx, Scale).
// Usuarios ilimitados en los tres planes — solo cambian sucursales/bodegas
// (mismo concepto, ver combinarCategorias/BodegasTab). 999 = "ilimitado".
export const TIER_LIMITS: Record<PlanTier, { max_usuarios: number; max_sucursales: number }> = {
  starter: { max_usuarios: 999, max_sucursales: 1 },
  pro: { max_usuarios: 999, max_sucursales: 2 },
  scale: { max_usuarios: 999, max_sucursales: 999 },
}

export const TIER_ORDER: PlanTier[] = ['starter', 'pro', 'scale']

// Nombre visible de cada módulo, para listar en pantalla qué incluye/pierde cada tier.
export const MODULO_LABELS: Record<string, string> = {
  taller: 'Órdenes de taller',
  pos: 'Ventas / POS',
  estadisticas: 'Estadísticas',
  mensajes: 'Mensajes y notificaciones',
  accesos: 'Gestión de accesos y cargos',
  gastos: 'Gastos',
  compras: 'Compras (órdenes de compra)',
}

// Módulos habilitados por tier. Starter no incluye POS ni Gastos/Compras;
// Pro y Scale tienen los mismos módulos (Scale solo escala los límites de
// sucursales/bodegas). "Traslado entre sucursales" y "Seguimiento postventa"
// no están en esta lista porque esas funciones todavía no están implementadas
// en el producto — "Gestión inventario" tampoco está acá porque el módulo
// Inventario no está gateado por plan (disponible siempre).
export const PLAN_MODULES: Record<PlanTier, string[]> = {
  starter: ['taller', 'estadisticas', 'mensajes', 'accesos'],
  pro:     ['taller', 'pos', 'estadisticas', 'mensajes', 'accesos', 'gastos', 'compras'],
  scale:   ['taller', 'pos', 'estadisticas', 'mensajes', 'accesos', 'gastos', 'compras'],
}

// Un módulo está habilitado si: el dueño de Pixit lo está viendo (bypass total,
// igual que con trialExpirado/cuentaSuspendida), o la empresa está en período de
// prueba (el trial da acceso al 100% del software, ver AuthContext), o el tier
// de plan pagado de la empresa incluye ese módulo. `esAdmin` (rol dentro de la
// propia empresa) NO exime del gating por plan — son ejes distintos: uno es
// "puede administrar su empresa", el otro es "qué pagó su empresa".
export function usePuedeUsarModulo(modulo: string): boolean {
  const { esPlatformAdmin, planEstado } = useAuth()
  const { data: limits } = usePlanLimits()
  if (esPlatformAdmin) return true
  if (planEstado === 'trial') return true
  const tier = limits?.tier ?? DEFAULT_PLAN_LIMITS.tier
  return PLAN_MODULES[tier].includes(modulo)
}

export function usePlanLimits() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['plan_limits', empresaId],
    queryFn: async () => {
      const limits = await dbGet<PlanLimits>(empresaId!, 'plan_limits')
      return limits ?? DEFAULT_PLAN_LIMITS
    },
    enabled: !!empresaId,
  })
}

// Para uso del administrador (Platform Admin) cuando quiera actualizar el plan de un cliente
export function useUpdatePlanLimits() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ empresaId, limits }: { empresaId: string; limits: PlanLimits }) => {
      await dbSet(empresaId, 'plan_limits', limits)
    },
    onSuccess: (_, variables) => {
      void qc.invalidateQueries({ queryKey: ['plan_limits', variables.empresaId] })
    },
  })
}
