import React from 'react'
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, fontFamily } from './marca'
import { Entra, Subtitulos, Toque, type Frase } from './piezas'
import { Persona } from './personas'

// "Kits / Equipos" — pantalla ficticia pero fiel a la real: "Nuevo Kit de
// Equipo". Guion: gancho → nombras el equipo, eliges el color, y sus
// componentes (incluidos chasis y tapa de ese color) se cargan solos → cierre.
const E = {
  gancho: [0, 80],
  kit: [80, 310],
  ocDestino: [310, 490],
  recibirStock: [490, 730],
  cierre: [730, 890],
} as const

export const DURACION_KITS = E.cierre[1]

const FRASES: Frase[] = [
  { desde: 6, hasta: 80, texto: 'Kits y equipos en Pixit' },
  { desde: 85, hasta: 148, texto: 'Nombras el equipo y eliges el color' },
  { desde: 151, hasta: 310, texto: 'Y sus componentes se cargan solos, chasis y tapa incluidos' },
  { desde: 315, hasta: 490, texto: 'Y ese kit pasa a una orden de compra, para ingresarlo al stock' },
  { desde: 495, hasta: 590, texto: 'Confirmas la recepción' },
  { desde: 595, hasta: 730, texto: 'y los repuestos del kit entran a stock, listos para vender' },
  { desde: 735, hasta: 885, texto: 'Comenta PIXIT y te mostramos cómo' },
]

const dur = (k: keyof typeof E) => E[k][1] - E[k][0]

// Morado: el color propio de la sección de Kits en la app, distinto del azul de Pixit.
const M = { morado: '#7c3aed', moradoClaro: '#f1ebfe' }

const volumenMusica = (frame: number) => interpolate(
  frame,
  [0, 20, DURACION_KITS - 40, DURACION_KITS],
  [0, 0.16, 0.16, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
)

export const KitsEquipos: React.FC = () => (
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

const CelularNuevo: React.FC = () => (
  <g transform="rotate(8) translate(-58 -238)">
    <rect x="0" y="0" width="120" height="236" rx="22" fill={C.g800} />
    <rect x="8" y="10" width="104" height="216" rx="15" fill="#3c4a5e" />
    <rect x="44" y="16" width="32" height="9" rx="4.5" fill={C.g800} />
    <rect x="8" y="10" width="104" height="80" rx="15" fill="#fff" opacity=".1" />
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
      <Audio src={staticFile('audio/ke-gancho.mp3')} />
      <div style={{
        marginTop: 190, transform: `rotate(-4deg) scale(${titulo})`,
        background: '#fff', border: `8px solid ${C.g800}`, borderRadius: 18, padding: '22px 46px',
        fontSize: 88, fontWeight: 800, color: C.g800, letterSpacing: -2, boxShadow: `14px 14px 0 ${C.azul}`,
      }}>KITS / EQUIPOS</div>
      <div style={{ position: 'absolute', bottom: 390 }}>
        <div style={{ opacity: sPersona, transform: `translateY(${(1 - sPersona) * 160}px) scale(${0.96 + sPersona * 0.04})` }}>
          <Persona delantal levanta={levanta} expresion="feliz" objeto={<CelularNuevo />} ancho={680} />
        </div>
      </div>
      <Mostrador texto="Inventario" />
    </AbsoluteFill>
  )
}

// ── 2. Nuevo Kit de Equipo (fiel a la pantalla real) ─────────────────────────
const COLORES = [
  { nombre: 'Titanio Blanco', hex: '#e4e1da' },
  { nombre: 'Titanio Desierto', hex: '#b7a08a' },
  { nombre: 'Titanio Natural', hex: '#948d82' },
  { nombre: 'Titanio Negro', hex: '#2c2c2e' },
]
const INDICE_ELEGIDO = 1 // Titanio Desierto
const TOQUE_EN = 44

const COMPONENTES = (colorNombre: string) => [
  { nombre: 'Pantalla iPhone 16 Pro', cant: 1, en: 58 },
  { nombre: 'Batería iPhone 16 Pro', cant: 1, en: 78 },
  { nombre: 'Cámara trasera iPhone 16 Pro', cant: 1, en: 98 },
  { nombre: `Chasis ${colorNombre}`, cant: 1, en: 118 },
  { nombre: `Tapa trasera ${colorNombre}`, cant: 1, en: 138 },
]

const Campo: React.FC<{ label: string; valor: string }> = ({ label, valor }) => (
  <div style={{ flex: 1 }}>
    <div style={{ fontSize: 20, fontWeight: 700, color: C.g400, letterSpacing: 1 }}>{label}</div>
    <div style={{ marginTop: 8, background: '#fff', border: `3px solid ${C.g100}`, borderRadius: 14, padding: '18px 22px', fontSize: 28, fontWeight: 700, color: C.g800 }}>{valor}</div>
  </div>
)

const PillColor: React.FC<{ nombre: string; activo: boolean }> = ({ nombre, activo }) => (
  <div style={{
    borderRadius: 999, padding: '14px 22px', fontSize: 23, fontWeight: 700,
    border: `3px solid ${M.morado}`, color: M.morado, background: activo ? M.moradoClaro : '#fff',
    boxShadow: activo ? `0 0 0 5px ${M.moradoClaro}` : 'none', transform: `scale(${activo ? 1.04 : 1})`,
  }}>{nombre}</div>
)

const FilaComponente: React.FC<{ nombre: string; cant: number; en: number }> = ({ nombre, cant, en }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const s = llego ? interpolate(frame - en, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  if (!llego) return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 6px',
      borderBottom: `2px solid ${C.g100}`, transform: `scale(${s})`, opacity: s, transformOrigin: 'left',
    }}>
      <span style={{ fontSize: 25, fontWeight: 700, color: C.g800 }}>{nombre}</span>
      <span style={{ fontSize: 25, fontWeight: 800, color: C.g500 }}>{cant}</span>
    </div>
  )
}

