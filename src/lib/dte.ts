// Utilidades de documentos tributarios en el navegador.

/** Códigos del SII para cada tipo de documento. */
export const TIPO_DTE = { boleta: 39, factura: 33, nota_credito: 61 } as const

/**
 * Abre un PDF recibido en base64.
 *
 * Se usa un blob y no un `data:` URI porque Chrome bloquea la navegación a
 * `data:` en la barra de direcciones, y una boleta de varios kilobytes en una
 * URL además es incómoda de manejar.
 */
export function abrirPdfBase64(base64: string, imprimir = false): void {
  const binario = atob(base64)
  const bytes = new Uint8Array(binario.length)
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i)
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))

  const ventana = window.open(url, '_blank')
  if (imprimir && ventana) {
    // El diálogo de impresión se dispara cuando el visor terminó de cargar.
    ventana.addEventListener('load', () => ventana.print(), { once: true })
  }
  // Se libera después, no de inmediato: revocar la URL antes de que la pestaña
  // la cargue deja la ventana en blanco.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * Reparte el precio de una línea del POS en el formato que espera el SII.
 *
 * En Pixit el descuento se guarda como porcentaje y el precio incluye IVA; el
 * SII quiere el precio unitario SIN descontar y el descuento como monto.
 *
 * El descuento se calcula como la diferencia contra el total real de la línea y
 * no volviendo a aplicar el porcentaje. Son dos cosas distintas: recalcular el
 * porcentaje sobre un precio que ya venía descontado lo aplicaría dos veces, y
 * además el redondeo propio podría dejar la boleta descuadrada respecto de lo
 * que el cliente pagó — que es peor que feo, es un documento tributario que no
 * coincide con la venta.
 */
export function lineaParaDte(precioIva: number, cantidad: number, totalLinea: number) {
  return {
    precio: precioIva,
    cantidad,
    descuento: Math.max(0, Math.round(precioIva * cantidad - totalLinea)),
  }
}
