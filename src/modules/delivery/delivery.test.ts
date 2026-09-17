import { describe, expect, it } from 'vitest'
import { codigoDelivery, direccionEntrega, ESTADOS, fechaDia, hoyIso, siguientePaso } from './delivery'

describe('delivery', () => {
  it('formatea el código con seis dígitos', () => {
    expect(codigoDelivery(124)).toBe('DEL-000124')
  })

  it('en taller no hay botón: lo mueve la orden', () => {
    expect(siguientePaso('en_taller')).toBeNull()
    expect(siguientePaso('entregada')).toBeNull()
    expect(siguientePaso('en_ruta_retiro')?.accion).toBe('crear_orden')
    expect(siguientePaso('retiro_agendado')?.destino).toBe('en_ruta_retiro')
  })

  it('todos los estados activos del tramo entrega tienen siguiente paso', () => {
    const entrega = Object.entries(ESTADOS).filter(([, v]) => v.tramo === 'entrega').map(([k]) => k)
    for (const e of entrega) expect(siguientePaso(e as never)).not.toBeNull()
  })

  it('sin dirección de entrega propia devuelve la del retiro', () => {
    const base = { direccion: 'Apoquindo 6410', comuna: 'Las Condes', entrega_direccion: null, entrega_comuna: null }
    expect(direccionEntrega(base)).toEqual({ direccion: 'Apoquindo 6410', comuna: 'Las Condes' })
    expect(direccionEntrega({ ...base, entrega_direccion: 'Oficina 2', entrega_comuna: null }))
      .toEqual({ direccion: 'Oficina 2', comuna: 'Las Condes' })
  })

  it('no corre la fecha un día hacia atrás', () => {
    expect(fechaDia('2026-09-18')).toContain('18')
  })

  it('hoy se calcula en hora de Chile', () => {
    // 02:00 UTC del 17 = 23:00 del 16 en Santiago (UTC-3 en septiembre).
    expect(hoyIso(new Date('2026-09-17T02:00:00Z'))).toBe('2026-09-16')
  })
})
