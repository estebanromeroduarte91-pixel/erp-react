import React from 'react'
import { AbsoluteFill, Audio, Img, interpolate, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import QRCode from 'qrcode'
import { C, fontFamily } from './marca'
import { Entra, Subtitulos, Telefono, Toque, type Frase } from './piezas'
import { CelularCliente, CelularTrizado } from './personas'
import { Persona } from './personasPremium'

// "Así se recibe un equipo con Pixit" — ~61 segundos.
// Guion: gancho → nueva orden → datos → fotos de ingreso → checklist →
// guardar + etiqueta → aviso al cliente → seguimiento → llamado a comentar.
// Ritmo pausado: cada paso tiene tiempo para leerse antes del siguiente.
const E = {
  gancho: [0, 100],
  inicio: [100, 230],
  datos: [230, 430],
  fotos: [430, 910],
  checklist: [910, 1090],
  guardar: [1090, 1250],
  aviso: [1250, 1390],
  estados: [1390, 1550],
  cierre: [1550, 1720],
} as const

export const DURACION = E.cierre[1]

const FRASES: Frase[] = [
  { desde: 8, hasta: 100, texto: 'Así se recibe un equipo con Pixit' },
  { desde: 105, hasta: 230, texto: 'Abres Pixit y tocas Nueva orden' },
  { desde: 235, hasta: 430, texto: 'Anotas el cliente, el equipo, la falla y la clave' },
  { desde: 435, hasta: 515, texto: 'Escaneas el QR de la orden con tu celular' },
  { desde: 520, hasta: 680, texto: 'Y le sacas fotos al equipo cuando llega' },
  { desde: 685, hasta: 910, texto: 'Las fotos llegan solas a la orden' },
  { desde: 915, hasta: 1090, texto: 'Y revisas el checklist frente al cliente' },
  { desde: 1095, hasta: 1250, texto: 'Guardas y sale la etiqueta con QR' },
  { desde: 1255, hasta: 1390, texto: 'Al cliente le llega el aviso enseguida' },
  { desde: 1395, hasta: 1550, texto: 'Y lo sigues paso a paso hasta entregarlo' },
  { desde: 1555, hasta: 1715, texto: 'Comenta PIXIT y te mostramos cómo' },
]

const dur = (k: keyof typeof E) => E[k][1] - E[k][0]

// Música de fondo bajo la narración: entra con un fade suave y se apaga al final.
const volumenMusica = (frame: number) => interpolate(
  frame,
  [0, 20, DURACION - 40, DURACION],
  [0, 0.16, 0.16, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
)

export const RecibirEquipoPremium: React.FC = () => (
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
const ConTelefono: React.FC<{ titulo: string; duracion: number; children: React.ReactNode; toques?: { x: number; y: number; en: number }[] }> = ({ titulo, duracion, children, toques = [] }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const sale = interpolate(frame, [duracion - 14, duracion], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 190 }}>
      <div style={{ position: 'relative', transform: `translateY(${(1 - entra) * 700 - sale * 120}px)`, opacity: 1 - sale }}>
        <Telefono titulo={titulo}>{children}</Telefono>
        {toques.map((t, i) => <Toque key={i} {...t} />)}
      </div>
    </AbsoluteFill>
  )
}

const saleAl = (frame: number, d: number) => interpolate(frame, [d - 14, d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

// ── 1. Gancho ────────────────────────────────────────────────────────────────
// Portada: el mostrador del taller, el cliente deja el equipo y el técnico lo recibe.
const Mostrador: React.FC = () => (
  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 150, height: 90 }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 30, bottom: 0, background: C.g700 }} />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 34, background: C.g800, borderRadius: 14 }} />
    <div style={{
      position: 'absolute', left: 60, top: -36, transform: 'rotate(-2deg)',
      background: C.azul, color: '#fff', fontSize: 24, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase',
      borderRadius: 10, padding: '9px 22px', boxShadow: '0 8px 18px rgba(21,24,31,.22)',
    }}>Recepción</div>
  </div>
)

