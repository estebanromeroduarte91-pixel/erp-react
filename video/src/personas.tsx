import React, { useId } from 'react'
import { interpolate, useCurrentFrame } from 'remotion'
import { C } from './marca'

// Personajes ilustrados de medio cuerpo, estilo plano con sombras suaves.
// Son SVG, así que son idénticos en todos los videos de la serie y se animan
// por partes: parpadeo, cabeceo, respiración y el brazo que levanta el celular.

type Pelo = 'corto' | 'largo'

export type PersonaProps = {
  piel?: string
  sombraPiel?: string
  pelo?: Pelo
  colorPelo?: string
  ropa?: string
  sombraRopa?: string
  delantal?: boolean
  barba?: boolean
  aros?: boolean
  expresion?: 'feliz' | 'sorpresa' | 'contenta'
  /** 0 = brazo abajo, 1 = brazo arriba mostrando el objeto. */
  levanta?: number
  objeto?: React.ReactNode
  ancho?: number
}

/** Tramo con grosor variable y puntas planas: mangas y antebrazos sin bolitas. */
const Tubo: React.FC<{ a: { x: number; y: number }; b: { x: number; y: number }; wa: number; wb: number; color: string }> = ({ a, b, wa, wb, color }) => {
  const dx = b.x - a.x, dy = b.y - a.y
  const l = Math.hypot(dx, dy) || 1
  const nx = -dy / l, ny = dx / l
  const pts = [
    [a.x + nx * wa / 2, a.y + ny * wa / 2], [b.x + nx * wb / 2, b.y + ny * wb / 2],
    [b.x - nx * wb / 2, b.y - ny * wb / 2], [a.x - nx * wa / 2, a.y - ny * wa / 2],
  ]
  return <polygon points={pts.map(p => p.join(',')).join(' ')} fill={color} strokeLinejoin="round" />
}

const mezcla = (a: { x: number; y: number }, b: { x: number; y: number }, t: number) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })

