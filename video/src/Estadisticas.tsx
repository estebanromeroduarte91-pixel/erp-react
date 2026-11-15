import React from 'react'
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, fontFamily } from './marca'
import { Entra, Subtitulos, type Frase } from './piezas'
import { Persona } from './personas'

// "Estadísticas" — datos ficticios y rentables, no son las cifras reales de
// ningún taller. Sucursales siempre Providencia y Las Condes.
// Guion: gancho → resumen ejecutivo (KPIs + sucursales) → más vendidos →
// metas y punto de equilibrio → puente de rentabilidad → cierre.
const E = {
  gancho: [0, 90],
  resumen: [90, 470],
  rentabilidad: [470, 810],
  metas: [810, 1030],
  cierre: [1030, 1190],
} as const

export const DURACION_STATS = E.cierre[1]

const FRASES: Frase[] = [
  { desde: 6, hasta: 90, texto: 'Así se ven las estadísticas de tu taller con Pixit' },
  { desde: 95, hasta: 165, texto: 'Ventas, resultado operacional' },
  { desde: 166, hasta: 231, texto: 'y cuánto vende cada sucursal' },
  { desde: 232, hasta: 292, texto: 'los productos que más venden' },
  { desde: 293, hasta: 470, texto: 'y cómo te pagan, todo en un resumen' },
  { desde: 475, hasta: 625, texto: 'Así ves los gastos, las compras y las órdenes completadas, mes a mes' },
  { desde: 626, hasta: 810, texto: 'y el puente de rentabilidad, de la venta al resultado final' },
  { desde: 815, hasta: 1030, texto: 'Con una meta automática, para saber si vas bien' },
  { desde: 1035, hasta: 1185, texto: 'Comenta PIXIT y te mostramos cómo' },
]

const dur = (k: keyof typeof E) => E[k][1] - E[k][0]

const volumenMusica = (frame: number) => interpolate(
  frame,
  [0, 20, DURACION_STATS - 40, DURACION_STATS],
  [0, 0.16, 0.16, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
)

export const Estadisticas: React.FC = () => (
  <AbsoluteFill style={{ background: C.fondo, fontFamily }}>
    <Fondo />
    <Audio src={staticFile('audio/musica-fondo.mp3')} volume={volumenMusica} />
    {(Object.keys(E) as (keyof typeof E)[]).map(k => {
      const Escena = ESCENAS[k]
      return <Sequence key={k} from={E[k][0]} durationInFrames={dur(k)}><Escena /></Sequence>
    })}
    <Subtitulos frases={FRASES} />
  </AbsoluteFill>
)

// ── Fondo ────────────────────────────────────────────────────────────────────
const Fondo: React.FC = () => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 130, height: 16, background: C.azul, opacity: 0.9 }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 420, background: '#e3e6ee' }} />
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 420, height: 10, background: '#d4d8e2' }} />
  </AbsoluteFill>
)

const saleAl = (frame: number, d: number) => interpolate(frame, [d - 14, d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

const Mostrador: React.FC<{ texto: string }> = ({ texto }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 150, height: 90 }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 30, bottom: 0, background: C.g700 }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 34, background: C.g800, borderRadius: 14 }} />
    <div style={{
      position: 'absolute', left: 60, top: -36, transform: 'rotate(-2deg)',
      background: C.azul, color: '#fff', fontSize: 24, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase',
      borderRadius: 10, padding: '9px 22px', boxShadow: '0 8px 18px rgba(21,24,31,.22)',
    }}>{texto}</div>
  </div>
)

/** Gráfico de barras ascendente, calibrado para la mano de Persona. */
const GraficoAscendente: React.FC = () => (
  <g transform="rotate(-6) translate(-70 -170)">
    <rect x="0" y="100" width="36" height="60" rx="6" fill="#fff" opacity=".55" />
    <rect x="46" y="70" width="36" height="90" rx="6" fill="#fff" opacity=".75" />
    <rect x="92" y="30" width="36" height="130" rx="6" fill="#fff" />
    <path d="M6 94 L64 60 L110 20" stroke="#ffd23f" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M92 20 L110 20 L110 38" stroke="#ffd23f" strokeWidth="10" fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </g>
)

