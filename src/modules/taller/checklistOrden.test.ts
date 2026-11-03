import { describe, expect, it } from 'vitest'
import { checklistOrden } from './checklistOrden'
import type { CheckItem } from '@/types'

describe('checklist guardado de una orden', () => {
  it('conserva componentes y respuestas de MacBook frente a una plantilla de teléfono', () => {
    const ingreso: CheckItem[] = [
      { label: 'Teclado', checked: true, estado: 'ok' },
      { label: 'Trackpad', checked: false, estado: 'no_funciona' },
      { label: 'Conector Carga', checked: false, estado: 'no_probado' },
    ]
    expect(checklistOrden(ingreso, ['Cámara trasera', 'Conector de carga'])).toEqual(ingreso)
    expect(ingreso[0].estado).toBe('ok')
  })

  it('no agrega funciones nuevas ni elimina nombres antiguos al cambiar la configuración', () => {
    const ingreso: CheckItem[] = [{ label: 'Pantalla', checked: false }]
    expect(checklistOrden(ingreso, ['Pantalla (táctil y visual)', 'WiFi'])).toEqual(ingreso)
  })

  it('recupera las marcas del formato histórico sin estado explícito', () => {
    expect(checklistOrden([{ label: 'Micrófono', checked: true }], []))
      .toEqual([{ label: 'Micrófono', checked: true, estado: 'ok' }])
  })

  it('inicializa una revisión sin respuestas usando sus componentes de ingreso', () => {
    expect(checklistOrden([], ['Teclado', 'Trackpad']))
      .toEqual([{ label: 'Teclado', checked: false }, { label: 'Trackpad', checked: false }])
  })
})
