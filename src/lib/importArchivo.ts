// Validación de los archivos que se suben en las pantallas de importación
// (clientes, productos, equipos, historial de órdenes).
//
// Antes no había ninguna: el `accept=".xlsx"` del <input> es solo una sugerencia
// de la UI —se lo salta un drag&drop o eligiendo "todos los archivos"— así que
// cualquier archivo llegaba directo al parser. Un archivo de cientos de MB se
// leía entero a memoria y congelaba o tumbaba la pestaña.
//
// Esto es robustez y UX, NO seguridad: las vulnerabilidades de SheetJS
// (prototype pollution y ReDoS) se cerraron actualizando a 0.20.3, no acá.

export type FormatoImport = 'xlsx' | 'xls' | 'csv'

/** Tope de tamaño. Un padrón de ~20.000 filas pesa muy por debajo de esto. */
export const MAX_MB = 10
/** Tope de filas de datos a procesar de una sola importación. */
export const MAX_FILAS = 20_000
/** Tope de hojas a recorrer dentro de un libro. */
export const MAX_HOJAS = 20

const ETIQUETA: Record<FormatoImport, string> = { xlsx: '.xlsx', xls: '.xls', csv: '.csv' }

function listaLegible(formatos: FormatoImport[]): string {
  const etiquetas = formatos.map(f => ETIQUETA[f])
  if (etiquetas.length === 1) return etiquetas[0]
  return `${etiquetas.slice(0, -1).join(', ')} o ${etiquetas[etiquetas.length - 1]}`
}

function extensionDe(nombre: string): string {
  const partes = nombre.toLowerCase().split('.')
  return partes.length > 1 ? partes[partes.length - 1] : ''
}

// Firma binaria del inicio del archivo. Detecta un archivo renombrado (un .pdf
// al que le cambiaron la extensión a .xlsx), que la extensión sola no ve.
// Se usa esto y no el MIME del navegador porque el MIME de un .xlsx es
// inconsistente entre navegadores y sistemas —a veces llega vacío—, así que
// como filtro duro rechazaría archivos legítimos.
//   .xlsx → es un ZIP        → 50 4B ('PK')
//   .xls  → es OLE2          → D0 CF 11 E0
//   .csv  → texto plano, sin firma → no se puede verificar, se omite
function firmaValida(bytes: Uint8Array, formato: FormatoImport): boolean {
  if (formato === 'csv') return true
  if (formato === 'xlsx') return bytes[0] === 0x50 && bytes[1] === 0x4b
  return bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
}

/**
 * Valida un archivo antes de pasarlo al parser.
 * Devuelve un mensaje de error listo para mostrar, o `null` si está todo bien.
 */
export async function validarArchivoImport(
  file: File,
  permitidos: FormatoImport[],
): Promise<string | null> {
  if (file.size === 0) {
    return 'El archivo está vacío.'
  }

  const maxBytes = MAX_MB * 1024 * 1024
  if (file.size > maxBytes) {
    const pesa = (file.size / 1024 / 1024).toFixed(1)
    return `El archivo pesa ${pesa} MB y el máximo es ${MAX_MB} MB. Divídelo en partes más chicas e impórtalas por separado.`
  }

  const ext = extensionDe(file.name)
  const formato = permitidos.find(f => f === ext)
  if (!formato) {
    return `Formato no admitido en esta pantalla. Usa un archivo ${listaLegible(permitidos)}.`
  }

  const cabecera = new Uint8Array(await file.slice(0, 8).arrayBuffer())
  if (!firmaValida(cabecera, formato)) {
    return `El archivo dice ser ${ETIQUETA[formato]} pero su contenido no corresponde. Vuelve a exportarlo desde Excel y reinténtalo.`
  }

  return null
}

/**
 * Valida el contenido ya parseado (cuántas filas/hojas trae el libro).
 * Devuelve un mensaje de error listo para mostrar, o `null` si está todo bien.
 */
export function validarContenidoImport(filas: number, hojas = 1): string | null {
  if (hojas > MAX_HOJAS) {
    return `El archivo tiene ${hojas} hojas y el máximo es ${MAX_HOJAS}. Deja solo la hoja con los datos a importar.`
  }
  if (filas > MAX_FILAS) {
    return `El archivo tiene ${filas.toLocaleString('es-CL')} filas y el máximo por importación es ${MAX_FILAS.toLocaleString('es-CL')}. Divídelo en partes e impórtalas por separado.`
  }
  return null
}
