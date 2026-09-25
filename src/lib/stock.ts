// Cambios de stock expresados SIEMPRE como diferencia, nunca como valor absoluto.
//
// Escribir "el stock es 5" desde el navegador borra en silencio lo que haya
// pasado mientras la pantalla estaba abierta: si entremedio se vendió una
// unidad, ese descuento desaparece. Por eso todo ajuste se traduce a "suma o
// resta N" contra lo que hay en la base en ese momento, y se aplica con
// fn_fijar_stock_manual, que es atómica.

export type StockPorBodega = Record<string, number>

export interface AjusteDelta {
  producto_id: string
  bodega_id: string
  delta: number
}

/**
 * Traduce "dejar este producto en estas cantidades" a la lista de diferencias
 * contra `actual`. Solo devuelve las bodegas que realmente cambian.
 *
 * `deseado` debe traer únicamente las bodegas que el usuario tocó: una bodega
 * ausente se interpreta como "no la toques", no como "déjala en cero".
 */
export function deltasDeStock(
  productoId: string,
  deseado: StockPorBodega,
  actual: StockPorBodega,
): AjusteDelta[] {
  const ajustes: AjusteDelta[] = []
  for (const [bodega_id, cantidad] of Object.entries(deseado)) {
    const objetivo = Math.round(Number(cantidad) || 0)
    const delta = objetivo - (Math.round(Number(actual[bodega_id])) || 0)
    if (delta !== 0) ajustes.push({ producto_id: productoId, bodega_id, delta })
  }
  return ajustes
}

/** Agrupa las filas de `producto_stock` que devuelve la base por bodega. */
export function stockPorBodega(
  filas: { bodega_id: string; cantidad: number }[] | null | undefined,
): StockPorBodega {
  const mapa: StockPorBodega = {}
  for (const f of filas ?? []) mapa[f.bodega_id] = Number(f.cantidad) || 0
  return mapa
}
