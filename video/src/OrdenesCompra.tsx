import React from 'react'
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, fontFamily } from './marca'
import { Entra, Subtitulos, Toque, type Frase } from './piezas'
import { Persona } from './personas'

// "Órdenes de compra" — datos ficticios, pantalla fiel a la real "Nueva Orden
// de Compra": cada línea de producto elige su propia bodega destino, así que
// una sola OC reparte el stock entre varias sucursales.
const E = {
  gancho: [0, 80],
  proveedor: [80, 190],
  nuevaOC: [190, 400],
  guardar: [400, 510],
  recibir: [510, 770],
  stock: [770, 940],
  cierre: [940, 1100],
} as const

export const DURACION_OC = E.cierre[1]

const FRASES: Frase[] = [
  { desde: 6, hasta: 80, texto: 'Así se hace una orden de compra a tu proveedor' },
  { desde: 85, hasta: 190, texto: 'Eliges el proveedor' },
  { desde: 195, hasta: 245, texto: 'Agregas cada producto' },
  { desde: 248, hasta: 295, texto: 'pueden ser varios productos' },
  { desde: 298, hasta: 400, texto: 'Y cada línea elige su propia bodega destino' },
  { desde: 405, hasta: 510, texto: 'Guardas, y la orden queda pendiente' },
  { desde: 515, hasta: 770, texto: 'Cuando llega, registras la recepción' },
  { desde: 775, hasta: 940, texto: 'Y el stock se reparte solo, sucursal por sucursal' },
  { desde: 945, hasta: 1095, texto: 'Comenta PIXIT y te mostramos cómo' },
]

const dur = (k: keyof typeof E) => E[k][1] - E[k][0]

const volumenMusica = (frame: number) => interpolate(
  frame,
  [0, 20, DURACION_OC - 40, DURACION_OC],
  [0, 0.16, 0.16, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
)

export const OrdenesCompra: React.FC = () => (
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

/** Escena con el teléfono centrado: entra desde abajo y sale hacia arriba. */
const Telefono2: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
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

const ConTelefono: React.FC<{ titulo: string; duracion: number; children: React.ReactNode; toques?: { x: number; y: number; en: number }[] }> = ({ titulo, duracion, children, toques = [] }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const sale = interpolate(frame, [duracion - 14, duracion], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 190 }}>
      <div style={{ position: 'relative', transform: `translateY(${(1 - entra) * 700 - sale * 120}px)`, opacity: 1 - sale }}>
        <Telefono2 titulo={titulo}>{children}</Telefono2>
        {toques.map((t, i) => <Toque key={i} {...t} />)}
      </div>
    </AbsoluteFill>
  )
}

const saleAl = (frame: number, d: number) => interpolate(frame, [d - 14, d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

// ── Mostrador + caja (misma identidad que Recibir equipo) ────────────────────
const Mostrador: React.FC = () => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 150, height: 90 }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 30, bottom: 0, background: C.g700 }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 34, background: C.g800, borderRadius: 14 }} />
    <div style={{
      position: 'absolute', left: 60, top: -36, transform: 'rotate(-2deg)',
      background: C.azul, color: '#fff', fontSize: 24, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase',
      borderRadius: 10, padding: '9px 22px', boxShadow: '0 8px 18px rgba(21,24,31,.22)',
    }}>Bodega</div>
  </div>
)

/** Caja de mercadería que el técnico sostiene, calibrada para la mano de Persona. */
const CajaOC: React.FC = () => (
  <g transform="rotate(6) translate(-70 -190)">
    <rect x="0" y="0" width="140" height="110" rx="10" fill="#c99a5b" />
    <rect x="0" y="0" width="140" height="34" rx="10" fill="#b8824a" />
    <path d="M0 34 L70 58 L140 34" stroke="#8f6534" strokeWidth="4" fill="none" />
    <rect x="46" y="40" width="48" height="26" rx="4" fill="#fff" opacity=".9" />
    <text x="70" y="59" fontSize="16" fontWeight="800" fill={C.g700} textAnchor="middle">OC</text>
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
      <Audio src={staticFile('audio/oc-gancho.mp3')} />
      <div style={{
        marginTop: 170, transform: `rotate(-4deg) scale(${titulo})`,
        background: '#fff', border: `8px solid ${C.g800}`, borderRadius: 18, padding: '22px 40px',
        fontSize: 78, fontWeight: 800, color: C.g800, letterSpacing: -2, boxShadow: `14px 14px 0 ${C.azul}`,
      }}>ÓRDENES DE COMPRA</div>
      <div style={{ position: 'absolute', bottom: 390 }}>
        <div style={{ opacity: sPersona, transform: `translateY(${(1 - sPersona) * 160}px) scale(${0.96 + sPersona * 0.04})` }}>
          <Persona delantal levanta={levanta} expresion="feliz" objeto={<CajaOC />} ancho={680} />
        </div>
      </div>
      <Mostrador />
    </AbsoluteFill>
  )
}

