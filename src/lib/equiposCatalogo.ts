import type { Equipo } from '@/types'

export function normalizarNombreEquipo(valor: string | undefined): string {
  return (valor ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function claveEquipo(equipo: Pick<Equipo, 'marca' | 'modelo'>): string {
  return JSON.stringify([normalizarNombreEquipo(equipo.marca), normalizarNombreEquipo(equipo.modelo)])
}

export function buscarEquipoExistente(catalogo: Equipo[], equipo: Pick<Equipo, 'marca' | 'modelo'>, ignorarId?: string): Equipo | undefined {
  if (!normalizarNombreEquipo(equipo.modelo)) return undefined
  return catalogo.find(e => e.id !== ignorarId && claveEquipo(e) === claveEquipo(equipo))
}

/** Omite coincidencias exactas tanto con el catálogo como dentro del archivo. */
export function equiposNuevos(catalogo: Equipo[], candidatos: Equipo[]): Equipo[] {
  const claves = new Set(catalogo.map(claveEquipo))
  return candidatos.filter(e => {
    const clave = claveEquipo(e)
    if (claves.has(clave)) return false
    claves.add(clave)
    return true
  })
}

/** Permite corregir catálogos antiguos sin aumentar sus duplicados existentes. */
export function validarDuplicadosEquipos(equipos: Equipo[], anteriores: Equipo[] = []): void {
  const contar = (lista: Equipo[]) => {
    const conteos = new Map<string, number>()
    for (const equipo of lista) {
      if (!normalizarNombreEquipo(equipo.modelo)) continue
      const clave = claveEquipo(equipo)
      conteos.set(clave, (conteos.get(clave) ?? 0) + 1)
    }
    return conteos
  }
  const previos = contar(anteriores)
  for (const [clave, cantidad] of contar(equipos)) {
    if (cantidad > Math.max(1, previos.get(clave) ?? 0)) {
      const equipo = equipos.find(e => claveEquipo(e) === clave)!
      throw new Error(`El equipo ${equipo.marca ?? ''} ${equipo.modelo ?? ''} ya existe en el catálogo. Usa el registro existente.`)
    }
  }
}
