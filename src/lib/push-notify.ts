import { supabase } from './supabase'

// Dispara la Edge Function `send-push-notification`. Nunca debe bloquear ni
// hacer fallar el flujo que la llama (crear una orden, etc.) — solo registra el error.
export async function notifyNuevoEquipo(empresaId: string, descripcion: string): Promise<void> {
  try {
    await supabase.functions.invoke('send-push-notification', {
      body: {
        empresaId,
        title: 'Nuevo equipo',
        body: `Llegó un equipo: ${descripcion}`,
        url: '/#/taller',
      },
    })
  } catch (e) {
    console.error('No se pudo enviar la notificación push', e)
  }
}
