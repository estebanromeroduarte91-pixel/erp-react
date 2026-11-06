/**
 * Cálculos del cierre de mes (Estadísticas → Cierres). Funciones puras: las
 * pantallas traen los datos del mes y acá se arman tres cosas que el
 * resultado por sucursal (fn_rentabilidad_sucursales) no responde:
 *
 * - Flujo de caja: cuánta plata entró y cuánta salió de verdad, incluidas
 *   las compras a proveedores, las cuotas de crédito y las inversiones.
 * - IVA estimado del mes, como borrador para el contador.
 * - La revisión previa: lo que, si queda pendiente, hace que los números del
 *   mes todavía puedan cambiar.
 */
import type { CajaSesion, Gasto, MetodoPago, NaturalezaGasto, OC, Venta } from '@/types'
import { calcularTotalesCaja } from '@/lib/caja'
import { folioConFactura } from '@/lib/facturaOC'

export { folioConFactura }
import { naturalezaEfectiva, type ConfigNaturaleza } from '@/lib/naturalezaGasto'
import { pagosDeVenta } from '@/lib/metodoPago'

export const TASA_IVA = 0.19

export interface VentaCierre {
  id: string
  estado: 'pagada' | 'anulada' | 'pendiente'
  tipo_doc?: 'boleta' | 'factura' | 'ticket' | null
  total: number        // neto
  total_iva: number    // con IVA
  metodo_pago: string
  pagos?: { metodo_pago: string; monto: number }[]
}

export interface DteCierre {
  estado: 'generado' | 'en_sobre' | 'enviado' | 'aceptado' | 'rechazado' | 'error'
  ambiente: 'certificacion' | 'produccion'
  creado_en: string
  venta_id?: string | null
  folio?: number | null
  tipo_dte?: number | null
  ultimo_error?: string | null
}

export interface PedidoOnlineCierre {
  id?: string
  numero?: string | null
  cliente_nombre?: string | null
  total: number
  estado_gestion: string
}

export interface StockNegativoCierre {
  producto_id: string
  nombre: string
  bodega_id: string
  cantidad: number
}

export interface OrdenEntregadaCierre {
  id: string
  num: string | number | null
  cliente?: string
  venta_id: string | null
  numero_boleta?: string | null
  presup?: number | string | null
}

