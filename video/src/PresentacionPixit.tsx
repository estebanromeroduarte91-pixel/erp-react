import React from 'react'
import { AbsoluteFill, Audio, Img, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C, fontFamily } from './marca'
import { Entra, Subtitulos, Telefono, type Frase } from './piezas'

// "Pixit — comercial" — spot premium para anunciar en redes: el Gancho usa un
// clip real generado con Google Flow/Veo (fondo de estudio + logo, sin texto
// chico que se pueda "alucinar"); los 10 módulos usan el mismo mockup de
// celular con pantallas recreadas de "Así se recibe un equipo con Pixit",
// porque Veo cambiaba solo los números y palabras de la pantalla pasado medio
// segundo de reproducción — inservible para mostrar datos reales de Pixit.
const E = {
  gancho: [0, 100],
  taller: [100, 230],
  compras: [230, 340],
  kits: [340, 450],
  gastos: [450, 560],
  pos: [560, 680],
  inventario: [680, 800],
  cotizaciones: [800, 910],
  estadisticas: [910, 1040],
  cargos: [1040, 1150],
  seguimiento: [1150, 1270],
  cierre: [1270, 1440],
} as const

export const DURACION_PRESENTACION = E.cierre[1]

const FRASES: Frase[] = [
  { desde: 6, hasta: 100, texto: 'Pixit: el software hecho para tu taller' },
  { desde: 105, hasta: 230, texto: 'Recibes el equipo, con checklist y aprobación del cliente' },
  { desde: 235, hasta: 340, texto: 'Cada compra se reparte sola, entre tus sucursales' },
  { desde: 345, hasta: 450, texto: 'Arma un kit, y sus repuestos se agregan solos' },
  { desde: 455, hasta: 560, texto: 'Sabe, en un vistazo, en qué se te va la plata' },
  { desde: 565, hasta: 680, texto: 'Cobra en segundos, con cualquier medio de pago' },
  { desde: 685, hasta: 800, texto: 'Tu stock, siempre al día, en cada sucursal' },
  { desde: 805, hasta: 910, texto: 'Cotiza, y conviértela en orden con un clic' },
  { desde: 915, hasta: 1040, texto: 'Tu negocio, en números, siempre a la vista' },
  { desde: 1045, hasta: 1150, texto: 'Cada empleado, con acceso solo a lo que le corresponde' },
  { desde: 1155, hasta: 1270, texto: 'Y Pixit sigue el contacto con tu cliente, solo' },
  { desde: 1275, hasta: 1425, texto: 'Comenta PIXIT y te mostramos cómo' },
]

const dur = (k: keyof typeof E) => E[k][1] - E[k][0]

const volumenMusica = (frame: number) => interpolate(
  frame,
  [0, 20, DURACION_PRESENTACION - 40, DURACION_PRESENTACION],
  [0, 0.17, 0.17, 0],
  { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
)

export const PresentacionPixit: React.FC = () => (
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

// ── Fondo (igual al de "Así se recibe un equipo") ───────────────────────────
const Fondo: React.FC = () => (
  <AbsoluteFill>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 130, height: 16, background: C.azul, opacity: 0.9 }} />
  </AbsoluteFill>
)

const saleAl = (frame: number, d: number) => interpolate(frame, [d - 14, d], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

/** Celular con la pantalla recreada, escalado para caber en una escena corta, con título y beneficio debajo. */
const EscenaCelular: React.FC<{ pantalla: string; titulo: string; beneficio: string; duracion: number; audio: string; k?: number; children: React.ReactNode }> = ({
  pantalla, titulo, beneficio, duracion, audio, k = 0.72, children,
}) => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 20, stiffness: 85 } })
  const tituloS = spring({ frame: frame - 30, fps, config: { damping: 15 } })
  const beneficioS = spring({ frame: frame - 38, fps, config: { damping: 15 } })
  const sale = saleAl(frame, duracion)
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - sale }}>
      <Audio src={staticFile(`audio/${audio}.mp3`)} />
      <div style={{ width: 760 * k, height: 1180 * k, position: 'relative', transform: `translateY(${(1 - entra) * 420}px)` }}>
        <div style={{ transform: `scale(${k})`, transformOrigin: 'top left', width: 760, height: 1180 }}>
          <Telefono titulo={pantalla}>{children}</Telefono>
        </div>
      </div>
      <div style={{
        marginTop: 20, fontSize: 46, fontWeight: 800, color: C.g800, opacity: tituloS,
        transform: `translateY(${(1 - tituloS) * 18}px)`,
      }}>{titulo}</div>
      <div style={{
        marginTop: 12, fontSize: 26, fontWeight: 600, color: C.g500, textAlign: 'center', width: 760, lineHeight: 1.4, opacity: beneficioS,
        transform: `translateY(${(1 - beneficioS) * 18}px)`,
      }}>{beneficio}</div>
    </AbsoluteFill>
  )
}

