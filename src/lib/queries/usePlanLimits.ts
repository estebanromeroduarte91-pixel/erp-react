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
  max_usuarios: 1,
  max_sucursales: 1
}

// Módulos habilitados por tier. 'pro' y 'scale' heredan todo lo de abajo —
// hoy no hay diferencia de módulos entre pro y scale (Scale solo escala los
// límites de cantidad); "traslados" y "seguimiento_postventa" no están en esta
// lista porque esas funciones todavía no están implementadas en el producto.
export const PLAN_MODULES: Record<PlanTier, string[]> = {
  starter: ['taller', 'pos', 'estadisticas', 'mensajes'],
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
