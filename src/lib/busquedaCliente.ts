import { normalizar } from './texto'
import { soloRutDigits } from './rut'

type DatosCliente = { nombre?: string | null; apellido?: string | null; rut?: string | null; tel?: string | null }

export function coincideCliente(cliente: DatosCliente, consulta: string): boolean {
  const q = normalizar(consulta)
  if (!q) return true
  const nombreCompleto = normalizar(`${cliente.nombre ?? ''} ${cliente.apellido ?? ''}`)
  if (q.split(' ').every(palabra => nombreCompleto.includes(palabra))) return true
  // Evitar que una K dentro de un nombre coincida con el verificador del RUT.
  if (!/^[\d.k\s+()-]+$/i.test(q) || !/\d/.test(q)) return false
  const rut = soloRutDigits(q)
  if (rut && soloRutDigits(cliente.rut ?? '').includes(rut)) return true
  const telefono = q.replace(/\D/g, '')
  return !/k/i.test(q) && !!telefono && (cliente.tel ?? '').replace(/\D/g, '').includes(telefono)
}