// ── 1. Gancho ────────────────────────────────────────────────────────────────
const Gancho: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const titulo = Math.max(spring({ frame: frame - 6, fps, config: { damping: 12 } }), 0.6)
  const levanta = Math.max(spring({ frame: frame - 24, fps, config: { damping: 14, stiffness: 70 } }), 0.2)
  const sPersona = Math.max(spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 120 } }), 0.75)
  return (
    <AbsoluteFill style={{ alignItems: 'center', opacity: 1 - saleAl(frame, dur('gancho')) }}>
      <Audio src={staticFile('audio/es-gancho.mp3')} />
      <div style={{
        marginTop: 190, transform: `rotate(-4deg) scale(${titulo})`,
        background: '#fff', border: `8px solid ${C.g800}`, borderRadius: 18, padding: '22px 46px',
        fontSize: 88, fontWeight: 800, color: C.g800, letterSpacing: -2, boxShadow: `14px 14px 0 ${C.azul}`,
      }}>ESTADÍSTICAS</div>
      <div style={{ position: 'absolute', bottom: 390 }}>
        <div style={{ opacity: sPersona, transform: `translateY(${(1 - sPersona) * 160}px) scale(${0.96 + sPersona * 0.04})` }}>
          <Persona delantal levanta={levanta} expresion="feliz" objeto={<GraficoAscendente />} ancho={680} />
        </div>
      </div>
      <Mostrador texto="Gerencia" />
    </AbsoluteFill>
  )
}

/** Tarjeta base, reutilizada por todas las escenas de dashboard. */
const Tarjeta: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div style={{ background: '#fff', borderRadius: 24, padding: '26px 30px', boxShadow: '0 10px 30px rgba(21,24,31,.08)', ...style }}>{children}</div>
)

const Dashboard: React.FC<{ titulo: string; duracion: number; ancho?: number; children: React.ReactNode }> = ({ titulo, duracion, ancho = 960, children }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const sale = saleAl(frame, duracion)
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 150, opacity: 1 - sale }}>
      <div style={{ transform: `translateY(${(1 - entra) * 500}px)`, width: ancho, display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>{titulo}</div>
        {children}
      </div>
    </AbsoluteFill>
  )
}

// ── 2. Resumen ejecutivo: KPIs + sucursales ──────────────────────────────────
const KPIS = [
  { label: 'VENTAS CON IVA', valor: '$6.850.000', detalle: '65 ventas · neto $5.756.303', variacion: '▲ 22% vs período anterior', color: C.g800, en: 10 },
  { label: 'RESULTADO OPERACIONAL', valor: '$1.284.000', detalle: 'Ventas netas – costo – gastos – corporativo', variacion: '▲ 38% vs período anterior', color: C.verde, en: 22 },
  { label: 'ÓRDENES ENTREGADAS', valor: '58', detalle: 'Reparaciones', variacion: '▲ 18% vs período anterior', color: C.ambar, en: 34 },
  { label: 'TICKET PROMEDIO', valor: '$88.500', detalle: 'Con IVA', variacion: '▲ 6% vs período anterior', color: C.g800, en: 46 },
]

const TarjetaKPI: React.FC<typeof KPIS[number]> = ({ label, valor, detalle, variacion, color, en }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const s = llego ? interpolate(frame - en, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  return (
    <Tarjeta style={{ flex: 1, opacity: s, transform: `scale(${s})` }}>
      <div style={{ fontSize: 15, fontWeight: 800, color: C.g400, letterSpacing: 1 }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 800, color, marginTop: 8 }}>{valor}</div>
      <div style={{ fontSize: 14, fontWeight: 600, color: C.g500, marginTop: 4 }}>{detalle}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: C.verde, marginTop: 6 }}>{variacion}</div>
    </Tarjeta>
  )
}

