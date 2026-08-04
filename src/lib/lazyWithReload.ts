import { lazy, type ComponentType } from 'react'

// Cuando se despliega una nueva versión, Netlify borra los chunks viejos del
// build anterior. Una pestaña que quedó abierta desde antes del deploy sigue
// pidiendo esos archivos por su nombre (hash) viejo al navegar a un módulo
// lazy-loaded — el servidor responde 404 y la carga del módulo revienta,
// dejando la pantalla en blanco (solo se arregla con un F5 manual).
//
// Este wrapper detecta ese caso específico y fuerza un reload automático
// (trae el index.html nuevo con los hashes correctos) — usa sessionStorage
// para no entrar en loop si el archivo sigue faltando por otra razón.
//
// La marca se borra apenas un módulo carga bien: antes se guardaba una sola
// vez por sesión y nunca se limpiaba, así que el auto-reload servía solo para
// el PRIMER deploy con la pestaña abierta. Del segundo en adelante el guard
// bloqueaba el reload y el error caía en el ErrorBoundary ("Algo salió mal").
// Con la limpieza, el guard sigue evitando el loop (si el chunk nunca carga,
// la marca nunca se borra) pero se recupera de cada deploy nuevo.
const KEY_RELOAD = 'pixit_reload_tras_chunk_error'

// Un `location.reload()` a secas NO alcanzaba: el navegador puede responder con
// el index.html cacheado, que sigue apuntando a los mismos chunks muertos. La
// página recargaba, volvía a fallar, y como el guard ya había marcado "recargué
// una vez", el segundo error caía en el ErrorBoundary y la pantalla quedaba en
// blanco igual. Se vio en el registro de errores: el mismo fallo repitiéndose
// a las 18:25, 18:29, 18:30 y 18:38 del 2026-08-03.
//
// Cambiar la URL (agregando un parámetro que varía) fuerza al navegador a pedir
// un documento distinto, así que no puede servir la copia vieja. Se conserva el
// hash porque ahí vive la ruta actual (HashRouter).
export function urlConCacheBust(href: string, marca = Date.now().toString(36)): string {
  const url = new URL(href)
  url.searchParams.set('_v', marca)
  return url.toString()
}

export function recargarSinCache(): void {
  window.location.replace(urlConCacheBust(window.location.href))
}

export function lazyWithReload<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): ReturnType<typeof lazy<T>> {
  return lazy(() =>
    factory()
      .then((mod) => {
        sessionStorage.removeItem(KEY_RELOAD)
        return mod
      })
      .catch((err: unknown) => {
        const msg = String(err instanceof Error ? err.message : err)
        const esErrorDeChunk = /Failed to fetch dynamically imported module|Importing a module script failed|Loading chunk|dynamically imported module/i.test(msg)
        if (esErrorDeChunk && !sessionStorage.getItem(KEY_RELOAD)) {
          sessionStorage.setItem(KEY_RELOAD, '1')
          recargarSinCache()
          // Nunca se resuelve: la página se recarga antes de que importe.
          return new Promise<{ default: T }>(() => {})
        }
        throw err
      }),
  )
}
