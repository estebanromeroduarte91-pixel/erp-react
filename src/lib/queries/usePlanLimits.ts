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
