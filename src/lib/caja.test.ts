import { describe, expect, it } from 'vitest'
import { calcularTotalesCaja } from './caja'
import type { MetodoPago, Venta } from '@/types'

const metodos: MetodoPago[] = [
  { id: 'efectivo', label: 'Efectivo', icon: '', desc: '' },
  { id: 'getnet', label: 'GetNet', icon: '', desc: '' },
  { id: 'transfer', label: 'Transferencia', icon: '', desc: '' },
]

function venta(id: string, metodo_pago: string, total_iva: number, estado: Venta['estado'] = 'pagada'): Venta {
  return {
    id,
    numero: id,
    fecha: '2026-09-11',
    estado,
    cliente: 'Cliente',
    metodo_pago,
    branchId: 'sucursal',
    branchNombre: 'Sucursal',
    bodega_id: 'bodega',
    cajaId: 'caja',
    otId: null,
    otNum: null,
    items: [],
    total: total_iva,
    total_iva,
    fecha_creacion: '2026-09-11T12:00:00Z',
  }
}

describe('calcularTotalesCaja', () => {
  it('mantiene cada método configurado con cantidad y monto', () => {
    const resultado = calcularTotalesCaja([
      venta('1', 'getnet', 100_000),
      venta('2', 'getnet', 50_000),
      venta('3', 'efectivo', 20_000),
      venta('4', 'transfer', 30_000, 'anulada'),
    ], metodos)

    expect(resultado._total).toBe(170_000)
    expect(resultado._count).toBe(3)
    expect(resultado.efectivo).toBe(20_000)
    expect(resultado.desgloseMetodos).toEqual([
      { metodoId: 'efectivo', nombre: 'Efectivo', cantidad: 1, monto: 20_000 },
      { metodoId: 'getnet', nombre: 'GetNet', cantidad: 2, monto: 150_000 },
      { metodoId: 'transfer', nombre: 'Transferencia', cantidad: 0, monto: 0 },
    ])
  })

  it('conserva métodos eliminados presentes en ventas históricas', () => {
    const resultado = calcularTotalesCaja([venta('1', 'mpt7zej50ss1s', 9_990)], metodos)
    expect(resultado.desgloseMetodos.at(-1)).toEqual({
      metodoId: 'mpt7zej50ss1s',
      nombre: 'Método eliminado',
      cantidad: 1,
      monto: 9_990,
    })
  })
})