const KitModal: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const sale = saleAl(frame, dur('kit'))
  const elegido = frame >= TOQUE_EN
  const colorElegido = COLORES[INDICE_ELEGIDO]
  const componentes = COMPONENTES(colorElegido.nombre)
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 170, opacity: 1 - sale }}>
      <div style={{ transform: `translateY(${(1 - entra) * 600}px)`, position: 'relative' }}>
        <Audio src={staticFile('audio/ke-kit.mp3')} />
        <div style={{
          width: 940, background: '#fff', borderRadius: 30, boxShadow: '0 40px 90px rgba(21,24,31,.22)',
          padding: '34px 40px', display: 'flex', flexDirection: 'column', gap: 24,
        }}>
          <div style={{ fontSize: 34, fontWeight: 800, color: C.g800, borderBottom: `2px solid ${C.g100}`, paddingBottom: 20 }}>Nuevo Kit de Equipo</div>

          <div style={{ display: 'flex', gap: 20 }}>
            <Campo label="NOMBRE DEL EQUIPO" valor="iPhone 16 Pro" />
            <Campo label="CATEGORÍA" valor="iPhone" />
          </div>

          <div style={{ background: M.moradoClaro, borderRadius: 22, padding: '24px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: M.morado, letterSpacing: 1 }}>COLOR DEL EQUIPO</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {COLORES.map((c, i) => <PillColor key={c.nombre} nombre={c.nombre} activo={elegido && i === INDICE_ELEGIDO} />)}
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: M.morado, opacity: 0.85 }}>
              {elegido ? `✓ Componentes cargados para ${colorElegido.nombre}` : 'Elige un color para cargar los componentes correspondientes'}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 22, fontWeight: 800, color: C.g700, letterSpacing: 1 }}>COMPONENTES / REPUESTOS INTERNOS</div>
            <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', background: C.g100, borderRadius: 10, padding: '10px 16px', fontSize: 20, fontWeight: 700, color: C.g500 }}>
              <span>Componente</span><span>Cant.</span>
            </div>
            {!elegido && (
              <div style={{ padding: '30px 0', textAlign: 'center', fontSize: 23, fontStyle: 'italic', color: C.g400 }}>Elige un color arriba para cargar los componentes…</div>
            )}
            {elegido && componentes.map(c => <FilaComponente key={c.nombre} {...c} />)}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, marginTop: 4 }}>
            <div style={{ borderRadius: 14, border: `3px solid ${C.g100}`, padding: '16px 30px', fontSize: 24, fontWeight: 700, color: C.g500 }}>Cancelar</div>
            <div style={{ borderRadius: 14, background: C.azul, padding: '16px 30px', fontSize: 24, fontWeight: 800, color: '#fff' }}>Crear kit</div>
          </div>
        </div>
        <Toque x={470} y={356} en={TOQUE_EN} />
      </div>
    </AbsoluteFill>
  )
}

