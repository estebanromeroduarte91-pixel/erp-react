import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export type DeliveryEstado = 'nueva' | 'contactada' | 'agendada' | 'en_retiro' | 'recibida' | 'cancelada'

export interface DeliverySolicitud {
  id: string
  empresa_id: string
  numero: number
  estado: DeliveryEstado
  nombre: string
  apellido: string
  rut: string
  telefono: string
  email: string | null
  direccion: string
  comuna: string
  region: string | null
  referencia_direccion: string | null
  tipo_equipo: string
  marca: string | null
  modelo: string | null
  falla: string
  fecha_preferida: string | null
  bloque_horario: string | null
  observaciones: string | null
  notas_internas: string | null
  creado_en: string
  actualizado_en: string
}

export function useDeliveryHabilitado() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['empresa_modulo', empresaId, 'delivery'],
    queryFn: async () => {
      const { data, error } = await supabase.from('empresa_modulos')
        .select('activo').eq('empresa_id', empresaId!).eq('modulo', 'delivery').maybeSingle()
      if (error) throw error
      return data?.activo === true
    },
    enabled: !!empresaId,
    staleTime: 60_000,
  })
}

export function useDeliverySolicitudes() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['delivery_solicitudes', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_solicitudes')
        .select('*').eq('empresa_id', empresaId!).order('creado_en', { ascending: false })
      if (error) throw error
      return (data ?? []) as DeliverySolicitud[]
    },
    enabled: !!empresaId,
  })
}

export function useActualizarDeliverySolicitud() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...cambio }: Pick<DeliverySolicitud, 'id'> & Partial<Pick<DeliverySolicitud, 'estado' | 'notas_internas'>>) => {
      const { error } = await supabase.from('delivery_solicitudes')
        .update({ ...cambio, actualizado_en: new Date().toISOString() })
        .eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['delivery_solicitudes', empresaId] }),
  })
}