const Fila: React.FC<{ children: React.ReactNode; activo?: boolean; color?: string }> = ({ children, activo, color = C.azul }) => (
  <div style={{
    background: '#fff', borderRadius: 22, padding: '20px 26px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    border: `3px solid ${activo ? color : C.g100}`,
  }}>{children}</div>
)
const Pill: React.FC<{ children: React.ReactNode; color: string; fondo: string }> = ({ children, color, fondo }) => (
  <span style={{ background: fondo, color, fontSize: 26, fontWeight: 800, borderRadius: 999, padding: '8px 20px' }}>{children}</span>
)

// ── Gancho: clip real de Veo (logo de Pixit flotando en estudio) ───────────
const Gancho: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const entra = spring({ frame, fps, config: { damping: 18, stiffness: 90 } })
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: 1 - saleAl(frame, dur('gancho')) }}>
      <Audio src={staticFile('audio/pcv3-gancho.mp3')} />
      <div style={{
        width: 640 * 1.3, height: 720 * 1.3, borderRadius: 28, overflow: 'hidden', boxShadow: '0 30px 70px rgba(21,24,31,.18)',
        transform: `scale(${0.9 + entra * 0.1})`, opacity: entra,
      }}>
        <OffthreadVideo src={staticFile('veo/gancho.mp4')} muted style={{ width: 640 * 1.3, height: 720 * 1.3, objectFit: 'cover' }} />
      </div>
    </AbsoluteFill>
  )
}

// ── Taller: pantalla de inicio ───────────────────────────────────────────────
const Taller: React.FC = () => {
  const frame = useCurrentFrame()
  const presionado = frame >= 86 && frame < 94
  return (
    <EscenaCelular pantalla="Taller" titulo="Taller" beneficio="Recibes el equipo, con checklist y aprobación del cliente." duracion={dur('taller')} audio="pcv3-taller">
      <Entra desde={6}><div style={{ fontSize: 50, fontWeight: 800, color: C.g800 }}>Hoy</div>
        <div style={{ fontSize: 30, fontWeight: 600, color: C.g500 }}>3 equipos en el taller</div></Entra>
      <Entra desde={16}><div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1, background: '#fff', borderRadius: 28, border: `3px solid ${C.g100}`, padding: '28px 26px' }}>
          <div style={{ display: 'inline-block', background: C.ambarClaro, color: C.ambar, fontWeight: 800, fontSize: 56, borderRadius: 16, padding: '0 20px' }}>2</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: C.g500, marginTop: 10 }}>En chequeo</div>
        </div>
        <div style={{ flex: 1, background: '#fff', borderRadius: 28, border: `3px solid ${C.g100}`, padding: '28px 26px' }}>
          <div style={{ display: 'inline-block', background: C.verdeClaro, color: C.verde, fontWeight: 800, fontSize: 56, borderRadius: 16, padding: '0 20px' }}>1</div>
          <div style={{ fontSize: 28, fontWeight: 600, color: C.g500, marginTop: 10 }}>Listos</div>
        </div>
      </div></Entra>
      <Entra desde={24}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#fff', borderRadius: 24, border: `3px solid ${C.verdeClaro}`, padding: '22px 28px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: C.verdeClaro, color: C.verde, fontSize: 32, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
          <div><div style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>Checklist aprobado</div><div style={{ fontSize: 24, fontWeight: 600, color: C.g500 }}>Por el cliente, desde su celular</div></div>
        </div>
      </Entra>
      <Entra desde={34}><div style={{
        marginTop: 2, background: C.azul, color: '#fff', borderRadius: 30, textAlign: 'center',
        fontSize: 48, fontWeight: 800, padding: '32px 0', transform: `scale(${presionado ? 0.95 : 1})`,
        boxShadow: `0 16px 36px ${C.azulMedio}`,
      }}>+ Nueva orden</div></Entra>
    </EscenaCelular>
  )
}

