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
import type { CajaSesion, Gasto, NaturalezaGasto, OC } from '@/types'
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
}

export interface PedidoOnlineCierre {
  total: number
  estado_gestion: string
}

export interface OrdenEntregadaCierre {
  id: string
  num: string | number | null
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
  /** Recibidas en el mes sin folio de factura: su IVA no se puede usar. */
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
    const conFactura = !!oc.folio_factura?.trim()
    if (conFactura) r.ivaConFactura += conIva - neto
    else r.sinFactura.push({ id: oc.id, numero: oc.numero, proveedor: oc.proveedor_nombre, total: conIva })
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
  abiertas: { id: string; fecha: string; responsable: string; branchId: string }[]
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
      r.abiertas.push({ id: s.id, fecha: s.fecha, responsable, branchId: s.branchId })
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

export interface PuntoRevision {
  id: string
  titulo: string
  /** 0 = todo bien. null = no se pudo revisar. */
  cantidad: number | null
  detalle: string
  /** Dónde se corrige. */
  enlace: string
}

/** Un DTE de producción que todavía no llegó al SII o que el SII no aceptó. */
export function dteConProblema(d: DteCierre): boolean {
  return d.ambiente === 'produccion' && d.estado !== 'aceptado' && d.estado !== 'enviado'
}

/** Entregada sin venta en Pixit y con presupuesto: trabajo que salió sin cobrarse acá. */
export function ordenSinCobrar(o: OrdenEntregadaCierre): boolean {
  return !o.venta_id && !o.numero_boleta?.toString().trim() && (Number(o.presup) || 0) > 0
}

export function revisionCierre(o: {
  caja: CajaMes
  dtes: DteCierre[]
  compras: ComprasMes
  gastos: Gasto[]
  stockNegativo: number | null
  ordenesEntregadas: OrdenEntregadaCierre[]
  pedidosOnline: PedidoOnlineCierre[]
}): PuntoRevision[] {
  const dtes = o.dtes.filter(dteConProblema)
  const gastosIncompletos = o.gastos.filter(g => !g.categoria?.trim() || !g.bodega_id)
  const sinCobrar = o.ordenesEntregadas.filter(ordenSinCobrar)
  const pedidosSinGestionar = o.pedidosOnline.filter(p => p.estado_gestion === 'nuevo')
  return [
    {
      id: 'cajas', titulo: 'Cajas sin cerrar', cantidad: o.caja.abiertas.length,
      detalle: 'Mientras una caja siga abierta, sus ventas y su diferencia de efectivo no están confirmadas.',
      enlace: '/ventas',
    },
    {
      id: 'dte', titulo: 'Boletas y facturas pendientes o rechazadas por el SII', cantidad: dtes.length,
      detalle: 'Documentos del mes que no llegaron al SII o que el SII rechazó.',
      enlace: '/ventas',
    },
    {
      id: 'oc_costo', titulo: 'Compras recibidas sin costo', cantidad: o.compras.sinCosto.length,
      detalle: 'Productos que entraron a precio $0: el inventario y el margen del mes quedan mal valorizados.',
      enlace: '/compras',
    },
    {
      id: 'oc_factura', titulo: 'Compras recibidas sin factura del proveedor', cantidad: o.compras.sinFactura.length,
      detalle: 'Sin folio de factura, su IVA no se cuenta como crédito fiscal.',
      enlace: '/compras',
    },
    {
      id: 'gastos', titulo: 'Gastos sin categoría o sin sucursal', cantidad: gastosIncompletos.length,
      detalle: 'No se pueden asignar bien al resultado de cada tienda.',
      enlace: '/contabilidad',
    },
    {
      id: 'stock', titulo: 'Productos con stock negativo', cantidad: o.stockNegativo,
      detalle: 'Se vendió más de lo que el sistema tenía: falta registrar una compra o hacer un conteo.',
      enlace: '/inventario',
    },
    {
      id: 'ordenes', titulo: 'Órdenes entregadas sin venta', cantidad: sinCobrar.length,
      detalle: 'Equipos entregados con presupuesto que no tienen una venta registrada en Pixit.',
      enlace: '/taller',
    },
    {
      id: 'online', titulo: 'Pedidos de la tienda online sin gestionar', cantidad: pedidosSinGestionar.length,
      detalle: 'Pedidos pagados del mes que siguen como "nuevo".',
      enlace: '/ecommerce',
    },
  ]
}
