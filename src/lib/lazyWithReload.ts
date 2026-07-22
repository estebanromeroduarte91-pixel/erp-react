import { lazy, type ComponentType } from 'react'

// Cuando se despliega una nueva versión, Netlify borra los chunks viejos del
// build anterior. Una pestaña que quedó abierta desde antes del deploy sigue
// pidiendo esos archivos por su nombre (hash) viejo al navegar a un módulo
// lazy-loaded — el servidor responde 404 y la carga del módulo revienta,
// dejando la pantalla en blanco (solo se arregla con un F5 manual).
//
// Este wrapper detecta ese caso específico y fuerza UN solo reload automático
// (trae el index.html nuevo con los hashes correctos) — usa sessionStorage
// para no entrar en loop si el archivo sigue faltando por otra razón.
export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(() =>
    factory().catch((err: unknown) => {
      const msg = String(err instanceof Error ? err.message : err)
      const esErrorDeChunk = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|dynamically imported module/i.test(msg)
      const key = 'pixit_reload_tras_chunk_error'
      if (esErrorDeChunk && !sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, '1')
        window.location.reload()
        // Nunca se resuelve: la página se recarga antes de que importe.
        return new Promise<{ default: T }>(() => {})
      }
      throw err
    }),
  )
}
