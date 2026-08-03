import { describe, it, expect } from 'vitest'
import { validarArchivoImport, validarContenidoImport, MAX_MB, MAX_FILAS, MAX_HOJAS } from './importArchivo'

const ZIP = [0x50, 0x4b, 0x03, 0x04]           // firma de .xlsx (es un ZIP)
const OLE2 = [0xd0, 0xcf, 0x11, 0xe0]          // firma de .xls (OLE2)
const PDF = [0x25, 0x50, 0x44, 0x46]           // '%PDF' — un archivo renombrado

function archivo(nombre: string, bytes: number[], tamano?: number): File {
  const relleno = tamano != null
    ? new Uint8Array(Math.max(0, tamano - bytes.length))
    : new Uint8Array(0)
  return new File([new Uint8Array(bytes), relleno], nombre)
}

describe('validarArchivoImport', () => {
  it('acepta un .xlsx legítimo', async () => {
    expect(await validarArchivoImport(archivo('clientes.xlsx', ZIP), ['xlsx', 'xls'])).toBeNull()
  })

  it('acepta un .xls cuando la pantalla lo soporta', async () => {
    expect(await validarArchivoImport(archivo('clientes.xls', OLE2), ['xlsx', 'xls'])).toBeNull()
  })

  it('rechaza un formato que esa pantalla no soporta', async () => {
    const error = await validarArchivoImport(archivo('datos.csv', [0x61, 0x2c, 0x62]), ['xlsx'])
    expect(error).toContain('Formato no admitido')
    expect(error).toContain('.xlsx')
  })

  it('rechaza un archivo más grande que el máximo', async () => {
    const gigante = archivo('enorme.xlsx', ZIP, (MAX_MB + 1) * 1024 * 1024)
    const error = await validarArchivoImport(gigante, ['xlsx'])
    expect(error).toContain('máximo es 10 MB')
  })

  it('rechaza un archivo renombrado (extensión .xlsx pero contenido de PDF)', async () => {
    const error = await validarArchivoImport(archivo('trampa.xlsx', PDF), ['xlsx'])
    expect(error).toContain('su contenido no corresponde')
  })

  it('rechaza un archivo vacío', async () => {
    expect(await validarArchivoImport(archivo('vacio.xlsx', []), ['xlsx'])).toContain('vacío')
  })

  it('no valida firma en .csv, que es texto plano sin firma', async () => {
    const csv = archivo('equipos.csv', [0x4d, 0x61, 0x72, 0x63]) // 'Marc...'
    expect(await validarArchivoImport(csv, ['xlsx', 'csv'])).toBeNull()
  })
})

describe('validarContenidoImport', () => {
  it('acepta un archivo dentro de los límites', () => {
    expect(validarContenidoImport(500, 2)).toBeNull()
  })

  it('rechaza demasiadas filas', () => {
    expect(validarContenidoImport(MAX_FILAS + 1)).toContain('máximo por importación')
  })

  it('rechaza demasiadas hojas', () => {
    expect(validarContenidoImport(10, MAX_HOJAS + 1)).toContain('hojas')
  })
})