/** Antebrazo y mano del cliente entrando desde el borde, entregando el equipo. */
const ManoCliente: React.FC<{ frame: number }> = ({ frame }) => {
  const llega = interpolate(frame, [0, 16], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const opacity = 1 - interpolate(frame, [24, 32], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <svg width={260} height={220} viewBox="0 0 260 220" style={{ position: 'absolute', right: -40, bottom: 330, opacity, transform: `translateX(${llega * 220}px)` }}>
      <polygon points="260,180 110,150 116,118 260,128" fill="#e9b98f" />
      <circle cx="104" cy="134" r="30" fill="#e9b98f" />
      <g transform="translate(26 82) rotate(-10)">
        <rect width="92" height="182" rx="18" fill={C.g800} />
        <rect x="7" y="9" width="78" height="164" rx="12" fill="#3a4152" />
        <path d="M54 32 l-13 44 l24 24 l-30 50" stroke="#e8ecf5" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}

const Gancho: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const titulo = Math.max(spring({ frame: frame - 6, fps, config: { damping: 12 } }), 0.6)
  const levanta = Math.max(spring({ frame: frame - 24, fps, config: { damping: 14, stiffness: 70 } }), 0.2)
  // El primer cuadro del video se usa como miniatura al compartirlo (Mensajes,
  // Finder, etc.), así que la escena ya se ve completa desde el cuadro 0, sin
  // depender de que la animación de entrada haya avanzado.
  const sPersona = Math.max(spring({ frame: frame - 4, fps, config: { damping: 14, stiffness: 120 } }), 0.75)
  return (
    <AbsoluteFill style={{ alignItems: 'center', opacity: 1 - saleAl(frame, dur('gancho')) }}>
      <Audio src={staticFile('audio/gancho.mp3')} />
      <div style={{
        marginTop: 170, transform: `rotate(-4deg) scale(${titulo})`,
        background: '#fff', border: `8px solid ${C.g800}`, borderRadius: 18, padding: '22px 46px',
        fontSize: 92, fontWeight: 800, color: C.g800, letterSpacing: -2, boxShadow: `14px 14px 0 ${C.azul}`,
      }}>RECIBIR UN EQUIPO</div>
      <div style={{ position: 'absolute', bottom: 390 }}>
        <div style={{ opacity: sPersona, transform: `translateY(${(1 - sPersona) * 160}px) scale(${0.96 + sPersona * 0.04})` }}>
          <Persona delantal levanta={levanta} expresion="feliz" objeto={<CelularTrizado />} ancho={680} />
        </div>
      </div>
      <ManoCliente frame={frame} />
      <Mostrador />
    </AbsoluteFill>
  )
}

// ── 2. Inicio de la app ──────────────────────────────────────────────────────
const Tarjeta: React.FC<{ n: string; label: string; color: string; fondo: string }> = ({ n, label, color, fondo }) => (
  <div style={{ flex: 1, background: '#fff', borderRadius: 28, border: `3px solid ${C.g100}`, padding: '30px 30px 26px' }}>
    <div style={{ display: 'inline-block', background: fondo, color, fontWeight: 800, fontSize: 64, borderRadius: 18, padding: '0 22px' }}>{n}</div>
    <div style={{ fontSize: 30, fontWeight: 600, color: C.g500, marginTop: 12 }}>{label}</div>
  </div>
)

const Inicio: React.FC = () => {
  const frame = useCurrentFrame()
  const presionado = frame >= 72 && frame < 81
  return (
    <>
    <Audio src={staticFile('audio/inicio.mp3')} />
    <ConTelefono titulo="Inicio" duracion={dur('inicio')} toques={[{ x: 380, y: 640, en: 72 }]}>
      <Entra desde={10}><div style={{ fontSize: 50, fontWeight: 800, color: C.g800 }}>Taller</div>
        <div style={{ fontSize: 30, fontWeight: 600, color: C.g500 }}>Hoy · 3 equipos en el taller</div></Entra>
      <Entra desde={18}><div style={{ display: 'flex', gap: 24 }}>
        <Tarjeta n="2" label="En chequeo" color={C.ambar} fondo={C.ambarClaro} />
        <Tarjeta n="1" label="Listos" color={C.verde} fondo={C.verdeClaro} />
      </div></Entra>
      <Entra desde={28}><div style={{
        marginTop: 6, background: C.azul, color: '#fff', borderRadius: 30, textAlign: 'center',
        fontSize: 52, fontWeight: 800, padding: '36px 0', transform: `scale(${presionado ? 0.95 : 1})`,
        boxShadow: `0 16px 36px ${C.azulMedio}`,
      }}>+ Nueva orden</div></Entra>
      <Entra desde={38}><div style={{ fontSize: 28, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: 2, marginTop: 10 }}>Últimas órdenes</div></Entra>
      {[['#4342', 'Samsung A54', 'Chequeo', C.ambar, C.ambarClaro], ['#4341', 'iPad Air 5', 'Listo', C.verde, C.verdeClaro]].map(([n, eq, est, col, fon], i) => (
        <Entra key={n} desde={44 + i * 7}><div style={{ background: '#fff', borderRadius: 24, border: `3px solid ${C.g100}`, padding: '26px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><div style={{ fontSize: 36, fontWeight: 800, color: C.g800 }}>{eq}</div><div style={{ fontSize: 26, fontWeight: 600, color: C.g400 }}>{n}</div></div>
          <span style={{ background: fon, color: col, fontSize: 28, fontWeight: 800, borderRadius: 999, padding: '10px 24px' }}>{est}</span>
        </div></Entra>
      ))}
    </ConTelefono>
    </>
  )
}

// ── 3. Datos de la orden ─────────────────────────────────────────────────────
const CAMPOS = [
  { label: 'Cliente', valor: 'Carla Soto', en: 12 },
  { label: 'Equipo', valor: 'iPhone 13', en: 52 },
  { label: 'Falla', valor: 'No carga', en: 92 },
  { label: 'Clave', valor: '650224', en: 132 },
]

const Campo: React.FC<{ label: string; valor: string; en: number }> = ({ label, valor, en }) => {
  const frame = useCurrentFrame()
  const letras = Math.max(0, Math.min(valor.length, Math.floor((frame - en) / 2)))
  const listo = letras === valor.length
  const activo = frame >= en - 6 && !listo
  return (
    <div style={{
      background: '#fff', borderRadius: 26, padding: '26px 34px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      border: `4px solid ${activo ? C.azul : C.g100}`, boxShadow: activo ? `0 0 0 8px ${C.azulClaro}` : 'none',
    }}>
      <div>
        <div style={{ fontSize: 26, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: 2 }}>{label}</div>
        <div style={{ fontSize: 48, fontWeight: 800, color: C.g800, minHeight: 60 }}>
          {valor.slice(0, letras)}{activo && frame % 16 < 10 && <span style={{ color: C.azul }}>|</span>}
        </div>
      </div>
      <div style={{
        width: 64, height: 64, borderRadius: '50%', background: listo ? C.verde : C.g100,
        color: '#fff', fontSize: 40, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `scale(${listo ? 1 : 0.8})`,
      }}>{listo ? '✓' : ''}</div>
    </div>
  )
}

const Datos: React.FC = () => (
  <>
    <Audio src={staticFile('audio/datos.mp3')} />
    <ConTelefono titulo="Nueva orden" duracion={dur('datos')} toques={CAMPOS.map((c, i) => ({ x: 380, y: 300 + i * 166, en: c.en - 10 }))}>
      {CAMPOS.map((c, i) => <Entra key={c.label} desde={4 + i * 3}><Campo {...c} /></Entra>)}
    </ConTelefono>
  </>
)

// ── 4. Fotos de ingreso ──────────────────────────────────────────────────────
// Visor de cámara dentro de la app: el equipo del cliente, tres disparos con
// flash, y las miniaturas que se van sumando abajo.
const IPhoneFrente: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <svg width={220 * s} height={440 * s} viewBox="0 0 220 440">
    <rect width="220" height="440" rx="40" fill="#1e2a22" />
    <rect x="10" y="10" width="200" height="420" rx="32" fill="#0d1110" />
    <rect x="80" y="20" width="60" height="16" rx="8" fill="#1e2a22" />
    <path d="M20 60 L200 200" stroke="#fff" strokeOpacity=".07" strokeWidth="40" />
  </svg>
)
const IPhoneAtras: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <svg width={220 * s} height={440 * s} viewBox="0 0 220 440">
    <rect width="220" height="440" rx="40" fill="#3b5b45" />
    <rect x="16" y="16" width="100" height="100" rx="26" fill="#2f4a38" />
    <circle cx="48" cy="48" r="22" fill="#11181a" stroke="#4d6b56" strokeWidth="5" />
    <circle cx="84" cy="84" r="22" fill="#11181a" stroke="#4d6b56" strokeWidth="5" />
    <circle cx="90" cy="40" r="6" fill="#f3e3b5" />
    <path d="M60 200 l20 30 l-14 40 l26 30" stroke="#fff" strokeOpacity=".5" strokeWidth="3" fill="none" />
  </svg>
)
const IPhoneLado: React.FC<{ s?: number }> = ({ s = 1 }) => (
  <svg width={220 * s} height={440 * s} viewBox="0 0 220 440">
    <rect x="80" y="0" width="60" height="440" rx="26" fill="#3b5b45" />
    <rect x="76" y="90" width="6" height="40" rx="3" fill="#2f4a38" />
    <rect x="76" y="150" width="6" height="60" rx="3" fill="#2f4a38" />
    <rect x="138" y="140" width="6" height="80" rx="3" fill="#2f4a38" />
  </svg>
)
const TOMAS = [
  { nombre: 'Frente', Dibujo: IPhoneFrente, en: 35 },
  { nombre: 'Atrás', Dibujo: IPhoneAtras, en: 75 },
  { nombre: 'Lado', Dibujo: IPhoneLado, en: 115 },
]

const CamaraFotos: React.FC<{ duracion: number }> = ({ duracion }) => {
  const frame = useCurrentFrame()
  const visible = TOMAS.filter(t => frame >= t.en - 40).at(-1) ?? TOMAS[0]
  const ultimo = [...TOMAS].reverse().find(t => frame >= t.en)
  const flash = ultimo ? interpolate(frame - ultimo.en, [0, 3, 12], [0, 0.9, 0], { extrapolateRight: 'clamp' }) : 0
  const tomadas = TOMAS.filter(t => frame >= t.en + 4)
  const Visor = visible.Dibujo
  return (
    <>
    <Audio src={staticFile('audio/camara.mp3')} />
    <ConTelefono titulo="Fotos de ingreso" duracion={duracion} toques={TOMAS.map(t => ({ x: 629, y: 976, en: t.en }))}>
      <div style={{ position: 'relative', flex: 1, borderRadius: 30, background: '#1b1f27', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            position: 'absolute', width: 56, height: 56,
            left: i < 2 ? 30 : undefined, right: i >= 2 ? 30 : undefined,
            top: i % 2 === 0 ? 30 : undefined, bottom: i % 2 === 1 ? 30 : undefined,
            borderTop: i % 2 === 0 ? '6px solid #fff' : 'none', borderBottom: i % 2 === 1 ? '6px solid #fff' : 'none',
            borderLeft: i < 2 ? '6px solid #fff' : 'none', borderRight: i >= 2 ? '6px solid #fff' : 'none', opacity: 0.8,
          }} />
        ))}
        <div style={{ position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 30, fontWeight: 700, opacity: 0.85 }}>{visible.nombre}</div>
        <Visor s={1.05} />
        <div style={{ position: 'absolute', inset: 0, background: '#fff', opacity: flash }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, height: 130 }}>
        {tomadas.map(t => {
          const D = t.Dibujo
          return (
            <Entra key={t.nombre} desde={t.en + 4} y={30}>
              <div style={{ width: 120, height: 120, borderRadius: 20, background: '#1b1f27', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `4px solid ${C.verde}` }}><D s={0.24} /></div>
            </Entra>
          )
        })}
        <div style={{ marginLeft: 'auto', width: 120, height: 120, borderRadius: '50%', border: '8px solid #fff', boxShadow: `0 0 0 6px ${C.g200}`, background: C.azul }} />
      </div>
      <div style={{ fontSize: 32, fontWeight: 800, color: C.verde, textAlign: 'center', opacity: tomadas.length === 3 ? 1 : 0 }}>✓ 3 fotos guardadas en la orden</div>
    </ConTelefono>
    </>
  )
}