// ── Compras: la orden se reparte sola entre sucursales ──────────────────────
const LINEAS_COMPRA = [
  { prod: 'Pantalla iPhone 13', cant: '10 un.', suc: 'Centro', en: 10 },
  { prod: 'Batería A54', cant: '6 un.', suc: 'Maipú', en: 26 },
  { prod: 'Flex de carga', cant: '12 un.', suc: 'Centro', en: 42 },
]
const Compras: React.FC = () => (
  <EscenaCelular pantalla="Orden de compra" titulo="Compras" beneficio="Cada línea de la orden va a su propia sucursal. El stock se reparte solo." duracion={dur('compras')} audio="pcv3-compras">
    <Entra desde={2}><div style={{ fontSize: 40, fontWeight: 800, color: C.g800 }}>OC #128 · Proveedor TecnoParts</div></Entra>
    {LINEAS_COMPRA.map((l) => (
      <Entra key={l.prod} desde={l.en}>
        <Fila>
          <div><div style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>{l.prod}</div><div style={{ fontSize: 24, fontWeight: 600, color: C.g400 }}>{l.cant}</div></div>
          <Pill color={C.azul} fondo={C.azulClaro}>→ {l.suc}</Pill>
        </Fila>
      </Entra>
    ))}
    <Entra desde={62}>
      <div style={{ background: C.verdeClaro, color: C.verde, borderRadius: 24, textAlign: 'center', fontSize: 32, fontWeight: 800, padding: '22px 0' }}>✓ Stock repartido en 2 sucursales</div>
    </Entra>
  </EscenaCelular>
)

