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