// Las fotos de ingreso se sacan con el celular escaneando el QR de la orden:
// llegan solas al computador, sin descargarlas ni volver a subirlas.
// Tres tiempos: escanear el QR → sacar las fotos → ver que llegaron solas.
const QR_FIN = 85
const CAMARA_FIN = 250

const Fotos: React.FC = () => (
  <>
    <Sequence durationInFrames={QR_FIN}><EscaneaQr /></Sequence>
    <Sequence from={QR_FIN} durationInFrames={CAMARA_FIN - QR_FIN}><CamaraFotos duracion={CAMARA_FIN - QR_FIN} /></Sequence>
    <Sequence from={CAMARA_FIN} durationInFrames={dur('fotos') - CAMARA_FIN}><FotosLlegan duracion={dur('fotos') - CAMARA_FIN} /></Sequence>
  </>
)

/** Pantalla del computador del taller, con la orden abierta. */
const Monitor: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <div style={{ width: 940, height: 620, background: C.g800, borderRadius: 34, padding: 20, boxShadow: '0 40px 90px rgba(21,24,31,.25)' }}>
      <div style={{ width: '100%', height: '100%', background: '#f6f7f9', borderRadius: 18, overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily }}>
        <div style={{ height: 84, flexShrink: 0, background: '#fff', borderBottom: `3px solid ${C.g100}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 34px' }}>
          <Img src={staticFile('logo-pixit.png')} style={{ height: 36 }} />
          <span style={{ fontSize: 26, fontWeight: 700, color: C.g500 }}>Orden #4343 · iPhone 13</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, padding: 30, display: 'flex', gap: 30 }}>{children}</div>
      </div>
    </div>
    <div style={{ width: 70, height: 70, background: '#c9ced9' }} />
    <div style={{ width: 300, height: 18, borderRadius: 9, background: '#b9bfcc' }} />
  </div>
)

/** Celular de mano, más chico que el de la app, para la escena del QR. */
const CelularMano: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ width: 300, height: 600, borderRadius: 50, background: C.g800, padding: 14, boxShadow: '0 30px 70px rgba(21,24,31,.35)' }}>
    <div style={{ width: '100%', height: '100%', borderRadius: 38, background: '#1b1f27', overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</div>
  </div>
)

const EscaneaQr: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const cel = spring({ frame: frame - 14, fps, config: { damping: 16, stiffness: 70 } })
  const barrido = interpolate(frame, [28, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const listo = spring({ frame: frame - 56, fps, config: { damping: 12 } })
  const sale = saleAl(frame, QR_FIN)
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 230, opacity: 1 - sale }}>
      <Audio src={staticFile('audio/qr.mp3')} />
      <div style={{ transform: `translateY(${(1 - entra) * 500}px)` }}>
        <Monitor>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16 }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: C.g800 }}>Fotos de ingreso</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: C.g500, lineHeight: 1.3 }}>Escanea con tu celular y saca las fotos</div>
            <div style={{ marginTop: 10, alignSelf: 'flex-start', fontSize: 26, fontWeight: 800, color: listo > 0.1 ? C.verde : C.azul, background: listo > 0.1 ? C.verdeClaro : C.azulClaro, borderRadius: 999, padding: '10px 22px' }}>
              {listo > 0.1 ? '✓ Celular conectado' : 'Esperando celular…'}
            </div>
          </div>
          <div style={{ position: 'relative', width: 330, height: 330, background: '#fff', borderRadius: 22, padding: 22, border: `4px solid ${C.g200}`, alignSelf: 'center' }}>
            <Qr tam={282} />
            {barrido > 0 && barrido < 1 && (
              <div style={{ position: 'absolute', left: 10, right: 10, top: 10 + barrido * 300, height: 8, borderRadius: 4, background: C.verde, boxShadow: `0 0 24px ${C.verde}` }} />
            )}
          </div>
        </Monitor>
      </div>
      {/* El celular se acerca por la derecha y apunta al QR */}
      <div style={{ position: 'absolute', left: 640, top: 760, transform: `translate(${(1 - cel) * 500}px, ${(1 - cel) * 200}px) rotate(${-8 + cel * 4}deg)` }}>
        <CelularMano>
          <div style={{ position: 'absolute', inset: 40, border: '5px solid rgba(255,255,255,.8)', borderRadius: 20 }} />
          <div style={{ opacity: 0.9, background: '#fff', padding: 10, borderRadius: 10 }}><Qr tam={150} /></div>
          <div style={{
            position: 'absolute', bottom: 40, left: 20, right: 20, textAlign: 'center', background: C.verde, color: '#fff', borderRadius: 999,
            padding: '12px 0', fontSize: 24, fontWeight: 800, opacity: listo, transform: `scale(${0.8 + listo * 0.2})`,
          }}>Abrir fotos de la orden</div>
        </CelularMano>
      </div>
    </AbsoluteFill>
  )
}

const VENTAJAS = [
  { texto: 'Sin pasar fotos al PC', en: 70 },
  { texto: 'Sin descargar ni volver a subir', en: 88 },
  { texto: 'Llegan solas y al instante', en: 106 },
]

const FotosLlegan: React.FC<{ duracion: number }> = ({ duracion }) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 80 } })
  const sello = spring({ frame: frame - 50, fps, config: { damping: 11, stiffness: 110 } })
  const sale = saleAl(frame, duracion)
  return (
    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 200, opacity: 1 - sale }}>
      <Audio src={staticFile('audio/fotosllegan.mp3')} />
      <div style={{ transform: `translateY(${(1 - entra) * 500}px) scale(.92)`, transformOrigin: 'top center' }}>
        <Monitor>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: 36, fontWeight: 800, color: C.g800 }}>Fotos de ingreso</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: C.verde, background: C.verdeClaro, borderRadius: 999, padding: '8px 20px', opacity: frame >= 40 ? 1 : 0 }}>✓ 3 fotos · recién</div>
            </div>
            <div style={{ display: 'flex', gap: 24, flex: 1 }}>
              {TOMAS.map((t, i) => {
                const en = 10 + i * 12
                const D = t.Dibujo
                const llega = frame >= en
                return (
                  <div key={t.nombre} style={{ flex: 1, borderRadius: 20, background: llega ? '#1b1f27' : C.g100, border: `4px ${llega ? 'solid' : 'dashed'} ${llega ? C.verde : C.g200}`, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                    {llega && <Entra desde={en} y={20}><D s={0.62} /></Entra>}
                    {llega && <div style={{ position: 'absolute', bottom: 12, left: 0, right: 0, textAlign: 'center', color: '#fff', fontSize: 22, fontWeight: 700 }}>{t.nombre}</div>}
                  </div>
                )
              })}
            </div>
          </div>
        </Monitor>
      </div>
      {/* La característica destacada */}
      <div style={{
        position: 'absolute', top: 930, width: 900, background: '#fff', borderRadius: 40, padding: '34px 44px',
        boxShadow: '0 30px 70px rgba(21,24,31,.18)', border: `5px solid #ffd23f`,
        opacity: sello, transform: `translateY(${(1 - sello) * 60}px) scale(${0.9 + sello * 0.1})`,
      }}>
        <div style={{ position: 'absolute', top: -34, left: 40, background: '#ffd23f', color: C.g800, fontSize: 30, fontWeight: 800, borderRadius: 999, padding: '10px 26px', letterSpacing: 1 }}>★ FOTOS POR QR</div>
        {VENTAJAS.map(v => {
          const s = spring({ frame: frame - v.en, fps, config: { damping: 13 } })
          return (
            <div key={v.texto} style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 18, opacity: s, transform: `translateX(${(1 - s) * -40}px)` }}>
              <div style={{ width: 54, height: 54, borderRadius: '50%', background: C.verde, color: '#fff', fontSize: 34, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</div>
              <div style={{ fontSize: 46, fontWeight: 800, color: C.g800, letterSpacing: -0.5 }}>{v.texto}</div>
            </div>
          )
        })}
      </div>
    </AbsoluteFill>
  )
}

