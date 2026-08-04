// Compresión de las fotos que se suben DESDE la app (botón "+ Subir" en
// órdenes, inspección y derivaciones).
//
// Esas fotos se guardan como data URL base64 dentro de la propia fila de
// `ordenes`, no en storage. Hasta ahora se guardaban tal cual salían de la
// cámara: un archivo de 4 MB, más el 33% que agrega base64, terminaba pesando
// ~5,3 MB dentro de una fila de la base. Por eso `ordenes` llegó a ser el 36%
// del tamaño total, mientras `ventas` no llega a 1 MB.
//
// El flujo del QR (public/foto-orden.html) ya comprimía así desde hace tiempo;
// esta es la misma idea, aplicada al camino que había quedado afuera.

/** Lado máximo (px). Suficiente para documentar el estado de un equipo. */
export const MAX_LADO = 1400
/** Calidad JPEG. 0.8 es el punto donde el peso baja mucho y el ojo no lo nota. */
export const CALIDAD = 0.8

/**
 * Dimensiones de destino manteniendo la proporción. Si la imagen ya entra en
 * el límite se devuelve igual: reescalar hacia arriba solo agregaría peso sin
 * agregar detalle.
 */
export function calcularDimensiones(
  ancho: number,
  alto: number,
  maxLado = MAX_LADO,
): { ancho: number; alto: number } {
  const mayor = Math.max(ancho, alto)
  if (mayor <= maxLado || mayor === 0) return { ancho, alto }
  const escala = maxLado / mayor
  return { ancho: Math.round(ancho * escala), alto: Math.round(alto * escala) }
}

/**
 * Convierte un archivo de imagen en un data URL comprimido.
 *
 * Si algo falla (formato raro, navegador sin soporte de canvas) devuelve el
 * archivo original sin comprimir: es preferible guardar una foto pesada a
 * perderla. Por el mismo motivo tampoco se comprime si el resultado quedó más
 * grande que el original, que puede pasar con imágenes ya optimizadas.
 */
export async function comprimirImagenADataUrl(
  archivo: File,
  maxLado = MAX_LADO,
  calidad = CALIDAD,
): Promise<string> {
  const original = () => leerComoDataUrl(archivo)

  try {
    if (!archivo.type?.startsWith('image/')) return await original()

    const bitmap = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
    const { ancho, alto } = calcularDimensiones(bitmap.width, bitmap.height, maxLado)

    const canvas = document.createElement('canvas')
    canvas.width = ancho
    canvas.height = alto
    const ctx = canvas.getContext('2d')
    if (!ctx) { bitmap.close?.(); return await original() }
    ctx.drawImage(bitmap, 0, 0, ancho, alto)
    bitmap.close?.()

    const comprimido = canvas.toDataURL('image/jpeg', calidad)
    const originalDataUrl = await original()
    return comprimido.length < originalDataUrl.length ? comprimido : originalDataUrl
  } catch {
    return original()
  }
}

function leerComoDataUrl(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = ev => resolve(ev.target?.result as string)
    reader.onerror = reject
    reader.readAsDataURL(archivo)
  })
}