// ── 1b. Líneas de producto por sucursal ───────────────────────────────────
const pesos = (n: number) => `$${n.toLocaleString('es-CL')}`

const LINEAS = [
  { nombre: 'Pantalla iPhone 13', bodega: 'Providencia', cant: 10, precio: 38000, tocaEn: 10 },
  { nombre: 'Batería iPhone 13', bodega: 'Las Condes', cant: 10, precio: 15000, tocaEn: 42 },
  { nombre: 'Teclado MacBook Air', bodega: 'Providencia', cant: 4, precio: 42000, tocaEn: 74 },
  { nombre: 'Batería MacBook Air', bodega: 'Las Condes', cant: 4, precio: 55000, tocaEn: 106 },
]

const FilaLinea: React.FC<{ nombre: string; bodega: string; cant: number; precio: number; en: number }> = ({ nombre, bodega, cant, precio, en }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const s = llego ? interpolate(frame - en, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  if (!llego) return null
  const esProvidencia = bodega === 'Providencia'
  return (
    <div style={{
      background: '#fff', borderRadius: 18, padding: '16px 20px', border: `3px solid ${C.g100}`,
      transform: `scale(${s})`, opacity: s, display: 'flex', flexDirection: 'column', gap: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 26, fontWeight: 800, color: C.g800 }}>{nombre}</span>
        <span style={{ fontSize: 24, fontWeight: 800, color: C.g800 }}>{pesos(cant * precio)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 19, fontWeight: 800, borderRadius: 999, padding: '5px 14px',
          background: esProvidencia ? C.azulClaro : C.verdeClaro, color: esProvidencia ? C.azul : C.verde,
        }}>→ {bodega}</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: C.g400 }}>{cant} un. × {pesos(precio)}</span>
      </div>
    </div>
  )
}

// ── 2. Elegir proveedor ───────────────────────────────────────────────────────
const PROVEEDORES = [
  { nombre: 'Comercial RepuestosPro', rut: '76.123.456-7' },
  { nombre: 'ImportCell SpA', rut: '77.456.123-4' },
  { nombre: 'Distribuidora Andina', rut: '76.987.654-3' },
]

