import { supabase } from './supabase'

// Registro de errores de runtime en la tabla `error_log` (ver
// supabase/30_error_log.sql). Antes de esto, un error en producción moría en
// la consola del navegador del cliente y nadie se enteraba.
//
// Reglas de oro de este módulo:
//   1. NUNCA lanzar. Si el registro falla, se traga el fallo — reportar un
//      error jamás puede romper la pantalla que lo estaba reportando.
//   2. NUNCA bloquear. Todo es "dispará y olvidate".

/** Tope por sesión: evita que un componente en loop mande miles de filas. */
const MAX_POR_SESION = 10

/** Mensajes de ruido conocido del navegador, sin valor para diagnosticar. */
const IGNORAR = [
  'ResizeObserver loop',           // benigno, lo tira Chrome al redimensionar
  'Non-Error promise rejection',
  'Script error.',                 // error cross-origin sin detalle utilizable
]

let enviados = 0
const yaVistos = new Set<string>()

interface DatosError {
  mensaje: string
  stack?: string
  componente?: string
}

export async function registrarError({ mensaje, stack, componente }: DatosError): Promise<void> {
  try {
    if (!mensaje) return
    if (enviados >= MAX_POR_SESION) return
    if (IGNORAR.some(patron => mensaje.includes(patron))) return

    // Dedupe: el mismo error repetido (ej. un render que falla en cada intento)
    // se registra una sola vez por sesión.
    const huella = `${mensaje}|${(stack ?? '').slice(0, 200)}`
    if (yaVistos.has(huella)) return
    yaVistos.add(huella)
    enviados++

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return   // la policy exige user_id = auth.uid(); sin sesión no se registra

    const { data: perfil } = await supabase
      .from('user_profiles')
      .select('empresa_id')
      .eq('id', user.id)
      .maybeSingle()

    await supabase.from('error_log').insert({
      empresa_id: perfil?.empresa_id ?? null,
      user_id: user.id,
      mensaje: mensaje.slice(0, 2000),
      stack: stack?.slice(0, 5000) ?? null,
      componente: componente?.slice(0, 5000) ?? null,
      ruta: window.location.hash || window.location.pathname,
      user_agent: navigator.userAgent.slice(0, 500),
    })
  } catch {
    // A propósito en silencio: ver regla 1.
  }
}

/**
 * Engancha los errores que NO pasan por el ErrorBoundary de React: los que
 * ocurren fuera del render (handlers de eventos, timers) y las promesas
 * rechazadas sin catch. Se llama una sola vez, al arrancar la app.
 */
export function instalarCapturaGlobalDeErrores(): void {
  window.addEventListener('error', (ev) => {
    void registrarError({
      mensaje: ev.message || String(ev.error ?? 'Error desconocido'),
      stack: ev.error instanceof Error ? ev.error.stack : undefined,
    })
  })

  window.addEventListener('unhandledrejection', (ev) => {
    const motivo = ev.reason
    void registrarError({
      mensaje: motivo instanceof Error ? motivo.message : `Promesa rechazada: ${String(motivo)}`,
      stack: motivo instanceof Error ? motivo.stack : undefined,
    })
  })
}
