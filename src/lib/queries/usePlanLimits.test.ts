import { describe, it, expect } from 'vitest'
import { PLAN_MODULES, TIER_LIMITS, TIER_ORDER, DEFAULT_PLAN_LIMITS, MODULO_LABELS } from './usePlanLimits'

// Estas tablas deciden qué ve cada cliente según lo que pagó. Un error acá no
// rompe nada visible: simplemente se regala un módulo, o se le cobra a alguien
// algo que no puede usar. Por eso se fijan las invariantes del negocio.

describe('configuración de planes', () => {
  it('todos los tiers tienen límites y módulos definidos', () => {
    for (const tier of TIER_ORDER) {
      expect(TIER_LIMITS[tier], `faltan límites para ${tier}`).toBeDefined()
      expect(PLAN_MODULES[tier], `faltan módulos para ${tier}`).toBeDefined()
      expect(PLAN_MODULES[tier].length).toBeGreaterThan(0)
    }
  })

  it('el plan por defecto es el MÁS BAJO, no el más alto', () => {
    // Invariante de seguridad: si una empresa no tiene `plan_limits` guardado
    // (fila borrada, empresa antigua, error de red), debe caer al plan mínimo.
    // Si el default fuera 'scale', cualquier fallo regalaría el producto entero.
    expect(DEFAULT_PLAN_LIMITS.tier).toBe(TIER_ORDER[0])
  })

  it('un tier superior nunca ofrece menos módulos que uno inferior', () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const inferior = PLAN_MODULES[TIER_ORDER[i - 1]]
      const superior = PLAN_MODULES[TIER_ORDER[i]]
      for (const modulo of inferior) {
        expect(superior, `${TIER_ORDER[i]} debería incluir "${modulo}" porque ${TIER_ORDER[i - 1]} lo incluye`)
          .toContain(modulo)
      }
    }
  })

  it('un tier superior nunca tiene límites más chicos que uno inferior', () => {
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const inferior = TIER_LIMITS[TIER_ORDER[i - 1]]
      const superior = TIER_LIMITS[TIER_ORDER[i]]
      expect(superior.max_usuarios).toBeGreaterThanOrEqual(inferior.max_usuarios)
      expect(superior.max_sucursales).toBeGreaterThanOrEqual(inferior.max_sucursales)
    }
  })

  it('todo módulo listado en algún plan tiene nombre visible', () => {
    // Si falta la etiqueta, la pantalla de "qué perderías" muestra el id crudo.
    const todos = new Set(TIER_ORDER.flatMap(t => PLAN_MODULES[t]))
    for (const modulo of todos) {
      expect(MODULO_LABELS[modulo], `falta la etiqueta de "${modulo}"`).toBeDefined()
    }
  })

  it('el tier más alto incluye todos los módulos existentes', () => {
    const masAlto = TIER_ORDER[TIER_ORDER.length - 1]
    const todos = new Set(TIER_ORDER.flatMap(t => PLAN_MODULES[t]))
    expect(new Set(PLAN_MODULES[masAlto])).toEqual(todos)
  })
})
