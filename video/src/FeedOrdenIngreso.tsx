import React from 'react'
import { AbsoluteFill, Img, staticFile } from 'remotion'
import { C, fontFamily } from './marca'

// Foto fija para el feed de Instagram (1080×1350, formato 4:5): la pantalla
// de "Nueva orden" de Pixit, completa y aprobada, con el técnico al lado.
const Campo: React.FC<{ label: string; valor: string }> = ({ label, valor }) => (
  <div style={{
    background: '#fff', borderRadius: 26, padding: '24px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    border: `4px solid ${C.g100}`,
  }}>
    <div>
      <div style={{ fontSize: 24, fontWeight: 700, color: C.g400, textTransform: 'uppercase', letterSpacing: 2 }}>{label}</div>
      <div style={{ fontSize: 40, fontWeight: 800, color: C.g800 }}>{valor}</div>
    </div>
    <div style={{
      width: 54, height: 54, borderRadius: '50%', background: C.verde, color: '#fff', fontSize: 32, fontWeight: 800,
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>✓</div>
  </div>
)

export const FeedOrdenIngreso: React.FC = () => (
  <AbsoluteFill style={{ background: C.fondo, fontFamily }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 90, height: 14, background: C.azul, opacity: 0.9 }} />
    <div style={{ position: 'absolute', top: -220, right: -180, width: 520, height: 520, borderRadius: '50%', background: C.azulClaro, opacity: 0.6 }} />
    <div style={{ position: 'absolute', bottom: -220, left: -180, width: 480, height: 480, borderRadius: '50%', background: C.verdeClaro, opacity: 0.5 }} />

    <AbsoluteFill style={{ alignItems: 'center', paddingTop: 70 }}>
      <Img src={staticFile('logo-pixit.png')} style={{ height: 60 }} />

      <div style={{
        marginTop: 46, fontSize: 60, fontWeight: 800, color: C.g800, textAlign: 'center', lineHeight: 1.08, letterSpacing: -1, width: 900,
      }}>Órdenes de ingreso,<br />sin papeles</div>
      <div style={{ marginTop: 18, fontSize: 30, fontWeight: 600, color: C.g500, textAlign: 'center', width: 780 }}>
        Cliente, equipo, falla y clave — todo queda guardado en la orden
      </div>

      <div style={{
        marginTop: 50, width: 640, background: '#fff', borderRadius: 40, border: `3px solid ${C.g100}`, padding: '36px 36px 42px',
        boxShadow: '0 40px 90px rgba(21,24,31,.14)', display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 32, fontWeight: 800, color: C.g800 }}>Nueva orden</span>
          <span style={{ fontSize: 24, fontWeight: 700, color: C.azul, background: C.azulClaro, borderRadius: 999, padding: '8px 20px' }}>#4343</span>
        </div>
        <Campo label="Cliente" valor="Carla Soto" />
        <Campo label="Equipo" valor="iPhone 13" />
        <Campo label="Falla" valor="No carga" />
        <Campo label="Clave" valor="650224" />
      </div>
    </AbsoluteFill>

    <div style={{ position: 'absolute', bottom: 56, left: 0, right: 0, textAlign: 'center', fontSize: 30, fontWeight: 800, color: C.azul }}>
      pixit.cl
    </div>
  </AbsoluteFill>
)