// ── 5. Checklist ─────────────────────────────────────────────────────────────
const CHECK = [
  { item: '¿Llegó apagado?', estado: 'No', tipo: 'neutro', en: 20 },
  { item: '¿Llegó mojado?', estado: 'No', tipo: 'neutro', en: 38 },
  { item: 'Pantalla', estado: 'Funciona', tipo: 'ok', en: 56 },
  { item: 'Cámara', estado: 'Funciona', tipo: 'ok', en: 74 },
  { item: 'Wi‑Fi', estado: 'Funciona', tipo: 'ok', en: 92 },
  { item: 'Carga', estado: 'No funciona', tipo: 'mal', en: 110 },
  { item: 'Face ID', estado: 'Funciona', tipo: 'ok', en: 128 },
] as const

const Checklist: React.FC = () => {
  const frame = useCurrentFrame()
  const hechos = CHECK.filter(c => frame >= c.en).length
  return (
    <>
    <Audio src={staticFile('audio/checklist.mp3')} />
    <ConTelefono titulo="Checklist de ingreso" duracion={dur('checklist')} toques={CHECK.map((c, i) => ({ x: 626, y: 336 + i * 126, en: c.en }))}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 34, fontWeight: 800, color: C.g800 }}>iPhone 13 · Carla Soto</span>
        <span style={{ fontSize: 30, fontWeight: 800, color: hechos === CHECK.length ? C.verde : C.g400 }}>{hechos}/{CHECK.length}</span>
      </div>
      {CHECK.map(c => {
        const marcado = frame >= c.en
        const s = marcado ? interpolate(frame - c.en, [0, 6], [0.7, 1], { extrapolateRight: 'clamp' }) : 1
        const color = c.tipo === 'ok' ? C.verde : c.tipo === 'mal' ? '#d8413a' : C.azul
        const fondo = c.tipo === 'ok' ? C.verdeClaro : c.tipo === 'mal' ? '#fdecec' : C.azulClaro
        return (
          <div key={c.item} style={{
            background: '#fff', borderRadius: 22, padding: '18px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            border: `3px solid ${marcado ? color : C.g100}`,
          }}>
            <span style={{ fontSize: 34, fontWeight: 700, color: C.g700 }}>{c.item}</span>
            <span style={{
              fontSize: 28, fontWeight: 800, borderRadius: 999, padding: '10px 22px', transform: `scale(${s})`,
              background: marcado ? fondo : C.g100, color: marcado ? color : C.g400,
            }}>{marcado ? `${c.tipo === 'ok' ? '✓ ' : c.tipo === 'mal' ? '✕ ' : ''}${c.estado}` : '—'}</span>
          </div>
        )
      })}
    </ConTelefono>
    </>
  )
}

