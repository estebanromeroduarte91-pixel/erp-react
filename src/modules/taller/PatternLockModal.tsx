import { useRef, useState, useEffect, useCallback } from 'react'

const DOT_POS: Record<number, [number, number]> = {
  1: [70, 70],  2: [140, 70],  3: [210, 70],
  4: [70, 140], 5: [140, 140], 6: [210, 140],
  7: [70, 210], 8: [140, 210], 9: [210, 210],
}

// Líneas guía (grilla + diagonales entre puntos adyacentes) para ubicarse rápido
// al dibujar — no son parte de la clave, solo referencia visual, como en el
// desbloqueo por patrón de Android.
const GUIDE_LINES: [number, number][] = [
  [1, 2], [2, 3], [4, 5], [5, 6], [7, 8], [8, 9],
  [1, 4], [4, 7], [2, 5], [5, 8], [3, 6], [6, 9],
  [1, 5], [5, 9], [3, 5], [5, 7],
]

interface Props {
  initial?: number[]
  onSave: (seq: number[]) => void
  onClose: () => void
}

export function PatternLockModal({ initial = [], onSave, onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [seq, setSeq] = useState<number[]>(initial)
  const drawing = useRef(false)
  const current = useRef<{ x: number; y: number } | null>(null)
  const [error, setError] = useState('')

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, 280, 280)
    ctx.fillStyle = '#5B8DD9'
    ctx.beginPath()
    ctx.roundRect(0, 0, 280, 280, 14)
    ctx.fill()

    // Grilla guía tenue entre puntos adyacentes — solo referencia visual, para
    // ubicarse rápido antes/mientras se dibuja.
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    for (const [a, b] of GUIDE_LINES) {
      const [ax, ay] = DOT_POS[a]
      const [bx, by] = DOT_POS[b]
      ctx.beginPath()
      ctx.moveTo(ax, ay)
      ctx.lineTo(bx, by)
      ctx.stroke()
    }

    // Línea entre puntos conectados
    if (seq.length > 1) {
      ctx.strokeStyle = 'rgba(255,255,255,0.85)'
      ctx.lineWidth = 3
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.beginPath()
      seq.forEach((n, i) => {
        const [cx, cy] = DOT_POS[n]
        if (i === 0) ctx.moveTo(cx, cy)
        else ctx.lineTo(cx, cy)
      })
      ctx.stroke()
    }
    // Segmento al cursor mientras se dibuja
    if (drawing.current && current.current && seq.length > 0) {
      const [lx, ly] = DOT_POS[seq[seq.length - 1]]
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(lx, ly)
      ctx.lineTo(current.current.x, current.current.y)
      ctx.stroke()
    }
    // Puntos
    for (const [n, [cx, cy]] of Object.entries(DOT_POS)) {
      const active = seq.includes(Number(n))
      if (active) {
        ctx.beginPath()
        ctx.arc(cx, cy, 20, 0, Math.PI * 2)
        ctx.strokeStyle = '#4CAF50'
        ctx.lineWidth = 3
        ctx.stroke()
      }
      ctx.beginPath()
      ctx.arc(cx, cy, active ? 9 : 6, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,255,255,0.92)'
      ctx.fill()
    }
  }, [seq])

  useEffect(() => { draw() }, [draw])

  function xy(e: React.PointerEvent): { x: number; y: number } {
    const canvas = canvasRef.current!
    const rect = canvas.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) * (280 / rect.width),
      y: (e.clientY - rect.top) * (280 / rect.height),
    }
  }

  function nearest(x: number, y: number): number | null {
    let best: number | null = null
    let bestD = 999
    for (const [n, [cx, cy]] of Object.entries(DOT_POS)) {
      const d = Math.hypot(x - cx, y - cy)
      if (d < 40 && d < bestD) { best = Number(n); bestD = d }
    }
    return best
  }

  function onDown(e: React.PointerEvent) {
    e.preventDefault()
    canvasRef.current?.setPointerCapture(e.pointerId)
    drawing.current = true
    setError('')
    const pos = xy(e)
    current.current = pos
    const dot = nearest(pos.x, pos.y)
    setSeq(dot ? [dot] : [])
  }

  function onMove(e: React.PointerEvent) {
    if (!drawing.current) return
    e.preventDefault()
    const pos = xy(e)
    current.current = pos
    const dot = nearest(pos.x, pos.y)
    if (dot && !seq.includes(dot)) {
      setSeq((s) => [...s, dot])
    } else {
      draw()
    }
  }

  function onUp() {
    drawing.current = false
    current.current = null
    draw()
  }

  function guardar() {
    if (seq.length < 4) { setError('Conecta al menos 4 puntos'); return }
    onSave(seq)
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-5">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
        <h3 className="text-base font-bold text-gray-900 mb-1">Dibuja el patrón</h3>
        <p className="text-xs text-gray-400 mb-4">
          {seq.length === 0
            ? 'Arrastra para conectar al menos 4 puntos'
            : seq.length < 4
              ? `${seq.join(' → ')}  (${seq.length}/4)`
              : `${seq.join(' → ')}  ✓`}
        </p>

        <canvas
          ref={canvasRef}
          width={280}
          height={280}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerLeave={onUp}
          className="w-full max-w-[260px] mx-auto touch-none cursor-pointer rounded-xl"
          style={{ aspectRatio: '1' }}
        />

        {error && <p className="text-sm text-red-500 font-medium mt-3">{error}</p>}

        <div className="flex gap-2 justify-center mt-5">
          <button onClick={() => { setSeq([]); setError('') }}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Limpiar
          </button>
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button onClick={guardar}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">
            Guardar
          </button>
        </div>
      </div>
    </div>
  )
}