const Proveedor: React.FC = () => {
  const frame = useCurrentFrame()
  const elegido = frame >= 40
  return (
    <ConTelefono titulo="Nueva OC" duracion={dur('proveedor')} toques={[{ x: 380, y: 420, en: 36 }]}>
      <Audio src={staticFile('audio/oc-proveedor.mp3')} />
      <Entra desde={6}><div style={{ fontSize: 28, fontWeight: 700, color: C.g500 }}>Elige el proveedor</div></Entra>
      {PROVEEDORES.map((p, i) => {
        const activo = elegido && i === 0
        return (
          <Entra key={p.nombre} desde={8 + i * 5}>
            <div style={{
              background: activo ? C.azulClaro : '#fff', borderRadius: 22, padding: '24px 28px',
              border: `4px solid ${activo ? C.azul : C.g100}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              transform: `scale(${activo ? 1.02 : 1})`,
            }}>
              <div>
                <div style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>{p.nombre}</div>
                <div style={{ fontSize: 23, fontWeight: 600, color: C.g400 }}>{p.rut}</div>
              </div>
              {activo && <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.azul, color: '#fff', fontSize: 28, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
            </div>
          </Entra>
        )
      })}
    </ConTelefono>
  )
}

// ── 3. Nueva OC: líneas de producto ──────────────────────────────────────────
const NuevaOC: React.FC = () => {
  const frame = useCurrentFrame()
  const totalReal = LINEAS.filter(l => frame >= l.tocaEn + 8).reduce((a, l) => a + l.cant * l.precio, 0)
  return (
    <ConTelefono titulo="Nueva OC" duracion={dur('nuevaOC')} toques={LINEAS.map(l => ({ x: 620, y: 328, en: l.tocaEn }))}>
      <Audio src={staticFile('audio/oc-nuevaoc.mp3')} />
      <Entra desde={4}><div style={{ fontSize: 27, fontWeight: 700, color: C.g500 }}>Comercial RepuestosPro</div></Entra>
      <Entra desde={10}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 24, fontWeight: 800, color: C.g700 }}>Productos</span>
          <span style={{ fontSize: 20, fontWeight: 800, color: C.azul, border: `3px solid ${C.azul}`, borderRadius: 12, padding: '8px 16px' }}>+ Agregar línea</span>
        </div>
      </Entra>
      {LINEAS.map(l => <FilaLinea key={l.nombre} {...l} en={l.tocaEn + 8} />)}
      <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 2px' }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: C.g500 }}>Total</span>
        <span style={{ fontSize: 38, fontWeight: 800, color: C.g800 }}>{pesos(totalReal)}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, color: C.verde, textAlign: 'center', opacity: frame >= 108 ? 1 : 0 }}>
        ✓ Cada línea elige su propia bodega destino
      </div>
    </ConTelefono>
  )
}

// ── 4. Guardar ───────────────────────────────────────────────────────────────
const Guardar: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const presionado = frame >= 26 && frame < 33
  const toast = spring({ frame: frame - 36, fps, config: { damping: 14 } })
  return (
    <ConTelefono titulo="Nueva OC" duracion={dur('guardar')}>
      <Audio src={staticFile('audio/oc-guardar.mp3')} />
      <Entra desde={6}>
        <div style={{ background: '#fff', borderRadius: 26, border: `3px solid ${C.g100}`, padding: 32, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {[['Proveedor', 'RepuestosPro'], ['Líneas', '4 · 2 equipos'], ['Bodegas', 'Providencia y Las Condes'], ['Total', pesos(918000)]].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28 }}>
              <span style={{ fontWeight: 600, color: C.g400 }}>{k}</span><span style={{ fontWeight: 800, color: C.g800, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
        </div>
      </Entra>
      <div style={{ position: 'relative' }}>
        <Entra desde={16}>
          <div style={{
            background: C.azul, color: '#fff', borderRadius: 30, textAlign: 'center', fontSize: 50, fontWeight: 800,
            padding: '38px 0', transform: `scale(${presionado ? 0.95 : 1})`, boxShadow: `0 16px 36px ${C.azulMedio}`,
          }}>Crear OC</div>
        </Entra>
        <Toque x={380} y={1010} en={26} />
        <div style={{
          position: 'absolute', left: 20, right: 20, top: -110, background: C.g800, color: '#fff', borderRadius: 24,
          padding: '26px 30px', fontSize: 34, fontWeight: 800, textAlign: 'center',
          opacity: toast, transform: `scale(${0.8 + toast * 0.2})`,
        }}>✓ OC #882 creada · Pendiente</div>
      </div>
    </ConTelefono>
  )
}

// ── 5. Recibir: modal de recepción, fiel a la pantalla real ─────────────────
const CONFIRMAR_EN = 150

const FilaRecepcion: React.FC<{ nombre: string; bodega: string; cant: number; en: number }> = ({ nombre, bodega, cant, en }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const s = llego ? interpolate(frame - en, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  if (!llego) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '16px 0', borderBottom: `2px solid ${C.g100}`, transform: `scale(${s})`, opacity: s, transformOrigin: 'left' }}>
      <div style={{ flex: 1.7 }}>
        <div style={{ fontSize: 23, fontWeight: 800, color: C.g800 }}>{nombre}</div>
        <div style={{
          display: 'inline-block', marginTop: 6, fontSize: 18, fontWeight: 700, borderRadius: 8, padding: '4px 12px',
          background: C.g100, color: C.g500,
        }}>{bodega} ▾</div>
      </div>
      <div style={{ flex: 0.7, textAlign: 'center', fontSize: 22, color: C.g500 }}>{cant}</div>
      <div style={{ flex: 0.7, textAlign: 'center', fontSize: 22, color: C.g400 }}>0</div>
      <div style={{ flex: 0.9, display: 'flex', justifyContent: 'center' }}>
        <div style={{ border: `2px solid ${C.g200}`, borderRadius: 10, padding: '8px 18px', fontSize: 22, fontWeight: 800, color: C.g800 }}>{cant}</div>
      </div>
    </div>
  )
}

const Recibir: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const sale = saleAl(frame, dur('recibir'))
  const presionado = frame >= CONFIRMAR_EN - 6 && frame < CONFIRMAR_EN
  const toast = spring({ frame: frame - CONFIRMAR_EN, fps, config: { damping: 14 } })
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 150, opacity: 1 - sale }}>
      <div style={{ transform: `translateY(${(1 - entra) * 600}px)`, position: 'relative' }}>
        <Audio src={staticFile('audio/oc-recibir.mp3')} />
        <div style={{ width: 980, background: '#fff', borderRadius: 30, boxShadow: '0 40px 90px rgba(21,24,31,.22)', padding: '32px 38px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>Nueva Recepción — OC #882</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: C.g400, marginTop: 4 }}>RepuestosPro · 0 recepción(es) previa(s)</div>
          </div>
          <div style={{ display: 'flex', gap: 24, borderTop: `2px solid ${C.g100}`, paddingTop: 20 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.g400, letterSpacing: 1 }}>ÍTEMS DE LA OC</div>
              <div style={{ display: 'flex', marginTop: 10, background: C.g100, borderRadius: 10, padding: '10px 14px', fontSize: 18, fontWeight: 700, color: C.g500 }}>
                <span style={{ flex: 1.7 }}>PRODUCTO</span><span style={{ flex: 0.7, textAlign: 'center' }}>ORD.</span>
                <span style={{ flex: 0.7, textAlign: 'center' }}>REC.</span><span style={{ flex: 0.9, textAlign: 'center', color: C.azul }}>A RECIBIR</span>
              </div>
              {LINEAS.map((l, i) => <FilaRecepcion key={l.nombre} nombre={l.nombre} bodega={l.bodega} cant={l.cant} en={16 + i * 16} />)}
              <Entra desde={90}>
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 19, fontWeight: 800, color: C.g400, letterSpacing: 1 }}>NOTAS (OPCIONAL)</div>
                  <div style={{ marginTop: 8, border: `2px solid ${C.g100}`, borderRadius: 12, padding: '14px 18px', fontSize: 20, color: C.g400, fontStyle: 'italic' }}>Ej: llegó sin embalaje original…</div>
                </div>
              </Entra>
            </div>
            <div style={{ width: 230, background: C.g100, borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 19, fontWeight: 800, color: C.g500, letterSpacing: 1 }}>HISTORIAL</div>
              <div style={{ marginTop: 10, fontSize: 19, color: C.g400, fontStyle: 'italic' }}>Sin recepciones previas</div>
            </div>
          </div>
          <Entra desde={100}>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 4 }}>
              <div style={{ borderRadius: 14, border: `3px solid ${C.g100}`, padding: '16px 30px', fontSize: 24, fontWeight: 700, color: C.g500 }}>Cancelar</div>
              <div style={{
                borderRadius: 14, background: C.verde, padding: '16px 30px', fontSize: 24, fontWeight: 800, color: '#fff',
                transform: `scale(${presionado ? 0.95 : 1})`,
              }}>✓ Confirmar Recepción</div>
            </div>
          </Entra>
        </div>
        <Toque x={860} y={930} en={CONFIRMAR_EN} />
        <div style={{
          position: 'absolute', left: 40, right: 40, bottom: -90, background: C.g800, color: '#fff', borderRadius: 24,
          padding: '22px 30px', fontSize: 30, fontWeight: 800, textAlign: 'center',
          opacity: toast, transform: `scale(${0.8 + toast * 0.2})`,
        }}>✓ Recepción registrada</div>
      </div>
    </AbsoluteFill>
  )
}

// ── 6. Stock repartido por sucursal ──────────────────────────────────────────
const Stock: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const s1 = spring({ frame: frame - 20, fps, config: { damping: 13 } })
  const s2 = spring({ frame: frame - 44, fps, config: { damping: 13 } })
  return (
    <ConTelefono titulo="Stock" duracion={dur('stock')}>
      <Audio src={staticFile('audio/oc-stock.mp3')} />
      <Entra desde={6}><div style={{ fontSize: 28, fontWeight: 700, color: C.g500 }}>Se reparte solo, sucursal por sucursal</div></Entra>
      <div style={{ background: C.azulClaro, borderRadius: 24, padding: '28px 30px', opacity: s1, transform: `scale(${0.9 + s1 * 0.1})` }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: C.azul }}>Providencia</div>
        <div style={{ fontSize: 46, fontWeight: 800, color: C.g800, marginTop: 4 }}>+14 unidades</div>
      </div>
      <div style={{ background: C.verdeClaro, borderRadius: 24, padding: '28px 30px', opacity: s2, transform: `scale(${0.9 + s2 * 0.1})` }}>
        <div style={{ fontSize: 30, fontWeight: 800, color: C.verde }}>Las Condes</div>
        <div style={{ fontSize: 46, fontWeight: 800, color: C.g800, marginTop: 4 }}>+14 unidades</div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color: C.verde, textAlign: 'center', opacity: frame >= 80 ? 1 : 0, marginTop: 'auto' }}>
        ✓ Desde una sola orden de compra
      </div>
    </ConTelefono>
  )
}

// ── 7. Cierre ────────────────────────────────────────────────────────────────
const Cierre: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame: frame - 6, fps, config: { damping: 13 } })
  const caja = spring({ frame: frame - 32, fps, config: { damping: 15 } })
  const escrito = 'PIXIT'.slice(0, Math.max(0, Math.floor((frame - 57) / 6)))
  const enviado = frame >= 96
  return (
    <AbsoluteFill style={{ background: C.azul, alignItems: 'center' }}>
      <Audio src={staticFile('audio/oc-cierre.mp3')} />
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
  gancho: Gancho, proveedor: Proveedor, nuevaOC: NuevaOC, guardar: Guardar, recibir: Recibir, stock: Stock, cierre: Cierre,
}
