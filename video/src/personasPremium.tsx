import React from 'react'
import { Img, staticFile, useCurrentFrame } from 'remotion'
import type { PersonaProps } from './personas'

// Versión independiente: conserva intactos los personajes del video original.
export const Persona: React.FC<PersonaProps> = ({ pelo, ancho = 620 }) => {
  const frame = useCurrentFrame()
  const clienta = pelo === 'largo'
  return <div style={{ width: ancho, height: ancho * 1.25, position: 'relative', transformOrigin: '50% 100%', transform: `translateY(${Math.sin(frame / 18) * 2}px) rotate(${Math.sin(frame / 32) * 0.25}deg)` }}>
    <Img src={staticFile(`personajes-premium/${clienta ? 'clienta' : 'tecnico'}.png`)} style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center bottom' }} />
  </div>
}
