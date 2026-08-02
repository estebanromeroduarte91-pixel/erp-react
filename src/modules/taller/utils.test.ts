import { describe, it, expect } from 'vitest'
import { resolverCategoriaEquipo, totalOrden, formatHorario } from './utils'
import type { Equipo, Repuesto } from '@/types'

describe('resolverCategoriaEquipo', () => {
  const equipos: Equipo[] = [
    { id: '1', marca: 'Apple', modelo: 'iPhone 13', categoria: 'Teléfono' },
    { id: '2', marca: 'Apple', modelo: 'MacBook Air M1', categoria: 'Notebook' },
    { id: '3', marca: 'Samsung', modelo: 'Tab S8', categoria: 'Tablet' },
  ]

  it('matchea por modelo + marca cuando el texto viene como "Modelo [Marca]"', () => {
    expect(resolverCategoriaEquipo('iPhone 13 [Apple]', equipos)).toBe('Teléfono')
    expect(resolverCategoriaEquipo('MacBook Air M1 [Apple]', equipos)).toBe('Notebook')
  })

  it('no distingue mayúsculas/minúsculas ni espacios extra', () => {
    expect(resolverCategoriaEquipo('  iphone 13  [apple]', equipos)).toBe('Teléfono')
  })

  it('cae a "Teléfono" si no hay match en el catálogo', () => {
    expect(resolverCategoriaEquipo('Modelo Inventado [Marca X]', equipos)).toBe('Teléfono')
  })

  it('cae a "Teléfono" si no viene texto', () => {
    expect(resolverCategoriaEquipo(undefined, equipos)).toBe('Teléfono')
  })
})

describe('totalOrden', () => {
  const repuestos: Repuesto[] = [
    { name: 'Pantalla', qty: 1, precio: 50000 },
    { name: 'Batería', qty: 2, precio: 15000 },
  ]

  it('usa el costo/presupuesto manual si está seteado, ignorando repuestos', () => {
    expect(totalOrden({ costo: '90000', presup: '', repuestos })).toBe(90000)
  })

  it('usa presup si no hay costo manual', () => {
    expect(totalOrden({ costo: '', presup: '75000', repuestos })).toBe(75000)
  })

  it('suma repuestos (precio × qty) si no hay costo ni presup manual', () => {
    // 50000×1 + 15000×2 = 80000
    expect(totalOrden({ costo: '', presup: '', repuestos })).toBe(80000)
  })

  it('da 0 sin repuestos ni costo/presup', () => {
    expect(totalOrden({ costo: '', presup: '', repuestos: [] })).toBe(0)
  })
})

describe('formatHorario', () => {
  it('devuelve el string tal cual si ya viene como texto plano (formato viejo)', () => {
    expect(formatHorario('Lun a Vie 9:00-18:00')).toBe('Lun a Vie 9:00-18:00')
  })

  it('devuelve vacío si no hay horario', () => {
    expect(formatHorario(undefined)).toBe('')
    expect(formatHorario(null)).toBe('')
  })

  it('agrupa días consecutivos con guión', () => {
    const horario = { dias: ['lun', 'mar', 'mie'], desde: '09:00', hasta: '18:00' }
    expect(formatHorario(horario)).toBe('Lun–Mié 09:00–18:00')
  })

  it('lista días no consecutivos separados por coma', () => {
    const horario = { dias: ['lun', 'mie', 'vie'], desde: '09:00', hasta: '18:00' }
    expect(formatHorario(horario)).toBe('Lun, Mié, Vie 09:00–18:00')
  })

  it('une varios bloques con " / "', () => {
    // Con solo 2 días consecutivos usa coma, no guión de rango — el guión
    // (idx.length > 2) es exclusivo de bloques de 3+ días consecutivos.
    const horario = {
      bloques: [
        { dias: ['lun', 'mar', 'mie'], desde: '09:00', hasta: '13:00' },
        { dias: ['jue', 'vie'], desde: '14:00', hasta: '18:00' },
      ],
    }
    expect(formatHorario(horario)).toBe('Lun–Mié 09:00–13:00 / Jue, Vie 14:00–18:00')
  })
})
