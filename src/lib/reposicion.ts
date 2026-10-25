/**
 * Respuesta de fn_reposicion_sugerida y cómo se convierte en acciones: una OC
 * en borrador por proveedor y un traslado por ruta. La función SQL decide qué
 * reponer; acá solo se agrupa lo que el usuario marcó. Nada se compra solo.
 */

export type EstadoReposicion =
  | 'stock_negativo' | 'agotado' | 'reponer' | 'en_camino'
  | 'bajo_pedido' | 'exceso' | 'sin_movimiento'

export interface FilaReposicion {
  bodega_id: string
  bodega_nombre: string
  producto_id: string
  nombre: string
  sku: string | null
  categoria: string | null
  estado: EstadoReposicion
  stock: number
  ya_viene: number
  ocs_pendientes: string[] | null
  vendidas_periodo: number
  ventas_distintas: number
  venta_diaria: number
  cobertura_dias: number | null
  punto_reorden: number
  objetivo: number
  stock_min_manual: number
  sugerido: number
  costo_unitario: number
  costo_registrado: boolean
  motivo_bajo_pedido: 'caro' | 'poca_rotacion' | null
  trasladar: number
  trasladar_desde: { id: string; nombre: string } | null
  comprar: number
  costo_compra_estimado: number
  proveedor: { id: string; nombre: string } | null
}

export interface ResumenReposicion {
  bodega_id: string
  nombre: string
  agotado: number
  reponer: number
  en_camino: number
  stock_negativo: number
  bajo_pedido: number
  exceso: number
  sin_movimiento: number
  unidades_a_comprar: number
  unidades_a_trasladar: number
  monto_compra_estimado: number
  monto_inmovilizado: number
}

export interface Reposicion {
  parametros: {
    hoy: string; dias_historia: number; dias_objetivo: number
    dias_reorden: number; min_ventas: number; costo_bajo_pedido: number
  }
  sucursales: { id: string; nombre: string }[]
  resumen: ResumenReposicion[]
  filas: FilaReposicion[]
}

/** Clave estable de una fila: un producto en una sucursal. */
export const claveFila = (f: Pick<FilaReposicion, 'producto_id' | 'bodega_id'>) => `${f.producto_id}@${f.bodega_id}`

export interface Secciones {
  /** Agotado o bajo el punto de reorden, con stock confiable: lo único que pide acción. */
  pedir: FilaReposicion[]
  /** Stock negativo: no se sabe cuánto hay; corregir antes de comprar. */
  corregir: FilaReposicion[]
  enCamino: FilaReposicion[]
  bajoPedido: FilaReposicion[]
  /** Sin venta en 90 días o con stock para más de 3 meses. */
  plataParada: FilaReposicion[]
}

export function secciones(filas: FilaReposicion[], bodegaId: string | null): Secciones {
  const visibles = bodegaId ? filas.filter(f => f.bodega_id === bodegaId) : filas
  return {
    pedir: visibles.filter(f => (f.estado === 'agotado' || f.estado === 'reponer') && +f.sugerido > 0),
    corregir: visibles.filter(f => f.estado === 'stock_negativo'),
    enCamino: visibles.filter(f => f.estado === 'en_camino'),
    bajoPedido: visibles.filter(f => f.estado === 'bajo_pedido'),
    plataParada: visibles.filter(f => f.estado === 'sin_movimiento' || f.estado === 'exceso'),
  }
}

export interface LineaCompra {
  producto_id: string
  producto_nombre: string
  cantidad: number
  costo_neto: number
  bodega_id: string
  bodega_nombre: string
}

export interface CompraPorProveedor {
  /** '' = sin proveedor conocido: la OC queda en borrador para elegirlo. */
  proveedor_id: string
  proveedor_nombre: string
  lineas: LineaCompra[]
  unidades: number
  total_neto: number
}

/** Una OC por proveedor con lo que hay que comprar de las filas elegidas. */
export function comprasPorProveedor(filas: FilaReposicion[]): CompraPorProveedor[] {
  const grupos = new Map<string, CompraPorProveedor>()
  for (const f of filas) {
    const cantidad = +f.comprar || 0
    if (cantidad <= 0) continue
    const id = f.proveedor?.id ?? ''
    const g = grupos.get(id) ?? {
      proveedor_id: id,
      proveedor_nombre: f.proveedor?.nombre?.trim() ?? '',
      lineas: [], unidades: 0, total_neto: 0,
    }
    const costo = +f.costo_unitario || 0
    g.lineas.push({
      producto_id: f.producto_id, producto_nombre: f.nombre, cantidad, costo_neto: costo,
      bodega_id: f.bodega_id, bodega_nombre: f.bodega_nombre,
    })
    g.unidades += cantidad
    g.total_neto += cantidad * costo
    grupos.set(id, g)
  }
  // Las de proveedor conocido primero; la "sin proveedor" al final.
  return [...grupos.values()].sort((a, b) =>
    (a.proveedor_id ? 0 : 1) - (b.proveedor_id ? 0 : 1) || a.proveedor_nombre.localeCompare(b.proveedor_nombre, 'es'))
}

export interface TrasladoSugerido {
  origen_id: string
  origen_nombre: string
  destino_id: string
  destino_nombre: string
  lineas: { producto_id: string; producto_nombre: string; cantidad: number }[]
  unidades: number
}

/** Un traslado por ruta (origen → destino) con lo que hay que mover. */
export function trasladosPorRuta(filas: FilaReposicion[]): TrasladoSugerido[] {
  const rutas = new Map<string, TrasladoSugerido>()
  for (const f of filas) {
    const cantidad = +f.trasladar || 0
    if (cantidad <= 0 || !f.trasladar_desde) continue
    const clave = `${f.trasladar_desde.id}>${f.bodega_id}`
    const r = rutas.get(clave) ?? {
      origen_id: f.trasladar_desde.id, origen_nombre: f.trasladar_desde.nombre,
      destino_id: f.bodega_id, destino_nombre: f.bodega_nombre,
      lineas: [], unidades: 0,
    }
    r.lineas.push({ producto_id: f.producto_id, producto_nombre: f.nombre, cantidad })
    r.unidades += cantidad
    rutas.set(clave, r)
  }
  return [...rutas.values()].sort((a, b) => b.unidades - a.unidades)
}
