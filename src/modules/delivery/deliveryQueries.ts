import { useEffect, useId } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'

export type DeliveryEstado =
  | 'nueva' | 'retiro_agendado' | 'en_ruta_retiro' | 'en_taller'
  | 'por_entregar' | 'entrega_agendada' | 'en_ruta_entrega' | 'entregada' | 'cancelada'

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
  orden_id: string | null
  entrega_direccion: string | null
  entrega_comuna: string | null
  entrega_referencia: string | null
  entrega_fecha: string | null
  entrega_bloque: string | null
  fotos: string[]
  creado_en: string
  actualizado_en: string
}

export interface DeliveryEvento {
  id: string
  estado_anterior: DeliveryEstado | null
  estado_nuevo: DeliveryEstado
  usuario_id: string | null
  creado_en: string
}

export type DeliveryCambio = Partial<Omit<DeliverySolicitud, 'id' | 'empresa_id' | 'numero' | 'creado_en' | 'actualizado_en'>>

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

// Bloques horarios y comunas del formulario web de la empresa. Son los mismos
// que ve el cliente, para agendar con las mismas opciones.
export function useDeliveryConfig() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['delivery_config', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_formularios')
        .select('configuracion').eq('empresa_id', empresaId!).maybeSingle()
      if (error) throw error
      const cfg = (data?.configuracion ?? {}) as { bloques?: unknown; comunas?: unknown }
      const lista = (v: unknown) => (Array.isArray(v) ? v.map(String).filter(Boolean) : [])
      return { bloques: lista(cfg.bloques), comunas: lista(cfg.comunas) }
    },
    enabled: !!empresaId,
    staleTime: 5 * 60_000,
  })
}

// Con Realtime: una solicitud nueva desde la web o un cambio de estado hecho
// por el trigger de la orden (OT lista → por entregar) aparece sin recargar.
export function useDeliverySolicitudes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const instanceId = useId()

  useEffect(() => {
    if (!empresaId) return
    const channel = supabase
      .channel(`rt-delivery-${empresaId}-${instanceId}-${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'delivery_solicitudes', filter: `empresa_id=eq.${empresaId}` },
        () => {
          void qc.invalidateQueries({ queryKey: ['delivery_solicitudes', empresaId] })
          void qc.invalidateQueries({ queryKey: ['delivery_eventos', empresaId] })
        })
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [empresaId, qc, instanceId])

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

export function useDeliveryEventos(solicitudId: string | undefined) {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['delivery_eventos', empresaId, solicitudId],
    queryFn: async () => {
      const { data, error } = await supabase.from('delivery_eventos')
        .select('id,estado_anterior,estado_nuevo,usuario_id,creado_en')
        .eq('solicitud_id', solicitudId!).order('creado_en', { ascending: true })
      if (error) throw error
      return (data ?? []) as DeliveryEvento[]
    },
    enabled: !!empresaId && !!solicitudId,
  })
}

// Número y estado de las OT enlazadas, para mostrar "OT #3941 · Reparación".
export function useOrdenesDeDelivery(ordenIds: string[]) {
  const { empresaId } = useAuth()
  const ids = [...new Set(ordenIds)].sort()
  return useQuery({
    queryKey: ['delivery_ordenes', empresaId, ids.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase.from('ordenes')
        .select('id,num,status').eq('empresa_id', empresaId!).in('id', ids)
      if (error) throw error
      return new Map((data ?? []).map(o => [o.id as string, { num: String(o.num), status: String(o.status) }]))
    },
    enabled: !!empresaId && ids.length > 0,
  })
}

export function useDeliveryFotos(rutas: string[]) {
  return useQuery({
    queryKey: ['delivery_fotos', rutas.join(',')],
    queryFn: async () => {
      const { data, error } = await supabase.storage.from('delivery-fotos').createSignedUrls(rutas, 60 * 60)
      if (error) throw error
      return (data ?? []).map(d => d.signedUrl).filter((u): u is string => !!u)
    },
    enabled: rutas.length > 0,
    staleTime: 30 * 60_000,
  })
}

export function useActualizarDeliverySolicitud() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...cambio }: { id: string } & DeliveryCambio) => {
      const { error } = await supabase.from('delivery_solicitudes')
        .update(cambio).eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['delivery_solicitudes', empresaId] })
      void qc.invalidateQueries({ queryKey: ['delivery_eventos', empresaId] })
      void qc.invalidateQueries({ queryKey: ['delivery_ordenes', empresaId] })
    },
  })
}
