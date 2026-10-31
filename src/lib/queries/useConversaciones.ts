import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { extraerMensajeError } from '@/lib/edgeError'
import { useAuth } from '@/context/AuthContext'
import type { Conversacion, MensajeConversacion } from '@/lib/conversaciones'

// La bandeja se refresca sola cada 30 s: el cron trae correos cada 2 min, así
// que un correo nuevo aparece en pantalla a lo más ~2,5 min después.
const REFRESCO_MS = 30_000

export interface EstadoCorreoEntrante {
  activo: boolean
  imap_host: string | null
  ultima_revision: string | null
  ultimo_error: string | null
}

export function useCorreoEntrante() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['correo_entrante', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('correo_entrante')
        .select('activo,imap_host,ultima_revision,ultimo_error')
        .eq('empresa_id', empresaId!)
        .maybeSingle()
      if (error) throw error
      return data as EstadoCorreoEntrante | null
    },
    enabled: !!empresaId,
    refetchInterval: REFRESCO_MS,
  })
}

export function useConversaciones() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['conversaciones', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversaciones')
        .select('id,canal,contacto_externo,contacto_nombre,asunto,ultimo_mensaje_en,ultimo_extracto,ultima_direccion,no_leidos,estado')
        .eq('empresa_id', empresaId!)
        .order('ultimo_mensaje_en', { ascending: false })
        .limit(300)
      if (error) throw error
      return (data ?? []) as Conversacion[]
    },
    enabled: !!empresaId,
    refetchInterval: REFRESCO_MS,
  })
}

export function useMensajesConversacion(conversacionId: string | null) {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['conversacion_mensajes', conversacionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conversacion_mensajes')
        .select('id,conversacion_id,direccion,de_nombre,de_direccion,asunto,texto,adjuntos,enviado_en')
        .eq('empresa_id', empresaId!)
        .eq('conversacion_id', conversacionId!)
        .order('enviado_en', { ascending: true })
      if (error) throw error
      return (data ?? []) as MensajeConversacion[]
    },
    enabled: !!empresaId && !!conversacionId,
    refetchInterval: REFRESCO_MS,
  })
}

export function useActualizarConversacion() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, cambios }: { id: string; cambios: Partial<Pick<Conversacion, 'no_leidos' | 'estado'>> }) => {
      const { error } = await supabase.from('conversaciones').update(cambios).eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onMutate: async ({ id, cambios }) => {
      // Optimista: marcar leído o cerrar se ve al instante en la lista.
      qc.setQueryData<Conversacion[]>(['conversaciones', empresaId], lista =>
        lista?.map(c => c.id === id ? { ...c, ...cambios } : c))
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['conversaciones', empresaId] }),
  })
}

export function useResponderConversacion() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ conversacionId, texto }: { conversacionId: string; texto: string }) => {
      const { data, error } = await supabase.functions.invoke('conversacion-responder', {
        body: { conversacion_id: conversacionId, texto, empresa_id: empresaId },
      })
      if (error) throw new Error(await extraerMensajeError(error, 'No se pudo enviar la respuesta'))
      if (!data?.ok) throw new Error(data?.error || 'No se pudo enviar la respuesta')
      return data as { ok: true; aviso?: string }
    },
    onSuccess: (_d, { conversacionId }) => {
      qc.invalidateQueries({ queryKey: ['conversacion_mensajes', conversacionId] })
      qc.invalidateQueries({ queryKey: ['conversaciones', empresaId] })
    },
  })
}

export function useSincronizarCorreo() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('correo-entrante-sync', { body: { empresa_id: empresaId } })
      if (error) throw new Error(await extraerMensajeError(error, 'No se pudo revisar el correo'))
      return data as { ok: boolean; nuevos?: number; error?: string }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['conversaciones', empresaId] })
      qc.invalidateQueries({ queryKey: ['correo_entrante', empresaId] })
      qc.invalidateQueries({ queryKey: ['conversacion_mensajes'] })
    },
  })
}

export function useActivarCorreoEntrante() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (activo: boolean) => {
      const { error } = await supabase.rpc('fn_correo_entrante_activar', { p_activo: activo, p_empresa_id: empresaId })
      if (error) throw error
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['correo_entrante', empresaId] }),
  })
}
