import type { MetodoPago, Venta, VentaPago } from '@/types'

/**
 * Nombre a mostrar para un método de pago guardado en una venta.
 *
 * Existe porque `venta.metodo_pago` guarda el ID del método, no su nombre, y
 * ese ID puede dejar de existir: se puede borrar un método de pago desde
 * Configuración sin que nada avise que hay ventas históricas apuntando a él.
 * Sin este resguardo, esas ventas mostraban el ID crudo tal cual quedó
 * guardado (algo como "mpt7zej50ss1s") en cada pantalla que lo lee.
 *
 * Los métodos por defecto ("efectivo", "transfer") son palabras legibles y se
 * capitalizan; un ID generado al azar no lo es, así que se etiqueta como
 * eliminado en vez de exponerlo.
 */
export function nombreMetodoPago(id: string | undefined, metodos: MetodoPago[]): string {
  if (!id) return '—'
  const encontrado = metodos.find(m => m.id === id)
  if (encontrado) return encontrado.label
  // Un ID legible (palabra simple, sin dígitos) se capitaliza; uno generado al
  // azar (con dígitos mezclados, típico de los IDs internos) se etiqueta.
  if (/^[a-zA-Z]+$/.test(id)) return id.charAt(0).toUpperCase() + id.slice(1)
  return 'Método eliminado'
}

/** Devuelve siempre un desglose utilizable, también para ventas históricas. */
export function pagosDeVenta(venta: Pick<Venta, 'metodo_pago' | 'total_iva' | 'pagos'>): VentaPago[] {
  const pagos = (venta.pagos ?? [])
    .map(p => ({ metodo_pago: String(p.metodo_pago || ''), monto: Number(p.monto) || 0 }))
    .filter(p => p.metodo_pago && p.monto > 0)
  if (pagos.length) return pagos
  return venta.metodo_pago && venta.total_iva > 0
    ? [{ metodo_pago: venta.metodo_pago, monto: Number(venta.total_iva) || 0 }]
    : []
}

export function descripcionPagoVenta(
  venta: Pick<Venta, 'metodo_pago' | 'total_iva' | 'pagos'>,
  metodos: MetodoPago[],
  incluirMontos = false,
): string {
  const pagos = pagosDeVenta(venta)
  if (!pagos.length) return nombreMetodoPago(venta.metodo_pago, metodos)
  return pagos.map(p => {
    const nombre = nombreMetodoPago(p.metodo_pago, metodos)
    return incluirMontos ? `${nombre} $${Math.round(p.monto).toLocaleString('es-CL')}` : nombre
  }).join(' + ')
}
