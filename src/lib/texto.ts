// Comparación de nombres escritos a mano.
//
// Existe porque las categorías, subcategorías y proveedores se escriben libres,
// y así se llenan de variantes de lo mismo: "Cable" y "Cables", "Accesorios" y
// "accesorio", "Batería" y "Bateria". Cada variante se convierte en una fila
// aparte en los reportes y en el inventario, y para cuando se nota ya hay
// productos repartidos entre las dos.

/** Minúsculas, sin tildes y con los espacios colapsados. */
export function normalizar(texto: string): string {
  return (texto ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
}

/** Palabras y números comparables de un texto ya normalizado. */
function tokenizar(texto: string): string[] {
  return normalizar(texto).match(/[a-z0-9]+/g) ?? []
}

export type CamposBusqueda = {
  principal: string
  codigo?: string | null
  secundarios?: Array<string | null | undefined>
}

function calidadCoincidencia(consulta: string, candidato: string): number {
  if (consulta === candidato) return 30

  // Un número representa normalmente una generación o modelo. Debe coincidir
  // como palabra completa: "5" no puede encontrar el 5 escondido en A1566.
  if (/^\d+$/.test(consulta)) return 0

  if (consulta.length >= 2 && candidato.startsWith(consulta)) return 20
  if (consulta.length >= 3 && candidato.includes(consulta)) return 10
  return 0
}

/**
 * Puntúa una coincidencia para poder mostrar primero el resultado más útil.
 * Devuelve `null` si falta cualquiera de las palabras buscadas.
 *
 * El nombre pesa más que categoría/subcategoría y un SKU exacto queda arriba.
 * La búsqueda sigue siendo flexible: no exige tildes, frase exacta ni que las
 * palabras estén escritas en el mismo orden.
 */
export function puntuarBusqueda(consulta: string, campos: CamposBusqueda): number | null {
  const limpio = normalizar(consulta)
  const palabras = tokenizar(limpio)
  if (!palabras.length) return 0

  const nombreLimpio = normalizar(campos.principal)
  const nombreTokens = tokenizar(campos.principal)
  const codigoLimpio = normalizar(campos.codigo ?? '')
  const codigoTokens = tokenizar(campos.codigo ?? '')
  const secundariosTokens = tokenizar((campos.secundarios ?? []).filter(Boolean).join(' '))

  let puntaje = 0
  for (const palabra of palabras) {
    const enNombre = Math.max(0, ...nombreTokens.map(token => calidadCoincidencia(palabra, token)))
    const enCodigo = Math.max(0, ...codigoTokens.map(token => calidadCoincidencia(palabra, token)))
    const enSecundarios = Math.max(0, ...secundariosTokens.map(token => calidadCoincidencia(palabra, token)))
    const mejor = Math.max(enNombre * 4, enCodigo * 3, enSecundarios)
    if (!mejor) return null
    puntaje += mejor
  }

  if (codigoLimpio && codigoLimpio === limpio) puntaje += 1_000
  if (nombreLimpio === limpio) puntaje += 800
  else if (nombreLimpio.includes(limpio)) puntaje += 400

  // Premia que las palabras estén juntas y en el orden escrito, sin volverlo
  // un requisito. Así "iPad Air 5" aparece antes que coincidencias dispersas.
  const posiciones = palabras.map(palabra =>
    nombreTokens.findIndex(token => calidadCoincidencia(palabra, token) > 0),
  )
  if (posiciones.every((pos, i) => i === 0 || pos > posiciones[i - 1])) puntaje += 100
  if (posiciones.every((pos, i) => i === 0 || pos === posiciones[i - 1] + 1)) puntaje += 150

  return puntaje
}

/**
 * Raíces posibles de una palabra en español.
 *
 * No alcanza con quitar una terminación: "cables" es "cable" + s y
 * "cargadores" es "cargador" + es, y por fuera se ven iguales. En vez de
 * adivinar cuál regla aplica, se generan las dos y se consideran iguales dos
 * palabras que compartan cualquier raíz.
 *
 * El mínimo de 3 letras evita que palabras cortas colapsen entre sí ("gas" con
 * "ga"), que sería peor que no detectar nada.
 */
function raices(palabra: string): string[] {
  const salida = [palabra]
  if (palabra.endsWith('s') && palabra.length - 1 >= 3) salida.push(palabra.slice(0, -1))
  if (palabra.endsWith('es') && palabra.length - 2 >= 3) salida.push(palabra.slice(0, -2))
  return salida
}

/** ¿Son dos formas de escribir el mismo nombre? */
export function esCasiIgual(a: string, b: string): boolean {
  const pa = normalizar(a).split(' ').filter(Boolean)
  const pb = normalizar(b).split(' ').filter(Boolean)
  if (!pa.length || pa.length !== pb.length) return false
  return pa.every((palabra, i) => {
    const posibles = new Set(raices(palabra))
    return raices(pb[i]).some(r => posibles.has(r))
  })
}

/**
 * Busca en `existentes` un nombre que sea el mismo que `texto` escrito de otra
 * forma. Devuelve `undefined` si es idéntico —ahí no hay nada que advertir— o
 * si no se parece a ninguno.
 */
export function buscarSimilar(texto: string, existentes: string[]): string | undefined {
  const limpio = texto.trim()
  if (!limpio) return undefined
  const exacto = existentes.some(e => normalizar(e) === normalizar(limpio))
  if (exacto) return undefined
  return existentes.find(e => esCasiIgual(e, limpio))
}