// ── Kits: el equipo arma el kit, los repuestos se agregan solos ────────────
const REPUESTOS_KIT = [
  { nombre: 'Pantalla OLED', en: 28 },
  { nombre: 'Flex conector', en: 44 },
  { nombre: 'Set de tornillos', en: 60 },
]
const Kits: React.FC = () => (
  <EscenaCelular pantalla="Kits y equipos" titulo="Kits y equipos" beneficio="Agregas el equipo, y sus repuestos se cargan solos, sin ingresarlos uno por uno." duracion={dur('kits')} audio="pcv3-kits">
    <Entra desde={2}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: '#fff', borderRadius: 24, border: `3px solid ${C.g100}`, padding: '24px 28px' }}>
        <div style={{ width: 60, height: 60, borderRadius: 16, background: C.azulClaro, color: C.azul, fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Kit</div>
        <div style={{ fontSize: 34, fontWeight: 800, color: C.g800 }}>iPhone 13 · Pantalla</div>
      </div>
    </Entra>
    <div style={{ fontSize: 26, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: 2 }}>Repuestos del kit</div>
    {REPUESTOS_KIT.map(r => (
      <Entra key={r.nombre} desde={r.en}>
        <Fila activo color={C.verde}>
          <span style={{ fontSize: 32, fontWeight: 700, color: C.g700 }}>{r.nombre}</span>
          <div style={{ width: 48, height: 48, borderRadius: '50%', background: C.verde, color: '#fff', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
        </Fila>
      </Entra>
    ))}
    <Entra desde={80}><div style={{ background: C.verdeClaro, color: C.verde, borderRadius: 24, textAlign: 'center', fontSize: 30, fontWeight: 800, padding: '20px 0' }}>+3 repuestos agregados al stock</div></Entra>
  </EscenaCelular>
)

// ── Gastos: sabes en qué se te va la plata ──────────────────────────────────
const GASTOS = [
  { cat: 'Arriendo', monto: '$320.000', en: 14 },
  { cat: 'Insumos', monto: '$94.300', en: 30 },
  { cat: 'Servicios', monto: '$68.000', en: 46 },
]
const Gastos: React.FC = () => (
  <EscenaCelular pantalla="Gastos" titulo="Gastos" beneficio="Registras tus gastos por categoría, y sabes en qué se te va la plata cada mes." duracion={dur('gastos')} audio="pcv3-gastos">
    <Entra desde={2}><div style={{ fontSize: 30, fontWeight: 600, color: C.g500 }}>Noviembre · por categoría</div></Entra>
    {GASTOS.map(g => (
      <Entra key={g.cat} desde={g.en}>
        <Fila>
          <span style={{ fontSize: 34, fontWeight: 700, color: C.g700 }}>{g.cat}</span>
          <span style={{ fontSize: 34, fontWeight: 800, color: C.g800 }}>{g.monto}</span>
        </Fila>
      </Entra>
    ))}
    <Entra desde={66}>
      <div style={{ background: C.ambar, color: '#fff', borderRadius: 26, display: 'flex', justifyContent: 'space-between', padding: '26px 30px' }}>
        <span style={{ fontSize: 32, fontWeight: 700 }}>Total del mes</span>
        <span style={{ fontSize: 38, fontWeight: 800 }}>$482.300</span>
      </div>
    </Entra>
  </EscenaCelular>
)

// ── POS: cobras en segundos ──────────────────────────────────────────────────
const CARRITO = [
  { prod: 'Pantalla iPhone 13', precio: '$45.000', en: 10 },
  { prod: 'Mano de obra', precio: '$15.000', en: 24 },
]
const Pos: React.FC = () => {
  const frame = useCurrentFrame()
  const pagado = frame >= 86
  return (
    <EscenaCelular pantalla="Cobro" titulo="POS" beneficio="Cobras en segundos, con cualquier medio de pago, y la orden del taller ya cargada." duracion={dur('pos')} audio="pcv3-pos">
      <Entra desde={2}>
        <div style={{ background: C.azulClaro, color: C.azul, borderRadius: 20, padding: '14px 22px', fontSize: 26, fontWeight: 800, display: 'inline-block' }}>Orden #4343 · iPhone 13</div>
      </Entra>
      {CARRITO.map(c => (
        <Entra key={c.prod} desde={c.en}>
          <Fila>
            <span style={{ fontSize: 32, fontWeight: 700, color: C.g700 }}>{c.prod}</span>
            <span style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>{c.precio}</span>
          </Fila>
        </Entra>
      ))}
      <Entra desde={40}>
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `3px solid ${C.g100}`, paddingTop: 16 }}>
          <span style={{ fontSize: 34, fontWeight: 800, color: C.g800 }}>Total</span>
          <span style={{ fontSize: 40, fontWeight: 800, color: C.azul }}>$60.000</span>
        </div>
      </Entra>
      <Entra desde={52}>
        <div style={{ display: 'flex', gap: 14 }}>
          {['Débito', 'Efectivo', 'Transf.'].map((m, i) => (
            <span key={m} style={{
              flex: 1, textAlign: 'center', borderRadius: 999, padding: '14px 0', fontSize: 24, fontWeight: 800,
              background: i === 0 ? C.azul : '#fff', color: i === 0 ? '#fff' : C.g500, border: `3px solid ${i === 0 ? C.azul : C.g100}`,
            }}>{m}</span>
          ))}
        </div>
      </Entra>
      <Entra desde={64}>
        <div style={{
          marginTop: 2, background: pagado ? C.verde : C.azul, color: '#fff', borderRadius: 30, textAlign: 'center',
          fontSize: 44, fontWeight: 800, padding: '30px 0', transform: `scale(${frame >= 78 && frame < 86 ? 0.95 : 1})`,
        }}>{pagado ? '✓ Cobrado' : 'Cobrar $60.000'}</div>
      </Entra>
    </EscenaCelular>
  )
}

// ── Inventario: tu stock al día, en cada sucursal ───────────────────────────
const STOCK = [
  { prod: 'Pantalla iPhone 13', centro: 14, maipu: 6, en: 14 },
  { prod: 'Batería A54', centro: 22, maipu: 9, en: 30 },
]
const Inventario: React.FC = () => (
  <EscenaCelular pantalla="Inventario" titulo="Inventario" beneficio="Tu stock, al día, en cada sucursal. Y cuánto dinero tienes invertido, al instante." duracion={dur('inventario')} audio="pcv3-inventario">
    <Entra desde={2}><div style={{ fontSize: 30, fontWeight: 600, color: C.g500 }}>Stock por sucursal</div></Entra>
    {STOCK.map(s => (
      <Entra key={s.prod} desde={s.en}>
        <div style={{ background: '#fff', borderRadius: 22, border: `3px solid ${C.g100}`, padding: '22px 26px' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: C.g800, marginBottom: 10 }}>{s.prod}</div>
          <div style={{ display: 'flex', gap: 12 }}>
            <Pill color={C.azul} fondo={C.azulClaro}>Centro: {s.centro}</Pill>
            <Pill color={C.verde} fondo={C.verdeClaro}>Maipú: {s.maipu}</Pill>
          </div>
        </div>
      </Entra>
    ))}
    <Entra desde={54}>
      <div style={{ background: C.g800, color: '#fff', borderRadius: 26, display: 'flex', justifyContent: 'space-between', padding: '26px 30px' }}>
        <span style={{ fontSize: 30, fontWeight: 700 }}>Valor total en stock</span>
        <span style={{ fontSize: 36, fontWeight: 800 }}>$3.240.500</span>
      </div>
    </Entra>
  </EscenaCelular>
)

// ── Cotizaciones: cotiza y conviértela en orden con un clic ────────────────
const Cotizaciones: React.FC = () => {
  const frame = useCurrentFrame()
  const convertida = frame >= 90
  return (
    <EscenaCelular pantalla="Cotización" titulo="Cotizaciones" beneficio="Cotizas, envías el link, y la conviertes en orden de trabajo con un clic." duracion={dur('cotizaciones')} audio="pcv3-cotizaciones">
      <Entra desde={2}><div style={{ fontSize: 34, fontWeight: 800, color: C.g800 }}>Cambio de pantalla · iPhone 13</div></Entra>
      <Entra desde={16}>
        <Fila>
          <span style={{ fontSize: 32, fontWeight: 700, color: C.g700 }}>Pantalla + instalación</span>
          <span style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>$65.000</span>
        </Fila>
      </Entra>
      <Entra desde={32}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>Total cotizado</span>
          <span style={{ fontSize: 38, fontWeight: 800, color: C.azul }}>$65.000</span>
        </div>
      </Entra>
      <Entra desde={46}>
        <div style={{
          background: convertida ? C.verde : C.azul, color: '#fff', borderRadius: 30, textAlign: 'center',
          fontSize: 40, fontWeight: 800, padding: '30px 0', transform: `scale(${frame >= 82 && frame < 90 ? 0.95 : 1})`,
        }}>{convertida ? '✓ Convertida en Orden #129' : 'Convertir en orden'}</div>
      </Entra>
    </EscenaCelular>
  )
}

// ── Estadísticas: tu negocio, en números ────────────────────────────────────
const BARRAS = [36, 58, 44, 72, 90]
const BarraStat: React.FC<{ h: number; en: number; alta?: boolean }> = ({ h, en, alta }) => {
  const frame = useCurrentFrame()
  const s = interpolate(frame, [en, en + 16], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return <div style={{ flex: 1, height: h * s, borderRadius: 10, background: alta ? C.azul : C.azulMedio }} />
}
const Estadisticas: React.FC = () => (
  <EscenaCelular pantalla="Estadísticas" titulo="Estadísticas" beneficio="Ventas, rentabilidad y metas de tu taller, siempre a la vista, en un solo panel." duracion={dur('estadisticas')} audio="pcv3-estadisticas">
    <Entra desde={2}><div style={{ fontSize: 30, fontWeight: 600, color: C.g500 }}>Ventas de la semana</div></Entra>
    <Entra desde={10}>
      <div style={{ background: '#fff', borderRadius: 24, border: `3px solid ${C.g100}`, padding: '28px 26px', display: 'flex', alignItems: 'flex-end', gap: 16, height: 190 }}>
        {BARRAS.map((h, i) => <BarraStat key={i} h={h} en={18 + i * 8} alta={i === 4} />)}
      </div>
    </Entra>
    <Entra desde={60}>
      <div style={{ display: 'flex', gap: 24 }}>
        <div style={{ flex: 1, background: C.verdeClaro, borderRadius: 24, padding: '24px 22px' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.verde }}>Rentabilidad</div>
          <div style={{ fontSize: 42, fontWeight: 800, color: C.g800 }}>38%</div>
        </div>
        <div style={{ flex: 1, background: C.azulClaro, borderRadius: 24, padding: '24px 22px' }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: C.azul }}>Meta mensual</div>
          <div style={{ fontSize: 42, fontWeight: 800, color: C.g800 }}>84%</div>
        </div>
      </div>
    </Entra>
  </EscenaCelular>
)

// ── Cargos: cada empleado, con acceso solo a lo que le corresponde ─────────
const EMPLEADOS = [
  { nombre: 'Javiera', rol: 'Técnica', color: C.azul, fondo: C.azulClaro, en: 14 },
  { nombre: 'Matías', rol: 'Vendedor', color: C.verde, fondo: C.verdeClaro, en: 30 },
  { nombre: 'Tomás', rol: 'Admin', color: C.ambar, fondo: C.ambarClaro, en: 46 },
]
const Cargos: React.FC = () => (
  <EscenaCelular pantalla="Cargos" titulo="Cargos" beneficio="Defines qué puede ver y hacer cada empleado, según su cargo en el taller." duracion={dur('cargos')} audio="pcv3-cargos">
    <Entra desde={2}><div style={{ fontSize: 30, fontWeight: 600, color: C.g500 }}>Empleados y accesos</div></Entra>
    {EMPLEADOS.map(e => (
      <Entra key={e.nombre} desde={e.en}>
        <Fila>
          <span style={{ fontSize: 34, fontWeight: 800, color: C.g800 }}>{e.nombre}</span>
          <Pill color={e.color} fondo={e.fondo}>{e.rol}</Pill>
        </Fila>
      </Entra>
    ))}
    <Entra desde={66}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, background: C.g800, borderRadius: 24, padding: '22px 28px' }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', background: C.verde, color: '#fff', fontSize: 30, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
        <div style={{ fontSize: 28, fontWeight: 700, color: '#fff' }}>Cada uno ve solo lo suyo</div>
      </div>
    </Entra>
  </EscenaCelular>
)