const BARRA_SUCURSALES = [
  { nombre: 'Las Condes', pct: 62, monto: '$4.247.000', en: 70 },
  { nombre: 'Providencia', pct: 38, monto: '$2.603.000', en: 82 },
]
const RESULTADO_SUCURSALES = [
  { nombre: 'Las Condes', monto: '$742.000', en: 94 },
  { nombre: 'Providencia', monto: '$542.000', en: 106 },
]

const MAS_UNIDADES = [
  { n: 1, nombre: 'Pantalla iPhone 13', valor: '10 un', en: 144 },
  { n: 2, nombre: 'Batería iPhone 13', valor: '8 un', en: 156 },
  { n: 3, nombre: 'Teclado MacBook Air', valor: '5 un', en: 168 },
]
const MAS_DINERO = [
  { n: 1, nombre: 'Cámara trasera iPhone 16 Pro', valor: '$420.000', en: 144 },
  { n: 2, nombre: 'Pantalla iPhone 13', valor: '$380.000', en: 156 },
  { n: 3, nombre: 'Batería MacBook Air', valor: '$275.000', en: 168 },
]
const METODOS_PAGO = [
  { nombre: 'Transferencia', pct: 58, monto: '$3.973.000', en: 205 },
  { nombre: 'GetNet', pct: 40, monto: '$2.740.000', en: 217 },
  { nombre: 'Efectivo', pct: 2, monto: '$137.000', en: 229 },
]

const FilaRanking: React.FC<{ n: number; nombre: string; valor: string; en: number; color: string; fondo: string }> = ({ n, nombre, valor, en, color, fondo }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const s = llego ? interpolate(frame - en, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 14, opacity: s, transform: `scale(${s})`, transformOrigin: 'left' }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: fondo, color, fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{n}</div>
      <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: C.g800 }}>{nombre}</span>
      <span style={{ fontSize: 16, fontWeight: 800, color: C.g800 }}>{valor}</span>
    </div>
  )
}

const Resumen: React.FC = () => {
  const frame = useCurrentFrame()
  return (
    <Dashboard titulo="Resumen ejecutivo" duracion={dur('resumen')}>
      <Audio src={staticFile('audio/es-resumen.mp3')} />
      <div style={{ display: 'flex', gap: 16 }}>{KPIS.map(k => <TarjetaKPI key={k.label} {...k} />)}</div>
      <div style={{ display: 'flex', gap: 16 }}>
        <Tarjeta style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.g800 }}>Ventas por sucursal</div>
          {BARRA_SUCURSALES.map(b => {
            const llego = frame >= b.en
            const w = llego ? interpolate(frame - b.en, [0, 14], [0, b.pct], { extrapolateRight: 'clamp' }) : 0
            return (
              <div key={b.nombre} style={{ marginTop: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: C.g700 }}>
                  <span>{b.nombre}</span><span>{llego ? b.monto : ''}</span>
                </div>
                <div style={{ marginTop: 6, height: 9, borderRadius: 6, background: C.g100 }}>
                  <div style={{ width: `${w}%`, height: '100%', borderRadius: 6, background: C.azul }} />
                </div>
              </div>
            )
          })}
        </Tarjeta>
        <Tarjeta style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.g800 }}>Resultado por sucursal</div>
          {RESULTADO_SUCURSALES.map(r => {
            const llego = frame >= r.en
            const s = llego ? interpolate(frame - r.en, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
            return (
              <div key={r.nombre} style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16, opacity: s }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: C.g700 }}>{r.nombre}</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: C.verde }}>{r.monto}</span>
              </div>
            )
          })}
        </Tarjeta>
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <Tarjeta style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.g800 }}>Más vendidos · unidades</div>
          {MAS_UNIDADES.map(m => <FilaRanking key={m.nombre} {...m} color={C.ambar} fondo={C.ambarClaro} />)}
        </Tarjeta>
        <Tarjeta style={{ flex: 1 }}>
          <div style={{ fontSize: 20, fontWeight: 800, color: C.g800 }}>Más vendidos · dinero</div>
          {MAS_DINERO.map(m => <FilaRanking key={m.nombre} {...m} color={C.verde} fondo={C.verdeClaro} />)}
        </Tarjeta>
      </div>
      <Tarjeta>
        <div style={{ fontSize: 20, fontWeight: 800, color: C.g800 }}>Métodos de pago</div>
        <div style={{ display: 'flex', gap: 24, marginTop: 14 }}>
          {METODOS_PAGO.map(m => {
            const llego = frame >= m.en
            const w = llego ? interpolate(frame - m.en, [0, 12], [0, 100], { extrapolateRight: 'clamp' }) : 0
            return (
              <div key={m.nombre} style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 15, fontWeight: 700, color: C.g700 }}>
                  <span>{m.nombre}</span><span>{llego ? `${m.pct}%` : ''}</span>
                </div>
                <div style={{ marginTop: 6, height: 9, borderRadius: 6, background: C.g100 }}>
                  <div style={{ width: `${w * (m.pct / 100)}%`, height: '100%', borderRadius: 6, background: C.azul }} />
                </div>
                <div style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.g400 }}>{llego ? m.monto : ''}</div>
              </div>
            )
          })}
        </div>
      </Tarjeta>
    </Dashboard>
  )
}

