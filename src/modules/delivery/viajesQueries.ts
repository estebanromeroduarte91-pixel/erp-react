import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export interface Motoboy {
  id: string
  empresa_id: string
  nombre: string
  telefono: string
  tarifa_km: number
  minimo_viaje: number
  activo: boolean
}

export interface DeliveryViaje {
  id: string
  empresa_id: string
  solicitud_id: string
  tipo: 'retiro' | 'entrega'
  motoboy_id: string | null
  estado: 'pendiente' | 'asignado' | 'en_ruta' | 'completado' | 'cancelado'
  sucursal_id: string
  sucursal_nombre: string
  sucursal_direccion: string
  cliente_direccion: string
  fecha: string | null
  bloque: string | null
  distancia_km: number | null
  distancia_fuente: 'manual' | 'rutas'
  tarifa_km: number | null
  minimo_viaje: number | null
  monto: number | null
  nota: string | null
}

export function useMotoboys() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['delivery_motoboys', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_motoboys').select('*').eq('empresa_id', empresaId!).order('nombre')
      if (error) throw error
      return (data ?? []) as Motoboy[]
    },
  })
}

export function useViajes() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['delivery_viajes', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_viajes').select('*').eq('empresa_id', empresaId!).order('creado_en', { ascending: false })
      if (error) throw error
      return (data ?? []) as DeliveryViaje[]
    },
  })
}

export function useGuardarMotoboy() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (m: Pick<Motoboy, 'nombre' | 'telefono' | 'tarifa_km' | 'minimo_viaje'> & { id?: string; activo?: boolean }) => {
      const payload = { ...m, empresa_id: empresaId! }
      const { error } = m.id
        ? await supabase.from('delivery_motoboys').update(payload).eq('id', m.id).eq('empresa_id', empresaId!)
        : await supabase.from('delivery_motoboys').insert(payload)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['delivery_motoboys', empresaId] }),
  })
}

export function useGuardarViaje() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Omit<DeliveryViaje, 'id' | 'empresa_id' | 'monto'> & { id?: string }) => {
      const { id } = v
      const resto = {
        solicitud_id: v.solicitud_id, tipo: v.tipo, motoboy_id: v.motoboy_id, estado: v.estado,
        sucursal_id: v.sucursal_id, sucursal_nombre: v.sucursal_nombre,
        sucursal_direccion: v.sucursal_direccion, cliente_direccion: v.cliente_direccion,
        fecha: v.fecha, bloque: v.bloque, distancia_km: v.distancia_km,
        distancia_fuente: v.distancia_fuente, tarifa_km: v.tarifa_km,
        minimo_viaje: v.minimo_viaje, nota: v.nota,
      }
      const { error } = id
        ? await supabase.from('delivery_viajes').update(resto).eq('id', id).eq('empresa_id', empresaId!)
        : await supabase.from('delivery_viajes').insert({ ...resto, empresa_id: empresaId! })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['delivery_viajes', empresaId] }),
  })
}
