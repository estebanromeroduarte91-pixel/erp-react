import { supabase } from './supabase'

interface NuevoEquipoData {
  num: string | number
  cliente: string
  modelo: string
  falla?: string
}

// Dispara la Edge Function `send-push-notification`. Nunca debe bloquear ni
// hacer fallar el flujo que la llama (crear una orden, etc.) — solo registra el error.
export async function notifyNuevoEquipo(empresaId: string, data: NuevoEquipoData): Promise<void> {
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: {
        empresaId,
        title: `Nueva orden #OT-${String(data.num).padStart(4, '0')}`,
        body: `${data.cliente} — ${data.modelo}${data.falla ? ` — ${data.falla}` : ''}`,
        url: '/#/taller',
      },
    })
  } catch (e) {
    console.error('No se pudo enviar la notificación push', e)
  }
}