// ── 4. Metas y punto de equilibrio ───────────────────────────────────────────
const Metas: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const barra = spring({ frame: frame - 10, fps, config: { damping: 16 } })
  const pct = 86.7
  return (
    <Dashboard titulo="Metas y punto de equilibrio" duracion={dur('metas')} ancho={900}>
      <Audio src={staticFile('audio/es-metas.mp3')} />
      <Tarjeta>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: C.g400, letterSpacing: 1 }}>META DE TODA LA EMPRESA</div>
            <div style={{ marginTop: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 800, color: C.g800 }}>$5.200.000</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: C.g400 }}> de $6.000.000</span>
            </div>
          </div>
          <div style={{ background: C.verdeClaro, color: C.verde, fontSize: 16, fontWeight: 800, borderRadius: 999, padding: '10px 18px' }}>¡Vas muy bien!</div>
        </div>
        <div style={{ marginTop: 20, height: 16, borderRadius: 8, background: C.g100 }}>
          <div style={{ width: `${pct * barra}%`, height: '100%', borderRadius: 8, background: C.verde }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 18, fontWeight: 800, color: C.verde }}>{(pct * barra).toFixed(1)}% cumplido</div>
        <div style={{ display: 'flex', gap: 16, marginTop: 20 }}>
          {[['Falta por vender', '$800.000'], ['Necesitas vender por día', '$114.000'], ['Proyección al cierre', '$6.420.000']].map(([k, v]) => (
            <div key={k} style={{ flex: 1, background: C.g100, borderRadius: 14, padding: '16px 18px' }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.g500 }}>{k}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: C.g800, marginTop: 4 }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 18, background: C.verdeClaro, borderRadius: 14, padding: '16px 20px', fontSize: 17, fontWeight: 700, color: C.verde,
          opacity: frame >= 60 ? 1 : 0,
        }}>✓ Vas $180.000 sobre el avance esperado. Pixit ya repartió esa diferencia entre los días restantes.</div>
      </Tarjeta>
    </Dashboard>
  )
}

// ── 5. Puente de rentabilidad ────────────────────────────────────────────────
const PUENTE = [
  { label: 'Ventas netas', monto: '$5.756.303', color: C.azul, en: 150 },
  { label: '– Costo vendido', monto: '$-1.726.891', color: C.ambar, en: 166 },
  { label: '= Margen bruto', monto: '$4.029.412', color: C.verde, en: 182 },
  { label: '– Gastos de tienda', monto: '$-1.800.000', color: '#d8413a', en: 198 },
  { label: '= Cuatro paredes', monto: '$2.229.412', color: C.verde, en: 214 },
  { label: '– Corporativo', monto: '$-945.412', color: '#d8413a', en: 230 },
  { label: 'Resultado', monto: '$1.284.000', color: C.verde, en: 246 },
]

