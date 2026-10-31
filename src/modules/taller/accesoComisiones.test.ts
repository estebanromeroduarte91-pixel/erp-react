import { describe, expect, it } from 'vitest'
import { accesoComisiones, comisionVisible } from './accesoComisiones'

const acceso = (rol: string, branchId?: string) => accesoComisiones({ rol, esAdmin: rol === 'admin', esPlatformAdmin: false, branchId })

describe('comisiones del encargado', () => {
  it('puede consultar el equipo de su sucursal, pero no registrar pagos', () => {
    const permisos = acceso('encargado', 'dehesa')
    expect(permisos.puedeVerEquipo).toBe(true)
    expect(permisos.puedeGestionar).toBe(false)
    expect(comisionVisible({ tecnicoId: 'otro', branchId: 'dehesa' }, permisos, 'encargado')).toBe(true)
    expect(comisionVisible({ tecnicoId: 'otro', branchId: 'dominicos' }, permisos, 'encargado')).toBe(false)
    expect(comisionVisible({ tecnicoId: 'encargado', branchId: 'dominicos' }, permisos, 'encargado')).toBe(false)
  })

  it('sin sucursal asignada no ve todas las comisiones por accidente', () => {
    const permisos = acceso('encargado')
    expect(permisos.requiereSucursal).toBe(true)
    expect(comisionVisible({ tecnicoId: 'encargado' }, permisos, 'encargado')).toBe(false)
  })

  it('el técnico sigue viendo únicamente sus propias comisiones', () => {
    expect(comisionVisible({ tecnicoId: 'otro', branchId: 'dehesa' }, acceso('tecnico', 'dehesa'), 'yo')).toBe(false)
    expect(comisionVisible({ tecnicoId: 'yo', branchId: 'dehesa' }, acceso('tecnico', 'dehesa'), 'yo')).toBe(true)
  })

  it('el administrador conserva el acceso completo y la gestión de pagos', () => {
    const permisos = acceso('admin', 'dehesa')
    expect(permisos.puedeGestionar).toBe(true)
    expect(comisionVisible({ tecnicoId: 'otro', branchId: 'dominicos' }, permisos, 'admin')).toBe(true)
  })

  it('el administrador de plataforma conserva el acceso de gestión', () => {
    const permisos = accesoComisiones({ rol: 'encargado', esAdmin: false, esPlatformAdmin: true })
    expect(permisos.requiereSucursal).toBe(false)
    expect(permisos.puedeGestionar).toBe(true)
  })
})