// ── 6. Guardar + etiqueta con QR ─────────────────────────────────────────────
const qr = QRCode.create('https://pixit.cl/?orden=demo-4343', { errorCorrectionLevel: 'M' })

const Qr: React.FC<{ tam: number }> = ({ tam }) => {
  const n = qr.modules.size
  const celdas: React.ReactNode[] = []
  for (let f = 0; f < n; f++) for (let c = 0; c < n; c++) {
    if (qr.modules.get(f, c)) celdas.push(<rect key={`${f}-${c}`} x={c} y={f} width={1.02} height={1.02} />)
  }
  return <svg width={tam} height={tam} viewBox={`0 0 ${n} ${n}`} shapeRendering="crispEdges" fill={C.g800}>{celdas}</svg>
}

const Guardar: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const telefonoSale = interpolate(frame, [53, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const toast = spring({ frame: frame - 27, fps, config: { damping: 14 } })
  const imprime = interpolate(frame, [73, 122], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <AbsoluteFill style={{ opacity: 1 - saleAl(frame, dur('guardar')) }}>
      <Audio src={staticFile('audio/guardar.mp3')} />
      <AbsoluteFill style={{ alignItems: 'center', paddingTop: 190, opacity: 1 - telefonoSale, transform: `translateX(${-telefonoSale * 600}px)` }}>
        <div style={{ position: 'relative' }}>
          <Telefono titulo="Nueva orden">
            <div style={{ background: '#fff', borderRadius: 26, border: `3px solid ${C.g100}`, padding: 34, display: 'flex', flexDirection: 'column', gap: 18 }}>
              {[['Cliente', 'Carla Soto'], ['Equipo', 'iPhone 13'], ['Falla', 'No carga'], ['Clave', '650224']].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 36 }}>
                  <span style={{ fontWeight: 600, color: C.g400 }}>{k}</span><span style={{ fontWeight: 800, color: C.g800 }}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 16 }}>
              {['3 fotos ✓', 'Checklist ✓'].map(t => <span key={t} style={{ background: C.verdeClaro, color: C.verde, fontWeight: 800, fontSize: 30, borderRadius: 999, padding: '12px 26px' }}>{t}</span>)}
            </div>
            <div style={{
              marginTop: 'auto', background: C.azul, color: '#fff', borderRadius: 30, textAlign: 'center',
              fontSize: 54, fontWeight: 800, padding: '40px 0', transform: `scale(${frame >= 20 && frame < 27 ? 0.95 : 1})`,
            }}>Guardar orden</div>
          </Telefono>
          <Toque x={380} y={1010} en={20} />
          <div style={{
            position: 'absolute', left: 90, right: 90, top: 660, background: C.g800, color: '#fff', borderRadius: 28,
            padding: '30px 36px', fontSize: 40, fontWeight: 800, textAlign: 'center',
            opacity: toast, transform: `scale(${0.8 + toast * 0.2})`,
          }}>✓ Orden #4343 creada</div>
        </div>
      </AbsoluteFill>

      {/* Impresora térmica y la etiqueta saliendo */}
      <AbsoluteFill style={{ alignItems: 'center', opacity: telefonoSale, transform: `translateX(${(1 - telefonoSale) * 600}px)` }}>
        <div style={{ position: 'absolute', top: 1060, width: 760, height: 200, borderRadius: 40, background: C.g700, boxShadow: '0 30px 60px rgba(21,24,31,.3)' }}>
          <div style={{ position: 'absolute', left: 110, right: 110, top: 0, height: 18, background: C.g800, borderRadius: 9 }} />
          <div style={{ position: 'absolute', right: 50, bottom: 40, width: 22, height: 22, borderRadius: '50%', background: '#3ddc84' }} />
        </div>
        <div style={{
          position: 'absolute', top: 1070 - imprime * 540, width: 620, height: 410, background: '#fff', borderRadius: 18,
          boxShadow: '0 18px 40px rgba(21,24,31,.18)', padding: 34, display: 'flex', gap: 26,
          clipPath: `inset(0 0 ${Math.max(0, 100 - imprime * 140)}% 0)`,
        }}>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 40, fontWeight: 800, color: C.g800 }}>iPhone 13</div>
            <div style={{ fontSize: 34, fontWeight: 600, color: C.g800 }}>Carla Soto</div>
            <div style={{ fontSize: 80, fontWeight: 800, color: C.g800, marginTop: 14 }}>#4343</div>
            <div style={{ fontSize: 28, fontWeight: 600, color: C.g800, marginTop: 'auto' }}><b>Falla:</b> No carga</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: `3px solid ${C.g100}`, paddingLeft: 26 }}>
            <Qr tam={190} />
            <div style={{ fontSize: 22, color: C.g500, marginTop: 10, fontWeight: 700 }}>Abrir OT</div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  )
}