const FilaPuente: React.FC<typeof PUENTE[number]> = ({ label, monto, color, en }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const w = llego ? interpolate(frame - en, [0, 12], [0, 100], { extrapolateRight: 'clamp' }) : 0
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12 }}>
      <span style={{ width: 190, fontSize: 17, fontWeight: 700, color: C.g700 }}>{label}</span>
      <div style={{ flex: 1, height: 22, borderRadius: 6, background: C.g100, overflow: 'hidden' }}>
        <div style={{ width: `${w}%`, height: '100%', borderRadius: 6, background: color }} />
      </div>
      <span style={{ width: 130, textAlign: 'right', fontSize: 18, fontWeight: 800, color: C.g800 }}>{llego ? monto : ''}</span>
    </div>
  )
}

// Las tres fichas mensuales: gastos, compras y órdenes completadas.
const MESES = ['Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov']

const GASTOS_MES = [1550000, 1620000, 1700000, 1980000, 2100000, 1800000]
const COMPRAS_MES = [600000, 850000, 1100000, 1050000, 1300000, 980000]
const ORDENES_MES = [38, 42, 45, 51, 55, 58]

const pesos = (n: number) => `$${n.toLocaleString('es-CL')}`

const MiniBarras: React.FC<{
  titulo: string; subtitulo: string; valores: number[]; esDinero: boolean; color: string; en: number
  principales: { nombre: string; pct: number; monto: string }[]
}> = ({ titulo, subtitulo, valores, esDinero, color, en, principales }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const sCard = llego ? interpolate(frame - en, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  const max = Math.max(...valores)
  return (
    <Tarjeta style={{ flex: 1, padding: '18px 18px', opacity: sCard, transform: `scale(${sCard})` }}>
      <div style={{ fontSize: 16, fontWeight: 800, color: C.g800 }}>{titulo}</div>
      <div style={{ fontSize: 11, fontWeight: 600, color: C.g400, marginTop: 2 }}>{subtitulo}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 50, marginTop: 10 }}>
        {valores.map((v, i) => {
          const h = Math.max(4, (v / max) * 46)
          const barEn = en + 6 + i * 4
          const barLlego = frame >= barEn
          const bh = barLlego ? interpolate(frame - barEn, [0, 8], [0, h], { extrapolateRight: 'clamp' }) : 0
          return <div key={i} style={{ flex: 1, height: bh, borderRadius: 3, background: i === valores.length - 1 ? color : `${color}66` }} />
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, fontWeight: 600, color: C.g400, marginTop: 4 }}>
        {MESES.map(m => <span key={m}>{m}</span>)}
      </div>
      <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800, color: C.g800 }}>
        {esDinero ? pesos(valores[valores.length - 1]) : `${valores[valores.length - 1]} órd.`}
        <span style={{ fontSize: 11, fontWeight: 600, color: C.g400 }}> (actual)</span>
      </div>
      {principales.map((p, i) => {
        const pEn = en + 30 + i * 8
        const pLlego = frame >= pEn
        const w = pLlego ? interpolate(frame - pEn, [0, 10], [0, p.pct], { extrapolateRight: 'clamp' }) : 0
        return (
          <div key={p.nombre} style={{ marginTop: 8, opacity: pLlego ? 1 : 0 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.g500 }}>{p.nombre}</div>
            <div style={{ height: 6, borderRadius: 3, background: C.g100, marginTop: 3 }}>
              <div style={{ width: `${w}%`, height: '100%', borderRadius: 3, background: color }} />
            </div>
          </div>
        )
      })}
    </Tarjeta>
  )
}

