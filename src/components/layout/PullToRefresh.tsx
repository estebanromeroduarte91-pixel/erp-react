import { useState, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const THRESHOLD = 64   // px de arrastre para gatillar la recarga
const MAX = 76         // tope visual del arrastre
const COOLDOWN = 10_000

export function PullToRefresh({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  const lastRefresh = useRef(0)
  const dragged = useRef(false)
  // `active` afecta el render (controla si la transición CSS está activa), así que
  // es estado real, no un ref — leerlo durante el render no está permitido para refs.
  const [active, setActive] = useState(false)

  function onTouchStart(e: React.TouchEvent) {
    const target = e.target as HTMLElement
    // Las tarjetas móviles son <button>. Permitir iniciar el gesto sobre ellas
    // hace que pull-to-refresh funcione en toda la lista; si hubo arrastre, el
    // click posterior se cancela en onClickCapture para no abrir la orden.
    const esCampoEditable = !!target.closest('input, textarea, select, [contenteditable="true"]')
    dragged.current = false
    if (!esCampoEditable && window.scrollY <= 1 && !refreshing && Date.now() - lastRefresh.current >= COOLDOWN && e.touches.length === 1) {
      startY.current = e.touches[0].clientY
      setActive(true)
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!active) return
    const dy = e.touches[0].clientY - startY.current
    if (dy > 8) dragged.current = true
    // solo si sigue arriba y arrastra hacia abajo
    setPull(dy > 0 && window.scrollY <= 1 ? Math.min(dy * 0.5, MAX) : 0)
  }

  async function onTouchEnd() {
    if (!active) return
    setActive(false)
    if (pull >= THRESHOLD && !refreshing) {
      lastRefresh.current = Date.now()
      setRefreshing(true)
      setPull(THRESHOLD)
      // Sólo queries observadas por la pantalla montada. Evita reactivar en
      // segundo plano módulos visitados anteriormente durante esta sesión.
      try { await qc.refetchQueries({ type: 'active' }) } catch { /* noop */ }
      setRefreshing(false)
    }
    setPull(0)
  }

  function onClickCapture(e: React.MouseEvent) {
    if (!dragged.current) return
    e.preventDefault()
    e.stopPropagation()
    dragged.current = false
  }

  function onTouchCancel() {
    setActive(false)
    setPull(0)
    dragged.current = false
  }

  const y = refreshing ? THRESHOLD : pull
  const visible = pull > 0 || refreshing
  const listo = pull >= THRESHOLD

  return (
    <div
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchCancel}
      onClickCapture={onClickCapture}
    >
      <div style={{
        position: 'fixed', top: 'calc(env(safe-area-inset-top, 0px) + 8px)', left: 0, right: 0, zIndex: 510,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        transform: `translateY(${y - 58}px) scale(${visible ? 1 : 0.92})`,
        transition: active ? 'none' : 'transform .2s ease, opacity .2s ease',
        opacity: visible ? 1 : 0,
      }}>
        <div style={{
          height: 38, borderRadius: 999, background: 'rgba(255,255,255,.96)',
          border: '1px solid rgba(148,163,184,.25)',
          boxShadow: '0 6px 18px rgba(15,23,42,.14)', padding: '0 13px',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          color: '#475569', fontSize: 12, fontWeight: 600,
        }}>
          {refreshing ? (
            <>
              <div className="animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" style={{ width: 17, height: 17 }} />
              <span>Actualizando…</span>
            </>
          ) : (
            <>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#3656e6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                style={{ transform: `rotate(${Math.min(pull / THRESHOLD, 1) * 180}deg)`, transition: active ? 'none' : 'transform .2s' }}>
                <path d="M12 5v14m0 0 5-5m-5 5-5-5" />
              </svg>
              <span>{listo ? 'Suelta para actualizar' : 'Desliza para actualizar'}</span>
            </>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