export const Persona: React.FC<PersonaProps> = ({
  piel = '#f2c9a5', sombraPiel = '#dca37c', pelo = 'corto', colorPelo = '#2b2420',
  ropa = C.azul, sombraRopa = C.azulOscuro, delantal = false, barba = false, aros = false,
  expresion = 'feliz', levanta = 1, objeto, ancho = 620,
}) => {
  const frame = useCurrentFrame()
  const id = useId().replace(/:/g, '')
  const respira = Math.sin(frame / 14) * 3
  const ojo = frame % 105 > 100 ? 0.12 : 1
  const cabeceo = Math.sin(frame / 22) * 1.6

  // Brazo que levanta el objeto: hombro → codo → mano.
  const hombro = { x: 452, y: 585 }
  const codo = {
    x: interpolate(levanta, [0, 1], [492, 556]),
    y: interpolate(levanta, [0, 1], [690, 660]),
  }
  const mano = {
    x: interpolate(levanta, [0, 1], [500, 590]),
    y: interpolate(levanta, [0, 1], [790, 452]),
  }
  const finManga = mezcla(hombro, codo, 0.55)

  // Brazo relajado del otro lado.
  const hombroIzq = { x: 188, y: 585 }
  const codoIzq = { x: 160, y: 690 }
  const manoIzq = { x: 166, y: 800 }
  const finMangaIzq = mezcla(hombroIzq, codoIzq, 0.55)

  return (
    <svg width={ancho} height={ancho * 1.25} viewBox="0 0 640 800" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`brillo${id}`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".16" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        {/* Todo lo que baja de 800 queda detrás del mostrador */}
        <clipPath id={`corte${id}`}><rect x="-400" y="-400" width="1440" height="1200" /></clipPath>
      </defs>
      <g clipPath={`url(#corte${id})`}>
        <g transform={`translate(0 ${respira})`}>
          {/* Pelo largo: detrás de la cabeza y los hombros, con ondas */}
          {pelo === 'largo' && (
            <>
              <path d="M200 250 C168 360 196 430 176 520 C166 570 190 610 228 622 L412 622 C450 610 474 570 464 520 C444 430 472 360 440 250 Z" fill={colorPelo} />
              <path d="M214 400 C204 470 222 540 206 600 M426 400 C436 470 418 540 434 600" stroke="#000" strokeOpacity=".14" strokeWidth="8" fill="none" strokeLinecap="round" />
            </>
          )}

          {/* Torso */}
          <path d="M118 812 C118 640 178 548 320 548 C462 548 522 640 522 812 Z" fill={ropa} />
          <path d="M118 812 C118 640 178 548 320 548 C462 548 522 640 522 812 Z" fill={`url(#brillo${id})`} />
          <path d="M150 812 C150 690 182 620 226 596 L236 812 Z" fill={sombraRopa} opacity=".3" />

          {/* Cuello con la sombra de la barbilla */}
          <path d="M280 430 L360 430 L364 552 C346 572 294 572 276 552 Z" fill={piel} />
          <path d="M280 446 Q320 492 360 446 L362 486 Q320 520 278 486 Z" fill={sombraPiel} />

          {/* Cuello de la polera */}
          {delantal ? (
            <path d="M262 548 L320 600 L378 548 L362 540 L320 580 L278 540 Z" fill="#fff" opacity=".92" />
          ) : (
            <path d="M266 552 C290 590 350 590 374 552" fill="none" stroke={sombraRopa} strokeWidth="12" strokeLinecap="round" />
          )}

          {/* Delantal de taller con el sello de Pixit y un destornillador en el bolsillo */}
          {delantal && (
            <>
              <path d="M240 612 L400 612 L424 812 L216 812 Z" fill={C.g700} />
              <path d="M240 616 L270 548 M400 616 L370 548" stroke={C.g700} strokeWidth="16" strokeLinecap="round" />
              <rect x="290" y="650" width="60" height="60" rx="16" fill={C.azul} />
              <path d="M308 697 L308 670 Q308 664 314 664 L326 664 Q338 664 338 676 Q338 688 326 688 L308 688" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="358" y="704" width="16" height="56" rx="7" fill="#f5a524" transform="rotate(10 366 732)" />
              <rect x="363" y="690" width="6" height="22" rx="3" fill="#c9ced8" transform="rotate(10 366 732)" />
              <rect x="246" y="738" width="148" height="56" rx="12" fill={C.g800} opacity=".55" />
              <path d="M246 744 L394 744" stroke="#fff" strokeOpacity=".12" strokeWidth="3" />
            </>
          )}

          {/* Brazo relajado: manga corta + antebrazo */}
          <Tubo a={finMangaIzq} b={codoIzq} wa={52} wb={48} color={piel} />
          <circle cx={codoIzq.x} cy={codoIzq.y} r={24} fill={piel} />
          <Tubo a={codoIzq} b={manoIzq} wa={48} wb={44} color={piel} />
          <circle cx={hombroIzq.x} cy={hombroIzq.y} r={40} fill={ropa} />
          <Tubo a={hombroIzq} b={finMangaIzq} wa={80} wb={70} color={ropa} />
          <Tubo a={mezcla(hombroIzq, finMangaIzq, 0.86)} b={finMangaIzq} wa={71} wb={70} color={sombraRopa} />

          {/* Cabeza */}
          <g transform={`translate(0 18) rotate(${cabeceo} 320 330)`}>
            <ellipse cx="207" cy="325" rx="24" ry="32" fill={sombraPiel} />
            <ellipse cx="433" cy="325" rx="24" ry="32" fill={sombraPiel} />
            <path d="M206 300 C206 196 256 166 320 166 C384 166 434 196 434 300 C434 392 388 456 320 460 C252 456 206 392 206 300 Z" fill={piel} />
            {/* sombra lateral de la cara */}
            <path d="M400 210 C430 250 436 300 432 330 C424 400 390 446 340 458 C392 420 412 360 410 300 C408 260 404 232 400 210 Z" fill={sombraPiel} opacity=".45" />

            {/* Barba corta */}
            {barba && (
              <path d="M222 360 C232 420 270 456 320 458 C370 456 408 420 418 360 C404 400 372 424 320 426 C268 424 236 400 222 360 Z" fill={colorPelo} opacity=".3" />
            )}

            {/* Aros */}
            {aros && (
              <>
                <circle cx="206" cy="364" r="13" fill="none" stroke="#e0b44c" strokeWidth="6" />
                <circle cx="434" cy="364" r="13" fill="none" stroke="#e0b44c" strokeWidth="6" />
              </>
            )}

            {/* Pelo */}
            {pelo === 'corto' ? (
              <>
                <path d="M200 296 C190 196 248 150 326 152 C404 154 452 200 442 294 C428 248 398 226 352 232 C312 238 274 230 248 216 C232 246 214 266 200 296 Z" fill={colorPelo} />
                <path d="M266 186 C300 170 350 168 392 186" stroke="#fff" strokeOpacity=".14" strokeWidth="10" fill="none" strokeLinecap="round" />
              </>
            ) : (
              <>
                <path d="M196 330 C184 206 246 154 326 154 C410 154 466 210 452 330 C440 270 402 222 334 222 C300 222 262 236 238 262 C222 284 206 304 196 330 Z" fill={colorPelo} />
                <path d="M262 182 C300 166 352 166 396 184" stroke="#fff" strokeOpacity=".13" strokeWidth="10" fill="none" strokeLinecap="round" />
              </>
            )}

            {/* Cejas */}
            <path d={expresion === 'sorpresa' ? 'M245 262 Q272 244 298 258' : 'M247 272 Q272 260 297 270'} stroke={colorPelo} strokeWidth="11" strokeLinecap="round" fill="none" />
            <path d={expresion === 'sorpresa' ? 'M342 258 Q368 244 395 262' : 'M343 270 Q368 260 393 272'} stroke={colorPelo} strokeWidth="11" strokeLinecap="round" fill="none" />

            {/* Ojos con brillo y parpadeo */}
            {[272, 368].map(x => (
              <g key={x} transform={`translate(${x} 312) scale(1 ${ojo}) translate(${-x} -312)`}>
                <ellipse cx={x} cy="312" rx="17" ry={expresion === 'sorpresa' ? 22 : 19} fill="#fff" />
                <circle cx={x + 2} cy="314" r="11" fill={C.g800} />
                <circle cx={x + 6} cy="308" r="4" fill="#fff" />
              </g>
            ))}

            {/* Nariz y mejillas */}
            <path d="M318 330 Q306 366 322 372" stroke={sombraPiel} strokeWidth="8" strokeLinecap="round" fill="none" />
            <ellipse cx="250" cy="374" rx="24" ry="12" fill="#f08a7a" opacity=".32" />
            <ellipse cx="390" cy="374" rx="24" ry="12" fill="#f08a7a" opacity=".32" />

            {/* Boca */}
            {expresion === 'sorpresa' ? (
              <ellipse cx="320" cy="408" rx="17" ry="21" fill="#7a2f2a" />
            ) : expresion === 'contenta' ? (
              <path d="M282 398 Q320 426 358 398" stroke="#7a2f2a" strokeWidth="9" strokeLinecap="round" fill="none" />
            ) : (
              <>
                <path d="M276 392 Q320 448 364 392 Z" fill="#7a2f2a" />
                <path d="M287 396 Q320 405 353 396 L349 404 Q320 411 291 404 Z" fill="#fff" />
                <path d="M298 425 Q320 438 342 425 Q320 432 298 425 Z" fill="#e9776c" />
              </>
            )}
          </g>

          {/* Brazo que levanta el objeto: brazo, antebrazo y manga corta */}
          <Tubo a={finManga} b={codo} wa={52} wb={48} color={piel} />
          <circle cx={codo.x} cy={codo.y} r={24} fill={piel} />
          <Tubo a={codo} b={mano} wa={48} wb={42} color={piel} />
          <circle cx={hombro.x} cy={hombro.y} r={40} fill={ropa} />
          <Tubo a={hombro} b={finManga} wa={80} wb={70} color={ropa} />
          <Tubo a={mezcla(hombro, finManga, 0.86)} b={finManga} wa={71} wb={70} color={sombraRopa} />

          {/* Objeto en la mano: la palma lo sostiene desde abajo y el pulgar lo
              afirma por el borde, sin tapar la pantalla. */}
          {objeto && <g transform={`translate(${mano.x} ${mano.y})`}>{objeto}</g>}
          <g transform={`translate(${mano.x} ${mano.y})`}>
            <path d="M-34 -6 C-36 -30 -14 -38 6 -34 C26 -30 38 -16 36 6 C34 28 16 38 -4 36 C-24 34 -34 18 -34 -6 Z" fill={piel} />
            <path d="M-30 -14 C-44 -30 -46 -50 -36 -58 C-26 -64 -18 -50 -14 -34" fill={piel} stroke={sombraPiel} strokeWidth="4" />
            {[-26, -10, 6].map(dy => (
              <rect key={dy} x="26" y={dy} width="22" height="14" rx="7" fill={piel} stroke={sombraPiel} strokeWidth="3" />
            ))}
          </g>
        </g>
      </g>
    </svg>
  )
}