// ── Seguimiento: Pixit sigue el contacto con el cliente, solo ──────────────
const Seguimiento: React.FC = () => {
  const frame = useCurrentFrame()
  const enviado = frame >= 70
  return (
    <EscenaCelular pantalla="Seguimiento" titulo="Seguimiento 30 días" beneficio="A los días que tú elijas, Pixit le pregunta solo al cliente cómo le fue." duracion={dur('seguimiento')} audio="pcv3-seguimiento">
      <Entra desde={2}><div style={{ fontSize: 30, fontWeight: 600, color: C.g500 }}>Automático · 30 días después</div></Entra>
      <Entra desde={16}>
        <div style={{ background: '#fff', borderRadius: 26, border: `4px solid ${C.azulMedio}`, padding: '30px 32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div style={{ width: 64, height: 64, borderRadius: 18, background: C.azulClaro, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36, color: C.azul }}>✉</div>
            <div style={{ fontSize: 26, fontWeight: 700, color: C.azul }}>Carla Soto · iPhone 13</div>
          </div>
          <div style={{ fontSize: 38, fontWeight: 800, color: C.g800, marginTop: 20 }}>¿Cómo te fue con tu equipo?</div>
        </div>
      </Entra>
      <Entra desde={40}>
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, textAlign: 'center', background: enviado ? C.verdeClaro : '#fff', color: enviado ? C.verde : C.g500, border: `3px solid ${enviado ? C.verde : C.g100}`, borderRadius: 999, padding: '22px 0', fontSize: 32, fontWeight: 800 }}>{enviado ? '✓ ' : ''}Todo bien</div>
          <div style={{ flex: 1, textAlign: 'center', background: '#fff', color: C.g500, border: `3px solid ${C.g100}`, borderRadius: 999, padding: '22px 0', fontSize: 32, fontWeight: 800 }}>Tengo un problema</div>
        </div>
      </Entra>
    </EscenaCelular>
  )
}

// ── Cierre (igual al resto de la serie) ─────────────────────────────────────
const Cierre: React.FC = () => {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const logo = spring({ frame: frame - 6, fps, config: { damping: 13 } })
  const caja = spring({ frame: frame - 32, fps, config: { damping: 15 } })
  const escrito = 'PIXIT'.slice(0, Math.max(0, Math.floor((frame - 57) / 6)))
  const enviado = frame >= 96
  return (
    <AbsoluteFill style={{ background: C.azul, alignItems: 'center' }}>
      <Audio src={staticFile('audio/pcv3-cierre.mp3')} />
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
  gancho: Gancho, taller: Taller, compras: Compras, kits: Kits, gastos: Gastos, pos: Pos,
  inventario: Inventario, cotizaciones: Cotizaciones, estadisticas: Estadisticas, cargos: Cargos,
  seguimiento: Seguimiento, cierre: Cierre,
}
