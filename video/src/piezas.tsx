import React from 'react'
import { interpolate, spring, useCurrentFrame, useVideoConfig, Img, staticFile } from 'remotion'
import { C, fontFamily } from './marca'

// ── Teléfono con la app ──────────────────────────────────────────────────────
// Pantallas de Pixit simplificadas: pocas palabras y botones grandes, para que
// se entiendan en un celular sin leer nada.
export const Telefono: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div style={{
    width: 760, height: 1180, borderRadius: 90, background: C.g800, padding: 26,
    boxShadow: '0 40px 90px rgba(21,24,31,.28)',
  }}>
    <div style={{ width: '100%', height: '100%', borderRadius: 66, background: '#f6f7f9', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily }}>
      <div style={{ height: 150, flexShrink: 0, background: '#fff', borderBottom: `3px solid ${C.g100}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '0 48px 26px' }}>
        <Img src={staticFile('logo-pixit.png')} style={{ height: 52 }} />
        <span style={{ fontSize: 30, fontWeight: 700, color: C.g500 }}>{titulo}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', padding: '40px 44px', display: 'flex', flexDirection: 'column', gap: 26 }}>{children}</div>
    </div>
  </div>
)

/** Aparece con un rebote suave desde `desde` (en cuadros, relativo a la escena). */
export const Entra: React.FC<{ desde?: number; children: React.ReactNode; y?: number; style?: React.CSSProperties }> = ({ desde = 0, children, y = 40, style }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s = spring({ frame: frame - desde, fps, config: { damping: 14, stiffness: 120 } })
  return <div style={{ opacity: s, transform: `translateY(${(1 - s) * y}px) scale(${0.96 + s * 0.04})`, ...style }}>{children}</div>
}

/** Un toque del dedo: círculo que se achica y una onda que se abre. */
export const Toque: React.FC<{ x: number; y: number; en: number }> = ({ x, y, en }) => {
  const frame = useCurrentFrame()
  const t = frame - en
  if (t < -12 || t > 22) return null
  const llega = interpolate(t, [-12, 0], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const presion = t >= 0 && t < 6 ? 0.82 : 1
  const onda = interpolate(t, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <div style={{ position: 'absolute', left: x - 55, top: y - 55, width: 110, height: 110, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: `8px solid ${C.azul}`, opacity: t >= 0 ? 1 - onda : 0, transform: `scale(${1 + onda * 1.4})` }} />
      <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: 'rgba(21,24,31,.32)', border: '5px solid #fff', opacity: llega * (t > 14 ? 1 - (t - 14) / 8 : 1), transform: `scale(${presion})` }} />
    </div>
  )
}

// ── Subtítulos palabra por palabra ───────────────────────────────────────────
export type Frase = { desde: number; hasta: number; texto: string }

export const Subtitulos: React.FC<{ frases: Frase[] }> = ({ frases }) => {
  const frame = useCurrentFrame()
  const actual = frases.find(f => frame >= f.desde && frame < f.hasta)
  if (!actual) return null
  const palabras = actual.texto.split(' ')
  // Ritmo de lectura cómodo: una palabra cada 8 cuadros como máximo, y la
  // frase completa queda en pantalla el resto de la escena.
  const porPalabra = Math.min(8, (actual.hasta - actual.desde - 6) / palabras.length)
  const visibles = Math.min(palabras.length, Math.floor((frame - actual.desde) / porPalabra) + 1)
  return (
    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 250, display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '6px 22px', fontFamily }}>
      {palabras.slice(0, visibles).map((p, i) => {
        const nueva = i === visibles - 1
        const s = nueva ? interpolate(frame - (actual.desde + i * porPalabra), [0, 5], [0.6, 1], { extrapolateRight: 'clamp' }) : 1
        return (
          <span key={i} style={{
            fontSize: 78, fontWeight: 800, letterSpacing: -1, lineHeight: 1.15,
            color: nueva ? '#ffd23f' : '#fff', transform: `scale(${s})`, display: 'inline-block',
            WebkitTextStroke: '11px #15181f', paintOrder: 'stroke fill',
            textShadow: '0 6px 0 rgba(21,24,31,.35)',
          }}>{p}</span>
        )
      })}
    </div>
  )
}