/** Celular con la pantalla trizada; la mano lo toma desde abajo. */
export const CelularTrizado: React.FC = () => (
  <g transform="rotate(8) translate(-58 -238)">
    <rect x="0" y="0" width="120" height="236" rx="22" fill={C.g800} />
    <rect x="8" y="10" width="104" height="216" rx="15" fill="#3a4152" />
    <rect x="44" y="16" width="32" height="9" rx="4.5" fill={C.g800} />
    <path d="M70 40 l-16 55 l30 30 l-38 62 M54 95 l-34 14 M84 125 l24 -10 M46 187 l-22 20" stroke="#e8ecf5" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="8" y="10" width="104" height="80" rx="15" fill="#fff" opacity=".06" />
  </g>
)

/** Celular de la clienta con la notificación. */
export const CelularCliente: React.FC = () => (
  <g transform="rotate(8) translate(-56 -232)">
    <rect x="0" y="0" width="115" height="228" rx="22" fill={C.g800} />
    <rect x="8" y="10" width="99" height="208" rx="15" fill={C.azulClaro} />
    <rect x="16" y="32" width="83" height="46" rx="10" fill="#fff" />
    <rect x="24" y="43" width="20" height="20" rx="6" fill={C.azul} />
    <rect x="50" y="45" width="40" height="7" rx="3.5" fill={C.g700} />
    <rect x="50" y="57" width="30" height="6" rx="3" fill={C.g400} />
  </g>
)
