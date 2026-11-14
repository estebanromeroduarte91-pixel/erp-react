import React from 'react'
import { AbsoluteFill } from 'remotion'
import { C } from './marca'

// Íconos para los círculos de "Destacados" de Instagram (1080×1080, Instagram
// los recorta en círculo, así que todo el dibujo vive dentro del 78% central).
const Fondo: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <AbsoluteFill style={{ background: C.azul, alignItems: 'center', justifyContent: 'center' }}>
    <svg width={620} height={620} viewBox="0 0 620 620">{children}</svg>
  </AbsoluteFill>
)

const trazo = { stroke: '#fff', strokeWidth: 26, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }

/** Orden de ingreso: un celular con una llave de tuerca (recepción de equipos). */
export const DestacadoOrdenIngreso: React.FC = () => (
  <Fondo>
    <rect x="210" y="90" width="200" height="380" rx="36" {...trazo} />
    <line x1="270" y1="150" x2="350" y2="150" stroke="#fff" strokeWidth="26" strokeLinecap="round" />
    <circle cx="310" cy="420" r="4" fill="#fff" />
    <g transform="translate(330 330) rotate(45)">
      <path d="M0 110 L0 40" {...trazo} strokeWidth="22" />
      <circle cx="0" cy="0" r="38" {...trazo} strokeWidth="22" />
      <circle cx="0" cy="0" r="12" fill={C.azul} />
    </g>
  </Fondo>
)

/** Orden de compra: un portapapeles con casillas marcadas. */
export const DestacadoOrdenCompra: React.FC = () => (
  <Fondo>
    <rect x="150" y="120" width="320" height="400" rx="28" {...trazo} />
    <rect x="245" y="90" width="130" height="60" rx="16" fill="#fff" />
    {[0, 1, 2].map(i => (
      <g key={i} transform={`translate(0 ${i * 95})`}>
        <rect x="200" y="230" width="46" height="46" rx="10" {...trazo} strokeWidth="18" />
        <path d="M210 253 L228 268 L252 236" fill="none" stroke="#fff" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="270" y1="253" x2="400" y2="253" stroke="#fff" strokeWidth="18" strokeLinecap="round" />
      </g>
    ))}
  </Fondo>
)

/** Kits / equipos: cajas apiladas, representando el kit con sus componentes. */
export const DestacadoKits: React.FC = () => (
  <Fondo>
    <g transform="translate(310 300)">
      <path d="M-170 -40 L0 -130 L170 -40 L170 90 L0 180 L-170 90 Z" {...trazo} />
      <path d="M-170 -40 L0 50 L170 -40" {...trazo} />
      <line x1="0" y1="50" x2="0" y2="180" stroke="#fff" strokeWidth="26" strokeLinecap="round" />
    </g>
  </Fondo>
)