// ── 3. El kit pasa a una orden de compra ─────────────────────────────────────
const TOQUE_OC_EN = 46

const OcDestino: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const sale = saleAl(frame, dur('ocDestino'))
  const llegoLinea = frame >= 16
  const creada = frame >= TOQUE_OC_EN
  const s = llegoLinea ? interpolate(frame - 16, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 230, opacity: 1 - sale }}>
      <div style={{ transform: `translateY(${(1 - entra) * 600}px)`, position: 'relative' }}>
        <Audio src={staticFile('audio/ke-ocdestino.mp3')} />
        <div style={{ width: 860, background: '#fff', borderRadius: 30, boxShadow: '0 40px 90px rgba(21,24,31,.22)', padding: '32px 38px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>Nueva OC</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: C.g400, marginTop: 4 }}>Para ingresar el kit al stock</div>
          </div>
          {llegoLinea && (
            <div style={{
              background: M.moradoClaro, borderRadius: 20, padding: '20px 24px', border: `3px solid ${M.morado}`,
              transform: `scale(${s})`, opacity: s, display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ background: M.morado, color: '#fff', fontSize: 16, fontWeight: 800, borderRadius: 999, padding: '4px 12px', letterSpacing: 1 }}>KIT</span>
                  <span style={{ fontSize: 27, fontWeight: 800, color: C.g800 }}>iPhone 16 Pro · Titanio Desierto</span>
                </div>
                <div style={{ fontSize: 20, fontWeight: 600, color: C.g500, marginTop: 6 }}>Con todos sus componentes</div>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.g800 }}>1 un.</div>
            </div>
          )}
          <div style={{
            background: creada ? C.verde : C.azul, color: '#fff', borderRadius: 30, textAlign: 'center', fontSize: 34, fontWeight: 800,
            padding: '26px 0', transform: `scale(${frame >= TOQUE_OC_EN - 6 && frame < TOQUE_OC_EN ? 0.95 : 1})`,
          }}>{creada ? '✓ OC creada' : 'Crear OC'}</div>
        </div>
        <Toque x={430} y={330} en={TOQUE_OC_EN} />
      </div>
    </AbsoluteFill>
  )
}

// ── 4. Recepción: los repuestos del kit entran a stock ──────────────────────
const CONFIRMAR_KIT_EN = 105

const FilaOrdenado: React.FC<{ nombre: string; en: number }> = ({ nombre, en }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const s = llego ? interpolate(frame - en, [0, 6], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  if (!llego) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '10px 0', borderBottom: `2px solid ${C.g100}`, transform: `scale(${s})`, opacity: s }}>
      <span style={{ flex: 2, fontSize: 21, fontWeight: 700, color: C.g800 }}>{nombre}</span>
      <span style={{ flex: 0.6, textAlign: 'center', fontSize: 19, color: C.g500 }}>1</span>
      <span style={{ flex: 0.6, textAlign: 'center', fontSize: 19, color: C.g400 }}>0</span>
      <div style={{ flex: 0.8, display: 'flex', justifyContent: 'center' }}>
        <div style={{ border: `2px solid ${C.g200}`, borderRadius: 8, padding: '5px 14px', fontSize: 19, fontWeight: 800, color: C.g800 }}>1</div>
      </div>
    </div>
  )
}

