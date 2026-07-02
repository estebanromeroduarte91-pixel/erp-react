import { useState, useRef, useEffect, useCallback } from 'react'
import type { CSSProperties } from 'react'

// Mide la posición de un elemento ancla (input, botón, campo) para posicionar
// un desplegable con `position: fixed`, de modo que escape del `overflow` de
// cualquier contenedor (modales con scroll) y no se corte.
export function useAnchorRect<T extends HTMLElement>(active: boolean) {
  const ref = useRef<T>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)

  const measure = useCallback(() => {
    if (ref.current) setRect(ref.current.getBoundingClientRect())
  }, [])

  useEffect(() => {
    if (!active) return
    measure()
    const onMove = () => measure()
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [active, measure])

  return { ref, rect }
}

// Estilo `position: fixed` para el desplegable, anclado al rect del elemento.
// - align 'left' (default): alinea el borde izquierdo con el ancla, ancho = ancla.
// - align 'right': alinea el borde derecho con el ancla (para menús de ancho fijo).
// - voltea hacia arriba si no hay espacio abajo.
export function fixedDropdownStyle(
  rect: DOMRect | null,
  opts: { align?: 'left' | 'right'; width?: number; maxHeight?: number } = {},
): CSSProperties {
  if (!rect) return { display: 'none' }
  const { align = 'left', maxHeight = 260 } = opts
  const width = opts.width ?? rect.width
  const vh = window.innerHeight
  const vw = window.innerWidth
  let left = align === 'right' ? rect.right - width : rect.left
  left = Math.max(8, Math.min(left, vw - width - 8))
  const flipUp = rect.bottom + 4 + maxHeight > vh && rect.top > maxHeight
  const base: CSSProperties = {
    position: 'fixed', left, width, right: 'auto', zIndex: 3000,
  }
  return flipUp ? { ...base, bottom: vh - rect.top + 4 } : { ...base, top: rect.bottom + 4 }
}
