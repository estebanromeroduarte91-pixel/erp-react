import { useState, useRef, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'

const THRESHOLD = 70   // px de arrastre para gatillar la recarga
const MAX = 90         // tope visual del arrastre

export function PullToRefresh({ children }: { children: ReactNode }) {
  const qc = useQueryClient()
  const [pull, setPull] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const startY = useRef(0)
  // `active` afecta el render (controla si la transición CSS está activa), así que
  // es estado real, no un ref — leerlo durante el render no está permitido para refs.
  const [active, setActive] = useState(false)

  function onTouchStart(e: React.TouchEvent) {
    if (window.scrollY <= 0 && !refreshing && e.touches.length === 1) {
      startY.current = e.touches[0].clientY
      setActive(true)
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!active) return
    const dy = e.touches[0].clientY - startY.current
    // solo si sigue arriba y arrastra hacia abajo
    setPull(dy > 0 && window.scrollY <= 0 ? Math.min(dy * 0.5, MAX) : 0)
  }

  async function onTouchEnd() {
    if (!active) return
    setActive(false)
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true)
      setPull(THRESHOLD)
      try { await qc.refetchQueries() } catch { /* noop */ }
      setRefreshing(false)
    }
    setPull(0)
  }

  const y = refreshing ? THRESHOLD : pull
  const visible = pull > 0 || refreshing

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 300,
        display: 'flex', justifyContent: 'center', pointerEvents: 'none',
        transform: `translateY(${y - 44}px)`,
        transition: active ? 'none' : 'transform .2s ease, opacity .2s ease',
        opacity: visible ? 1 : 0,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: '50%', background: '#fff',
          boxShadow: '0 2px 8px rgba(0,0,0,.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {refreshing ? (
            <div className="animate-spin rounded-full border-2 border-gray-200 border-t-blue-600" style={{ width: 18, height: 18 }} />
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3656e6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ transform: `rotate(${Math.min(pull / THRESHOLD, 1) * 270}deg)`, transition: active ? 'none' : 'transform .2s' }}>
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          )}
        </div>
      </div>
      {children}
    </div>
  )
}
