import { describe, expect, it } from 'vitest'
// @ts-expect-error -- script en JS sin tipos: se prueba su lógica pura
import { extraerLlamadas, normalizarReporte } from './verificar-rpc.mjs'

describe('extraerLlamadas', () => {
  it('saca el nombre y los parámetros de cada llamada', () => {
    const encontradas = extraerLlamadas(`
      await supabase.rpc('fn_confirmar_venta', { p_venta: v, p_items: i, p_empresa_id: e })
    `)
    expect([...encontradas.get('fn_confirmar_venta')].sort()).toEqual(['p_empresa_id', 'p_items', 'p_venta'])
  })

  it('no se corta en un objeto anidado', () => {
    const encontradas = extraerLlamadas(`
      supabase.rpc('fn_x', { p_uno: { interno: 1 }, p_dos: 2 })
    `)
    expect([...encontradas.get('fn_x')].sort()).toEqual(['p_dos', 'p_uno'])
  })

  it('registra la función aunque se llame sin argumentos', () => {
    expect([...extraerLlamadas(`supabase.rpc('siguiente_folio')`).keys()]).toEqual(['siguiente_folio'])
  })

  it('junta los parámetros de dos llamadas a la misma función', () => {
    const encontradas = extraerLlamadas(`
      supabase.rpc('fn_x', { p_uno: 1 })
      supabase.rpc('fn_x', { p_dos: 2 })
    `)
    expect([...encontradas.get('fn_x')].sort()).toEqual(['p_dos', 'p_uno'])
  })
})

describe('normalizarReporte', () => {
  const fila = { funcion: 'fn_x', existe: true }

  it('acepta la lista pelada', () => {
    expect(normalizarReporte([fila])).toEqual([fila])
  })

  it('acepta el envoltorio del editor de Supabase', () => {
    expect(normalizarReporte([{ fn_contrato_rpc: [fila] }])).toEqual([fila])
    expect(normalizarReporte({ fn_contrato_rpc: [fila] })).toEqual([fila])
  })

  it('devuelve vacío cuando el archivo no es un reporte', () => {
    expect(normalizarReporte({ otra_cosa: 1 })).toEqual([])
    expect(normalizarReporte(null)).toEqual([])
  })
})