/** Primer y último día del mes 'YYYY-MM' (fechas locales, sin hora). */
export function rangoMes(mes: string): { desde: string; hasta: string } {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(a, m, 0).getDate()
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, '0')}` }
}

export function mesAnterior(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function enRango(fecha: string | null | undefined, desde: string, hasta: string): boolean {
  const f = (fecha ?? '').slice(0, 10)
  return !!f && f >= desde && f <= hasta
}

// ── Compras a proveedores ──────────────────────────────────────────

export interface ComprasMes {
  /** Lo recibido en el mes, con IVA: lo que se le debe (o pagó) al proveedor. */
  total: number
  neto: number
  /** IVA de lo recibido con factura del proveedor: el que da crédito fiscal. */
  ivaConFactura: number
  ocs: number
  /** Recibidas en el mes con el folio vacío: falta anotar la factura (o "SIN FACTURA"). */
  sinFactura: { id: string; numero: string; proveedor: string; total: number }[]
  /** Líneas recibidas a precio cero: inventario que entró sin costo. */
  sinCosto: { id: string; numero: string; proveedor: string; lineas: number }[]
}

/**
 * Lo recibido en el mes, recepción por recepción: una OC parcial que llegó
 * en dos meses reparte su valor entre ambos. Las OC antiguas sin recepciones
 * registradas cuentan entera en su fecha de recepción.
 */
export function comprasDelMes(ocs: OC[], desde: string, hasta: string): ComprasMes {
  const r: ComprasMes = { total: 0, neto: 0, ivaConFactura: 0, ocs: 0, sinFactura: [], sinCosto: [] }
  for (const oc of ocs) {
    if (oc.estado === 'borrador' || oc.estado === 'cancelada') continue
    const porLinea = new Map(oc.items.map(i => [i.id, i]))
    let neto = 0
    let conIva = 0
    let lineasSinCosto = 0
    const recepciones = oc.recepciones ?? []
    if (recepciones.length) {
      for (const rec of recepciones) {
        if (!enRango(rec.fecha, desde, hasta)) continue
        for (const ri of rec.items) {
          const linea = porLinea.get(ri.prod_item_id)
          const pn = Number(linea?.precio_neto) || 0
          const pi = Number(linea?.precio_iva) || Math.round(pn * (1 + TASA_IVA))
          if (ri.cantidad > 0 && pn <= 0) lineasSinCosto++
          neto += ri.cantidad * pn
          conIva += ri.cantidad * pi
        }
      }
    } else if ((oc.estado === 'recibida' || oc.estado === 'confirmada') && enRango(oc.fecha_recepcion ?? oc.fecha_primera_recepcion, desde, hasta)) {
      for (const linea of oc.items) {
        const pn = Number(linea.precio_neto) || 0
        if (linea.cantidad > 0 && pn <= 0) lineasSinCosto++
        neto += linea.cantidad * pn
      }
      conIva = Number(oc.total) || Math.round(neto * (1 + TASA_IVA))
    } else {
      continue
    }
    if (neto === 0 && conIva === 0 && lineasSinCosto === 0) continue

    r.ocs++
    r.neto += neto
    r.total += conIva
    if (folioConFactura(oc.folio_factura)) r.ivaConFactura += conIva - neto
    // "SIN FACTURA" escrito es una decisión, no un olvido: no se pide revisar.
    else if (!oc.folio_factura?.trim()) r.sinFactura.push({ id: oc.id, numero: oc.numero, proveedor: oc.proveedor_nombre, total: conIva })
    if (lineasSinCosto) r.sinCosto.push({ id: oc.id, numero: oc.numero, proveedor: oc.proveedor_nombre, lineas: lineasSinCosto })
  }
  return r
}

// ── Gastos ──────────────────────────────────────────────────────────

export type GastosPorNaturaleza = Record<NaturalezaGasto, number>

export function gastosPorNaturaleza(gastos: Gasto[], config: ConfigNaturaleza | undefined): GastosPorNaturaleza {
  const r: GastosPorNaturaleza = { tienda: 0, corporativo: 0, financiero: 0, inversion: 0 }
  for (const g of gastos) r[naturalezaEfectiva(g, config)] += Number(g.monto) || 0
  return r
}

// ── Flujo de caja ───────────────────────────────────────────────────

export interface FlujoCaja {
  entradas: { porMetodo: { metodo: string; monto: number }[]; tiendaOnline: number; total: number }
  salidas: { operacion: number; compras: number; financiero: number; inversion: number; total: number }
  saldo: number
}

/**
 * Plata que entró y salió en el mes. Es caja, no resultado: las compras de
 * inventario, la cuota completa del crédito y la máquina comprada salen
 * enteras el mes en que se pagan (o, en las compras, se reciben: Pixit no
 * registra la fecha de pago al proveedor).
 */
export function flujoDeCaja(o: {
  ventas: VentaCierre[]
  pedidosOnline: PedidoOnlineCierre[]
  gastos: GastosPorNaturaleza
  compras: number
}): FlujoCaja {
  const porMetodo = new Map<string, number>()
  for (const v of o.ventas) {
    if (v.estado !== 'pagada') continue
    for (const p of pagosDeVenta(v)) porMetodo.set(p.metodo_pago, (porMetodo.get(p.metodo_pago) ?? 0) + p.monto)
  }
  const tiendaOnline = o.pedidosOnline
    .filter(p => p.estado_gestion !== 'cancelado')
    .reduce((s, p) => s + (Number(p.total) || 0), 0)
  const metodos = [...porMetodo.entries()].map(([metodo, monto]) => ({ metodo, monto })).sort((a, b) => b.monto - a.monto)
  const totalEntradas = metodos.reduce((s, m) => s + m.monto, 0) + tiendaOnline

  const operacion = o.gastos.tienda + o.gastos.corporativo
  const totalSalidas = operacion + o.compras + o.gastos.financiero + o.gastos.inversion
  return {
    entradas: { porMetodo: metodos, tiendaOnline, total: totalEntradas },
    salidas: { operacion, compras: o.compras, financiero: o.gastos.financiero, inversion: o.gastos.inversion, total: totalSalidas },
    saldo: totalEntradas - totalSalidas,
  }
}

// ── IVA ─────────────────────────────────────────────────────────────

export interface IvaMes {
  debito: number
  ventasConDocumento: number
  /** Ventas "Sin doc.": no generan débito en Pixit, pero el SII igual las grava. */
  ventasSinDocumento: { cantidad: number; total: number }
  credito: { gastos: number; compras: number; total: number }
  /** Positivo: a pagar. Negativo: remanente de crédito para el mes siguiente. */
  aPagar: number
}

export function ivaDelMes(o: { ventas: VentaCierre[]; gastos: Gasto[]; ivaCompras: number }): IvaMes {
  let debito = 0
  let ventasConDocumento = 0
  const sinDoc = { cantidad: 0, total: 0 }
  for (const v of o.ventas) {
    if (v.estado !== 'pagada') continue
    if (v.tipo_doc === 'ticket') {
      sinDoc.cantidad++
      sinDoc.total += Number(v.total_iva) || 0
      continue
    }
    ventasConDocumento++
    debito += (Number(v.total_iva) || 0) - (Number(v.total) || 0)
  }
  const ivaGastos = o.gastos
    .filter(g => g.con_credito_fiscal)
    .reduce((s, g) => s + (Number(g.iva) || 0), 0)
  const credito = { gastos: ivaGastos, compras: o.ivaCompras, total: ivaGastos + o.ivaCompras }
  return { debito, ventasConDocumento, ventasSinDocumento: sinDoc, credito, aPagar: debito - credito.total }
}

// ── Caja ────────────────────────────────────────────────────────────

export interface CajaMes {
  cerradas: number
  abiertas: { id: string; fecha: string; responsable: string; branchId: string; cajaId: string }[]
  faltantes: { cantidad: number; monto: number }
  sobrantes: { cantidad: number; monto: number }
  /** Cierres con diferencia, de la más grande a la más chica (en valor absoluto). */
  diferencias: { id: string; fecha: string; responsable: string; branchId: string; diferencia: number }[]
  anuladas: { cantidad: number; monto: number }
}

export function cajaDelMes(sesiones: CajaSesion[], ventas: VentaCierre[], desde: string, hasta: string): CajaMes {
  const r: CajaMes = { cerradas: 0, abiertas: [], faltantes: { cantidad: 0, monto: 0 }, sobrantes: { cantidad: 0, monto: 0 }, diferencias: [], anuladas: { cantidad: 0, monto: 0 } }
  for (const s of sesiones) {
    if (!enRango(s.fecha, desde, hasta)) continue
    const responsable = s.apertura?.responsable ?? ''
    if (s.estado === 'abierta' || !s.cierre) {
      r.abiertas.push({ id: s.id, fecha: s.fecha, responsable, branchId: s.branchId, cajaId: s.cajaId })
      continue
    }
    r.cerradas++
    const d = Number(s.cierre.diferencia) || 0
    if (d < 0) { r.faltantes.cantidad++; r.faltantes.monto += -d }
    if (d > 0) { r.sobrantes.cantidad++; r.sobrantes.monto += d }
    if (d !== 0) r.diferencias.push({ id: s.id, fecha: s.fecha, responsable, branchId: s.branchId, diferencia: d })
  }
  r.diferencias.sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
  for (const v of ventas) {
    if (v.estado !== 'anulada') continue
    r.anuladas.cantidad++
    r.anuladas.monto += Number(v.total_iva) || 0
  }
  return r
}

// ── Revisión antes de cerrar ────────────────────────────────────────

/** Un registro concreto que hay que corregir, con el enlace que lo abre. */
export interface ItemRevision {
  clave: string
  titulo: string
  detalle?: string
  enlace: string
  /** Se corrige desde Cierres mismo, sin ir a otra pantalla. */
  accion?: { tipo: 'cerrar_caja'; sesionId: string }
}

export interface PuntoRevision {
  id: string
  titulo: string
  /** 0 = todo bien. null = no se pudo revisar. */
  cantidad: number | null
  detalle: string
  /** Cómo se corrige, en una frase. */
  comoCorregir: string
  items: ItemRevision[]
}

/** Un DTE de producción que todavía no llegó al SII o que el SII no aceptó. */
export function dteConProblema(d: DteCierre): boolean {
  return d.ambiente === 'produccion' && d.estado !== 'aceptado' && d.estado !== 'enviado'
}

/** Entregada sin venta en Pixit y con presupuesto: trabajo que salió sin cobrarse acá. */
export function ordenSinCobrar(o: OrdenEntregadaCierre): boolean {
  return !o.venta_id && !o.numero_boleta?.toString().trim() && (Number(o.presup) || 0) > 0
}

const pesos = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CL')
const diaMes = (f: string) => f.slice(0, 10).split('-').reverse().slice(0, 2).join('/')
const TIPO_DTE: Record<number, string> = { 33: 'Factura', 34: 'Factura exenta', 39: 'Boleta', 41: 'Boleta exenta', 61: 'Nota de crédito', 56: 'Nota de débito' }
const ESTADO_DTE: Record<string, string> = { generado: 'sin enviar', en_sobre: 'esperando envío', rechazado: 'rechazada por el SII', error: 'con error' }

function punto(id: string, titulo: string, detalle: string, comoCorregir: string, items: ItemRevision[]): PuntoRevision {
  return { id, titulo, detalle, comoCorregir, items, cantidad: items.length }
}

export function revisionCierre(o: {
  caja: CajaMes
  dtes: DteCierre[]
  compras: ComprasMes
  gastos: Gasto[]
  /** null = no se pudo revisar. */
  stockNegativo: StockNegativoCierre[] | null
  ordenesEntregadas: OrdenEntregadaCierre[]
  pedidosOnline: PedidoOnlineCierre[]
  nombreBodega?: (id: string) => string
}): PuntoRevision[] {
  const bodega = o.nombreBodega ?? ((id: string) => id)
  const stock = punto('stock', 'Productos con stock negativo',
    'Se vendió más de lo que el sistema tenía: falta registrar una compra o hacer un conteo.',
    'Abre el producto y corrige el stock de esa sucursal, o registra la compra que falta.',
    (o.stockNegativo ?? []).map(sn => ({
      clave: `${sn.producto_id}|${sn.bodega_id}`,
      titulo: sn.nombre,
      detalle: `${bodega(sn.bodega_id)}: ${sn.cantidad} u.`,
      enlace: `/inventario?abrir=${encodeURIComponent(sn.producto_id)}`,
    })))
  if (o.stockNegativo == null) stock.cantidad = null

  return [
    punto('cajas', 'Cajas sin cerrar',
      'Mientras una caja siga abierta, sus ventas y su diferencia de efectivo no están confirmadas.',
      'El punto de venta solo muestra la caja del día, así que estas se cierran desde aquí. Como nadie contó el efectivo esos días, quedan sin diferencia y con una nota que lo dice.',
      o.caja.abiertas.map(a => ({
        clave: a.id,
        titulo: `Caja abierta el ${diaMes(a.fecha)}`,
        detalle: `${bodega(a.branchId)} · ${a.responsable || 'sin responsable'}`,
        enlace: `/ventas?tab=pos&caja=${encodeURIComponent(a.cajaId)}`,
        accion: { tipo: 'cerrar_caja' as const, sesionId: a.id },
      }))),
    punto('dte', 'Boletas y facturas pendientes o rechazadas por el SII',
      'Documentos del mes que no llegaron al SII o que el SII rechazó.',
      'Abre la venta para ver el error y volver a emitir el documento.',
      o.dtes.filter(dteConProblema).map((d, i) => ({
        clave: `${d.tipo_dte}-${d.folio ?? i}`,
        titulo: `${TIPO_DTE[d.tipo_dte ?? 0] ?? 'Documento'} ${d.folio ? `N° ${d.folio}` : ''} · ${ESTADO_DTE[d.estado] ?? d.estado}`.trim(),
        detalle: d.ultimo_error ?? undefined,
        enlace: d.venta_id ? `/ventas?abrir=${encodeURIComponent(d.venta_id)}` : '/ventas',
      }))),
    punto('oc_costo', 'Compras recibidas sin costo',
      'Productos que entraron a precio $0: el inventario y el margen del mes quedan mal valorizados.',
      'Edita la orden de compra y pon el precio neto de cada producto.',
      o.compras.sinCosto.map(c => ({
        clave: c.id,
        titulo: `${c.numero} · ${c.proveedor}`,
        detalle: `${c.lineas} ${c.lineas === 1 ? 'producto' : 'productos'} a $0`,
        enlace: `/compras?abrir=${encodeURIComponent(c.id)}`,
      }))),
    punto('oc_factura', 'Compras recibidas sin folio de factura',
      'El campo de folio quedó vacío: no se sabe si hubo factura, así que su IVA no se cuenta como crédito fiscal.',
      'Edita la orden de compra y escribe el folio de la factura, o "SIN FACTURA" si se compró sin ella.',
      o.compras.sinFactura.map(c => ({
        clave: c.id,
        titulo: `${c.numero} · ${c.proveedor}`,
        detalle: pesos(c.total),
        enlace: `/compras?abrir=${encodeURIComponent(c.id)}`,
      }))),
    punto('gastos', 'Gastos sin categoría o sin sucursal',
      'No se pueden asignar bien al resultado de cada tienda.',
      'Edita el gasto y elige su categoría y sucursal (o "General" si es de todas).',
      o.gastos.filter(g => !g.categoria?.trim() || !g.bodega_id).map(g => ({
        clave: g.id,
        titulo: `${diaMes(g.fecha)} · ${g.descripcion || 'Sin descripción'}`,
        detalle: `${pesos(Number(g.monto) || 0)} · falta ${!g.categoria?.trim() ? 'categoría' : 'sucursal'}`,
        enlace: `/contabilidad?abrir=${encodeURIComponent(g.id)}`,
      }))),
    stock,
    punto('ordenes', 'Órdenes entregadas sin venta',
      'Equipos entregados con presupuesto que no tienen una venta registrada en Pixit.',
      'Abre la orden y cóbrala, o si fue garantía, deja el presupuesto en $0.',
      o.ordenesEntregadas.filter(ordenSinCobrar).map(ord => ({
        clave: ord.id,
        titulo: `Orden N° ${ord.num ?? ''}${ord.cliente ? ` · ${ord.cliente}` : ''}`,
        detalle: `Presupuesto ${pesos(Number(ord.presup) || 0)}`,
        enlace: `/taller?abrir=${encodeURIComponent(String(ord.num ?? ''))}`,
      }))),
    punto('online', 'Pedidos de la tienda online sin gestionar',
      'Pedidos pagados del mes que siguen como "nuevo".',
      'Abre el pedido y cámbiale el estado (preparando, despachado o entregado).',
      o.pedidosOnline.filter(p => p.estado_gestion === 'nuevo').map((p, i) => ({
        clave: p.id ?? String(i),
        titulo: `Pedido ${p.numero ? `#${p.numero}` : ''}${p.cliente_nombre ? ` · ${p.cliente_nombre}` : ''}`.trim(),
        detalle: pesos(p.total),
        enlace: p.id ? `/ecommerce?abrir=${encodeURIComponent(p.id)}` : '/ecommerce',
      }))),
  ]
}

/**
 * Cierra una sesión de caja que quedó abierta un día anterior. El punto de
 * venta solo muestra la sesión de hoy, así que esa sesión no tenía cómo
 * cerrarse. Los totales salen de las ventas de esa caja ese día, igual que el
 * cierre normal; el efectivo contado se toma como el esperado (diferencia 0)
 * porque nadie lo contó, y la observación lo deja dicho.
 */
export function cerrarSesionSinConteo(sesion: CajaSesion, ventas: Venta[], metodos: MetodoPago[]): CajaSesion {
  const delDia = ventas.filter(v => v.fecha === sesion.fecha && v.cajaId === sesion.cajaId)
  const totales = calcularTotalesCaja(delDia, metodos)
  return {
    ...sesion,
    estado: 'cerrada',
    cierre: {
      hora: '—',
      conteoEfectivo: totales.efectivo + (sesion.apertura?.montoInicial ?? 0),
      diferencia: 0,
      observaciones: 'Cerrada desde Cierres de mes: la caja quedó abierta ese día y no se contó el efectivo.',
      totalVentas: totales._total,
      conteo: totales._count,
      desgloseMetodos: totales.desgloseMetodos,
    },
  }
}

// ── Foto del cierre ─────────────────────────────────────────────────

/** Lo que se guarda al cerrar el mes, para comparar si después algo cambió. */
export interface FotoCierre {
  ventasNetas: number
  resultado: number
  entro: number
  salio: number
  ivaAPagar: number
  pendientes: number
}

export function fotoCierre(o: { ventasNetas: number; resultado: number; flujo: FlujoCaja; iva: IvaMes; revision: PuntoRevision[] }): FotoCierre {
  return {
    ventasNetas: Math.round(o.ventasNetas),
    resultado: Math.round(o.resultado),
    entro: Math.round(o.flujo.entradas.total),
    salio: Math.round(o.flujo.salidas.total),
    ivaAPagar: Math.round(o.iva.aPagar),
    pendientes: o.revision.filter(p => p.cantidad == null || p.cantidad > 0).length,
  }
}

const ETIQUETAS_FOTO: Record<keyof Omit<FotoCierre, 'pendientes'>, string> = {
  ventasNetas: 'Ventas netas',
  resultado: 'Resultado de la operación',
  entro: 'Plata que entró',
  salio: 'Plata que salió',
  ivaAPagar: 'IVA estimado',
}

/** Qué cifras cambiaron desde el cierre (diferencias de menos de $1 no cuentan). */
export function cambiosDesdeCierre(antes: Partial<FotoCierre>, ahora: FotoCierre): { etiqueta: string; antes: number; ahora: number }[] {
  return (Object.keys(ETIQUETAS_FOTO) as (keyof typeof ETIQUETAS_FOTO)[])
    .filter(k => typeof antes[k] === 'number' && Math.abs((antes[k] as number) - ahora[k]) >= 1)
    .map(k => ({ etiqueta: ETIQUETAS_FOTO[k], antes: antes[k] as number, ahora: ahora[k] }))
}