// ── 7. Aviso al cliente ──────────────────────────────────────────────────────
const Aviso: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const burbuja = spring({ frame: frame - 23, fps, config: { damping: 13 } })
  const levanta = spring({ frame: frame - 6, fps, config: { damping: 14, stiffness: 70 } })
  return (
    <AbsoluteFill style={{ alignItems: 'center', opacity: 1 - saleAl(frame, dur('aviso')) }}>
      <Audio src={staticFile('audio/aviso.mp3')} />
      <div style={{ position: 'absolute', bottom: 420 }}>
        <Entra desde={0} y={160}>
          <Persona pelo="largo" colorPelo="#5a3825" piel="#e9b98f" sombraPiel="#cf9a70" ropa="#e2564b" sombraRopa="#b8433a"
            expresion={frame > 31 ? 'feliz' : 'sorpresa'} levanta={levanta} objeto={<CelularCliente />} ancho={660} />
        </Entra>
      </div>
      <div style={{
        position: 'absolute', top: 210, width: 880, background: '#fff', borderRadius: 40, padding: '40px 46px',
        boxShadow: '0 30px 70px rgba(21,24,31,.18)', border: `4px solid ${C.azulMedio}`,
        transform: `scale(${burbuja}) translateY(${(1 - burbuja) * 80}px)`, opacity: burbuja,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 76, height: 76, borderRadius: 20, background: C.azulClaro, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 44, color: C.azul }}>✉</div>
          <div>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.azul }}>Taller · ahora</div>
            <div style={{ fontSize: 26, fontWeight: 600, color: C.g400 }}>Correo</div>
          </div>
        </div>
        <div style={{ fontSize: 50, fontWeight: 800, color: C.g800, marginTop: 26, lineHeight: 1.2 }}>Recibimos tu iPhone 13</div>
        <div style={{ fontSize: 36, fontWeight: 600, color: C.g500, marginTop: 10 }}>Orden #4343 · Te avisamos cuando esté listo</div>
      </div>
    </AbsoluteFill>
  )
}