const Rentabilidad: React.FC = () => (
  <Dashboard titulo="Puente de rentabilidad" duracion={dur('rentabilidad')} ancho={940}>
    <Audio src={staticFile('audio/es-rentabilidad.mp3')} />
    <div style={{ display: 'flex', gap: 14 }}>
      <MiniBarras
        titulo="Gastos por mes" subtitulo="Últimos 6 meses" valores={GASTOS_MES} esDinero color="#d8413a" en={10}
        principales={[{ nombre: 'Sueldos · 55%', pct: 55, monto: '' }, { nombre: 'Arriendo · 14%', pct: 14, monto: '' }]}
      />
      <MiniBarras
        titulo="Compras por mes" subtitulo="OC recibidas" valores={COMPRAS_MES} esDinero color={C.azul} en={24}
        principales={[{ nombre: 'RepuestosPro · 48%', pct: 48, monto: '' }, { nombre: 'ImportCell · 20%', pct: 20, monto: '' }]}
      />
      <MiniBarras
        titulo="Órdenes completadas" subtitulo="Reparaciones" valores={ORDENES_MES} esDinero={false} color={C.ambar} en={38}
        principales={[{ nombre: 'Ticket prom. $88.500', pct: 100, monto: '' }]}
      />
    </div>
    <Tarjeta>
      <div style={{ fontSize: 18, fontWeight: 600, color: C.g500 }}>De la venta al resultado operacional</div>
      <div style={{ marginTop: 10 }}>{PUENTE.map(p => <FilaPuente key={p.label} {...p} />)}</div>
    </Tarjeta>
  </Dashboard>
)

// ── 6. Cierre ────────────────────────────────────────────────────────────────
const Cierre: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame: frame - 6, fps, config: { damping: 13 } })
  const caja = spring({ frame: frame - 32, fps, config: { damping: 15 } })
  const escrito = 'PIXIT'.slice(0, Math.max(0, Math.floor((frame - 57) / 6)))
  const enviado = frame >= 96
  return (
    <AbsoluteFill style={{ background: C.azul, alignItems: 'center' }}>
      <Audio src={staticFile('audio/es-cierre.mp3')} />
      <div style={{ marginTop: 230, transform: `scale(${logo})`, background: '#fff', borderRadius: 48, padding: '50px 70px' }}>
        <Img src={staticFile('logo-pixit.png')} style={{ height: 150 }} />
      </div>
      <div style={{ marginTop: 40, color: '#fff', fontSize: 44, fontWeight: 700, opacity: logo }}>Sistema para servicio técnico</div>
      <div style={{ marginTop: 120, color: '#fff', fontSize: 84, fontWeight: 800, letterSpacing: -2, opacity: caja, textAlign: 'center', lineHeight: 1.05 }}>
        ¿Lo quieres<br />en tu taller?
      </div>
      <div style={{
        marginTop: 50, width: 860, background: '#fff', borderRadius: 999, padding: '20px 20px 20px 50px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', opacity: caja, transform: `translateY(${(1 - caja) * 60}px)`,
        boxShadow: '0 24px 60px rgba(0,0,0,.25)',
      }}>
        <span style={{ fontSize: 56, fontWeight: 800, color: escrito ? C.g800 : C.g400 }}>
          {escrito || 'Escribe un comentario…'}{!enviado && frame % 20 < 10 && escrito ? '|' : ''}
        </span>
        <span style={{
          background: enviado ? C.verde : C.azul, color: '#fff', borderRadius: 999, padding: '26px 40px', fontSize: 38, fontWeight: 800,
        }}>{enviado ? '✓' : 'Publicar'}</span>
      </div>
      <div style={{ marginTop: 70, color: '#fff', fontSize: 64, fontWeight: 800, opacity: caja }}>pixit.cl</div>
    </AbsoluteFill>
  )
}

const ESCENAS: Record<keyof typeof E, React.FC> = {
  gancho: Gancho, resumen: Resumen, metas: Metas, rentabilidad: Rentabilidad, cierre: Cierre,
}
