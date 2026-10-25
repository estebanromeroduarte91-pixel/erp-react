/**
 * Respuesta de fn_reposicion_sugerida y cómo se convierte en acciones: una OC
 * en borrador por proveedor y un traslado por ruta. La función SQL decide qué
 * reponer; acá solo se agrupa lo que el usuario marcó. Nada se compra solo.
 */

export type EstadoReposicion =
  | 'stock_negativo' | 'agotado' | 'reponer' | 'en_camino'
  | 'bajo_pedido' | 'exceso' | 'sin_movimiento'
  /** Vendido en el período y con stock suficiente: aparece al ver "todo lo vendido". */
  | 'ok'

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
  /** La regla lo mantiene en stock. El motivo no se expone (decisión del dueño). */
  se_repone?: boolean
  /** Stock del producto en las otras sucursales (solo las que tienen). */
  stock_otras?: { id: string; nombre: string; stock: number }[]
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
    hoy: string; dias_historia: number; dias_objetivo: number; dias_reorden: number
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

/**
 * Necesita acción: hay que comprarla, se puede traer de otra tienda que la
 * tiene de sobra, o su stock es negativo y se sigue vendiendo.
 */
export function hayQueReponer(f: FilaReposicion): boolean {
  // Un negativo bajo pedido (pieza cara de una sola reparación) no es para
  // reponer sino para contar: queda solo en "Corregir stock".
  return +f.sugerido > 0 || +f.trasladar > 0
    || (f.estado === 'stock_negativo' && +f.vendidas_periodo > 0 && f.se_repone !== false)
}

/** Cuánto comprar por defecto: lo sugerido menos lo que se puede trasladar. */
export function cantidadInicial(f: FilaReposicion): number {
  if (f.se_repone === false) return 0
  return Math.max(0, +f.comprar || 0)
}

/** Qué muestra la tabla: todo lo vendido, solo lo que hay que pedir, o lo que no tiene stock. */
export type ModoTabla = 'todo' | 'pedir' | 'sin_stock'

function enModo(f: FilaReposicion, modo: ModoTabla): boolean {
  const relevante = +f.vendidas_periodo > 0 || hayQueReponer(f)
  if (!relevante) return false
  if (modo === 'pedir') return hayQueReponer(f)
  if (modo === 'sin_stock') return f.stock <= 0
  return true
}

/** Cuántas filas tiene cada modo en la tienda elegida (para los botones). */
export function contarModos(filas: FilaReposicion[], bodegaId: string | null): Record<ModoTabla, number> {
  const visibles = filas.filter(f => !bodegaId || f.bodega_id === bodegaId)
  return {
    todo: visibles.filter(f => enModo(f, 'todo')).length,
    pedir: visibles.filter(f => enModo(f, 'pedir')).length,
    sin_stock: visibles.filter(f => enModo(f, 'sin_stock')).length,
  }
}

/**
 * Filas de la tabla, de lo más urgente a lo menos: sin stock primero (el más
 * negativo antes), después lo que alcanza para menos días; a igualdad, lo que
 * más se vende.
 */
export function filasTabla(filas: FilaReposicion[], o: {
  bodegaId: string | null; modo: ModoTabla; busqueda: string
}): FilaReposicion[] {
  const q = o.busqueda.trim().toLocaleLowerCase('es')
  // Sin stock va antes que cualquier cobertura; y entre esos, el más negativo primero.
  const urgencia = (f: FilaReposicion) =>
    f.stock <= 0 ? +f.stock - 1 : f.cobertura_dias == null ? Number.MAX_SAFE_INTEGER : +f.cobertura_dias
  return filas
    .filter(f => !o.bodegaId || f.bodega_id === o.bodegaId)
    .filter(f => enModo(f, o.modo))
    .filter(f => !q || f.nombre.toLocaleLowerCase('es').includes(q) || (f.categoria ?? '').toLocaleLowerCase('es').includes(q))
    .sort((a, b) => urgencia(a) - urgencia(b) || +b.vendidas_periodo - +a.vendidas_periodo || a.nombre.localeCompare(b.nombre, 'es'))
}

export const SIN_CATEGORIA = 'Sin categoría'

export interface GrupoCategoria {
  categoria: string
  filas: FilaReposicion[]
  /** Productos del grupo que hay que pedir o traer. */
  porPedir: number
}

/**
 * Agrupa por categoría conservando el orden de urgencia dentro de cada grupo.
 * Primero las categorías con más por pedir; a igualdad, por nombre.
 */
export function agruparPorCategoria(filas: FilaReposicion[]): GrupoCategoria[] {
  const grupos = new Map<string, GrupoCategoria>()
  for (const f of filas) {
    const cat = f.categoria?.trim() || SIN_CATEGORIA
    const g = grupos.get(cat) ?? { categoria: cat, filas: [], porPedir: 0 }
    g.filas.push(f)
    if (hayQueReponer(f)) g.porPedir += 1
    grupos.set(cat, g)
  }
  return [...grupos.values()].sort((a, b) =>
    b.porPedir - a.porPedir
    || (a.categoria === SIN_CATEGORIA ? 1 : 0) - (b.categoria === SIN_CATEGORIA ? 1 : 0)
    || a.categoria.localeCompare(b.categoria, 'es'))
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

export interface LineaElegida {
  fila: FilaReposicion
  cantidad: number
  /** Proveedor elegido en el momento; por defecto el de la última compra. */
  proveedor?: { id: string; nombre: string } | null
}

/** Una OC por proveedor elegido; cada línea conserva su tienda como destino. */
export function comprasPorProveedor(lineas: LineaElegida[]): CompraPorProveedor[] {
  const grupos = new Map<string, CompraPorProveedor>()
  for (const { fila: f, cantidad: c, proveedor } of lineas) {
    const cantidad = Math.floor(+c || 0)
    if (cantidad <= 0) continue
    const prov = proveedor === undefined ? f.proveedor : proveedor
    const id = prov?.id ?? ''
    const g = grupos.get(id) ?? {
      proveedor_id: id,
      proveedor_nombre: prov?.nombre?.trim() ?? '',
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