// ── 8. Estados ───────────────────────────────────────────────────────────────
const PASOS = [
  { label: 'Chequeo', en: 18, color: C.ambar, fondo: C.ambarClaro },
  { label: 'Reparación', en: 53, color: C.azul, fondo: C.azulClaro },
  { label: 'Listo', en: 88, color: C.verde, fondo: C.verdeClaro },
]

const Estados: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const aviso = spring({ frame: frame - 106, fps, config: { damping: 13 } })
  return (
    <>
    <Audio src={staticFile('audio/estados.mp3')} />
    <ConTelefono titulo="Orden #4343" duracion={dur('estados')} toques={PASOS.map((p, i) => ({ x: 380, y: 300 + i * 190, en: p.en }))}>
      <div style={{ fontSize: 40, fontWeight: 800, color: C.g800 }}>iPhone 13 · Carla Soto</div>
      {PASOS.map(p => {
        const activo = frame >= p.en
        return (
          <div key={p.label} style={{
            borderRadius: 26, padding: '34px 36px', fontSize: 46, fontWeight: 800, display: 'flex', justifyContent: 'space-between',
            background: activo ? p.fondo : '#fff', color: activo ? p.color : C.g400, border: `4px solid ${activo ? p.color : C.g100}`,
          }}>{p.label}<span>{activo ? '✓' : ''}</span></div>
        )
      })}
      <div style={{
        marginTop: 10, background: C.verde, color: '#fff', borderRadius: 28, textAlign: 'center', fontSize: 44, fontWeight: 800,
        padding: '30px 0', opacity: aviso, transform: `scale(${0.85 + aviso * 0.15})`,
      }}>Aviso enviado al cliente</div>
    </ConTelefono>
    </>
  )
}

// ── 9. Cierre ────────────────────────────────────────────────────────────────
const Cierre: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame: frame - 6, fps, config: { damping: 13 } })
  const caja = spring({ frame: frame - 32, fps, config: { damping: 15 } })
  const escrito = 'PIXIT'.slice(0, Math.max(0, Math.floor((frame - 57) / 6)))
  const enviado = frame >= 96
  return (
    <AbsoluteFill style={{ background: C.azul, alignItems: 'center' }}>
      <Audio src={staticFile('audio/cierre.mp3')} />
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
  gancho: Gancho, inicio: Inicio, datos: Datos, fotos: Fotos, checklist: Checklist,
  guardar: Guardar, aviso: Aviso, estados: Estados, cierre: Cierre,
}
