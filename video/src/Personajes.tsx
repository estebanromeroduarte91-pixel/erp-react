import React from 'react'
import { AbsoluteFill } from 'remotion'
import { C, fontFamily } from './marca'
import { CelularCliente, CelularTrizado, Persona } from './personas'

// Lámina para revisar los personajes fuera del video, en alta resolución.
const Ficha: React.FC<{ titulo: string; detalle: string; children: React.ReactNode }> = ({ titulo, detalle, children }) => (
  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <div style={{ height: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'visible' }}>{children}</div>
    <div style={{ width: '86%', height: 14, background: '#d4d8e2', borderRadius: 7 }} />
    <div style={{ marginTop: 36, fontSize: 56, fontWeight: 800, color: C.g800 }}>{titulo}</div>
    <div style={{ marginTop: 8, fontSize: 32, fontWeight: 600, color: C.g500 }}>{detalle}</div>
  </div>
)

export const Personajes: React.FC = () => (
  <AbsoluteFill style={{ background: C.fondo, fontFamily, padding: 80 }}>
    <div style={{ fontSize: 40, fontWeight: 800, color: C.azul, letterSpacing: 4, textTransform: 'uppercase' }}>Personajes · Pixit</div>
    <div style={{ display: 'flex', gap: 60, marginTop: 40 }}>
      <Ficha titulo="El técnico" detalle="Delantal con el sello de Pixit">
        <Persona delantal levanta={1} expresion="feliz" objeto={<CelularTrizado />} ancho={720} />
      </Ficha>
      <Ficha titulo="La clienta" detalle="Recibe el aviso en su celular">
        <Persona aros pelo="largo" colorPelo="#5a3825" piel="#e9b98f" sombraPiel="#cf9a70" ropa="#e2564b" sombraRopa="#b8433a"
          expresion="feliz" levanta={1} objeto={<CelularCliente />} ancho={720} />
      </Ficha>
    </div>
  </AbsoluteFill>
)