const FilaStock: React.FC<{ nombre: string; en: number }> = ({ nombre, en }) => {
  const frame = useCurrentFrame()
  const llego = frame >= en
  const s = llego ? interpolate(frame - en, [0, 8], [0.7, 1], { extrapolateRight: 'clamp' }) : 0
  if (!llego) return null
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: C.verdeClaro,
      borderRadius: 16, padding: '14px 22px', transform: `scale(${s})`, opacity: s,
    }}>
      <span style={{ fontSize: 24, fontWeight: 700, color: C.g800 }}>{nombre}</span>
      <span style={{ fontSize: 26, fontWeight: 800, color: C.verde }}>+1</span>
    </div>
  )
}

const RecibirStock: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const sale = saleAl(frame, dur('recibirStock'))
  const confirmado = frame >= CONFIRMAR_KIT_EN
  const presionado = frame >= CONFIRMAR_KIT_EN - 6 && frame < CONFIRMAR_KIT_EN
  const colorElegido = COLORES[INDICE_ELEGIDO]
  const componentes = COMPONENTES(colorElegido.nombre)
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 190, opacity: 1 - sale }}>
      <Audio src={staticFile('audio/ke-recibirstock.mp3')} />
      <div style={{ transform: `translateY(${(1 - entra) * 600}px)`, position: 'relative' }}>
        {!confirmado && (
          <div style={{ width: 860, background: '#fff', borderRadius: 30, boxShadow: '0 40px 90px rgba(21,24,31,.22)', padding: '30px 36px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: C.g800 }}>Nueva Recepción — OC #915</div>
              <div style={{ fontSize: 18, fontWeight: 600, color: C.g400, marginTop: 4 }}>RepuestosPro · 0 recepción(es) previa(s)</div>
            </div>
            <div style={{ display: 'flex', marginTop: 4, background: C.g100, borderRadius: 10, padding: '8px 14px', fontSize: 17, fontWeight: 700, color: C.g500 }}>
              <span style={{ flex: 2 }}>PRODUCTO</span><span style={{ flex: 0.6, textAlign: 'center' }}>ORD.</span>
              <span style={{ flex: 0.6, textAlign: 'center' }}>REC.</span><span style={{ flex: 0.8, textAlign: 'center', color: C.azul }}>A RECIBIR</span>
            </div>
            {componentes.map((c, i) => <FilaOrdenado key={c.nombre} nombre={c.nombre} en={6 + i * 6} />)}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 14, marginTop: 8 }}>
              <div style={{ borderRadius: 12, border: `3px solid ${C.g100}`, padding: '12px 24px', fontSize: 20, fontWeight: 700, color: C.g500 }}>Cancelar</div>
              <div style={{ borderRadius: 12, background: C.verde, padding: '12px 24px', fontSize: 20, fontWeight: 800, color: '#fff', transform: `scale(${presionado ? 0.95 : 1})` }}>✓ Confirmar Recepción</div>
            </div>
          </div>
        )}
        {confirmado && (
          <div style={{ width: 780, background: '#fff', borderRadius: 30, boxShadow: '0 40px 90px rgba(21,24,31,.22)', padding: '34px 40px', display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 30, fontWeight: 800, color: C.g800 }}>Stock actualizado</div>
            {componentes.map((c, i) => <FilaStock key={c.nombre} nombre={c.nombre} en={CONFIRMAR_KIT_EN + 6 + i * 14} />)}
            <div style={{ fontSize: 26, fontWeight: 800, color: C.verde, textAlign: 'center', opacity: frame >= CONFIRMAR_KIT_EN + 90 ? 1 : 0, marginTop: 8 }}>
              ✓ El kit completo queda en stock
            </div>
          </div>
        )}
      </div>
    </AbsoluteFill>
  )
}

// ── 5. Cierre ────────────────────────────────────────────────────────────────
const Cierre: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame: frame - 6, fps, config: { damping: 13 } })
  const caja = spring({ frame: frame - 32, fps, config: { damping: 15 } })
  const escrito = 'PIXIT'.slice(0, Math.max(0, Math.floor((frame - 57) / 6)))
  const enviado = frame >= 96
  return (
    <AbsoluteFill style={{ background: C.azul, alignItems: 'center' }}>
      <Audio src={staticFile('audio/ke-cierre.mp3')} />
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
  gancho: Gancho, kit: KitModal, ocDestino: OcDestino, recibirStock: RecibirStock, cierre: Cierre,
}
