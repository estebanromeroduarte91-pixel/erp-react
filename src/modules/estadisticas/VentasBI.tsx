import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useBodegas, useMetodosPago, useReporteSerie, useReporteSucursales,
  useVentasEnRango, useVentasPaginadas, useVentasResumen,
} from '@/lib/queries'
import { nombreMetodoPago } from '@/lib/metodoPago'
import { periodoAnteriorEquivalente } from '@/lib/metricas'
import { Spinner } from '@/components/shared/Spinner'
import type { Venta } from '@/types'

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

function fechaLocal(iso: string) {
  return new Date(`${iso}T12:00:00`)
}

function diasEntre(desde: string, hasta: string) {
  return Math.max(1, Math.round((fechaLocal(hasta).getTime() - fechaLocal(desde).getTime()) / 86_400_000) + 1)
}

function etiquetaFecha(iso: string) {
  return fechaLocal(iso).toLocaleDateString('es-CL', { day: 'numeric', month: 'short' }).replace('.', '')
}

function serieSemanal(ventas: Venta[], desde: string, hasta: string) {
  const inicio = fechaLocal(desde)
  const dias = diasEntre(desde, hasta)
  const cantidad = Math.ceil(dias / 7)
  const barras = Array.from({ length: cantidad }, (_, indice) => {
    const ini = new Date(inicio); ini.setDate(inicio.getDate() + indice * 7)
    const fin = new Date(ini); fin.setDate(Math.min(ini.getDate() + 6, inicio.getDate() + dias - 1))
    const finRango = fechaLocal(hasta)
    if (fin > finRango) fin.setTime(finRango.getTime())
    return { clave: `${indice}`, etiqueta: `${ini.getDate()}–${fin.getDate()} ${fin.toLocaleDateString('es-CL', { month: 'short' }).replace('.', '')}`, valor: 0 }
  })
  for (const venta of ventas) {
    if (venta.estado !== 'pagada') continue
    const indice = Math.min(cantidad - 1, Math.max(0, Math.floor((fechaLocal(venta.fecha).getTime() - inicio.getTime()) / 86_400_000 / 7)))
    barras[indice].valor += +venta.total || 0
  }
  return barras
}

export function VentasBI({ desde, hasta, branchId }: { desde: string; hasta: string; branchId: string | null }) {
  const navigate = useNavigate()
  const [mostrarTodas, setMostrarTodas] = useState(false)
  const anterior = useMemo(() => periodoAnteriorEquivalente('rango', desde, hasta), [desde, hasta])
  const rangoCorto = diasEntre(desde, hasta) <= 45
  const resumen = useVentasResumen(desde, hasta, branchId)
  const resumenAnterior = useVentasResumen(anterior.desde, anterior.hasta, branchId)
  const serieMensual = useReporteSerie({ desde, hasta, agrupacion: 'categoria', productoIds: [], branchId })
  const ventasCortas = useVentasEnRango(desde, hasta, rangoCorto)
  const sucursales = useReporteSucursales({ desde, hasta, branchId })
  const recientes = useVentasPaginadas({ page: 0, pageSize: 8, estado: 'pagada', desde, hasta, branchId })
  const { data: metodos = [] } = useMetodosPago()
  const { data: bodegas = [] } = useBodegas()

  const datos = useMemo(() => {
    const periodo = resumen.data?.periodo ?? { count: 0, total_iva: 0, total_neto: 0, utilidad: 0 }
    const previo = resumenAnterior.data?.periodo ?? { count: 0, total_iva: 0, total_neto: 0, utilidad: 0 }
    const ventasFiltradas = (ventasCortas.data ?? []).filter(v => !branchId || v.branchId === branchId || v.bodega_id === branchId)
    const barras = rangoCorto
      ? serieSemanal(ventasFiltradas, desde, hasta)
      : (serieMensual.data?.meses ?? []).map((mes, indice) => ({
          clave: mes,
          etiqueta: fechaLocal(mes).toLocaleDateString('es-CL', { month: 'short', year: '2-digit' }).replace('.', ''),
          valor: (serieMensual.data?.series ?? []).reduce((s, categoria) => s + (+categoria.neto[indice] || 0), 0),
        }))
    const nombres = new Map(bodegas.map(b => [b.id, b.nombre ?? b.name ?? 'Sucursal']))
    const porSucursal = (sucursales.data?.filas ?? []).map(s => ({
      id: s.branch_id ?? 'sin-sucursal',
      nombre: s.branch_id ? (nombres.get(s.branch_id) ?? 'Sucursal') : 'Sin sucursal',
      bruto: +s.total_iva || 0,
      neto: +s.total_neto || 0,
      transacciones: +s.transacciones || 0,
    }))
    const pagos = (resumen.data?.metodos ?? []).map(m => ({
      id: m.metodo,
      nombre: nombreMetodoPago(m.metodo, metodos),
      monto: +m.total || 0,
      cantidad: +m.count || 0,
    }))
    return { periodo, previo, barras, porSucursal, pagos }
  }, [resumen.data, resumenAnterior.data, ventasCortas.data, serieMensual.data, sucursales.data, bodegas, metodos, rangoCorto, desde, hasta, branchId])

  const cargando = resumen.isLoading || resumenAnterior.isLoading || serieMensual.isLoading || sucursales.isLoading || recientes.isLoading || (rangoCorto && ventasCortas.isLoading)
  if (cargando) return <div className="py-16"><Spinner /></div>

  const bruto = +datos.periodo.total_iva || 0
  const neto = +datos.periodo.total_neto || 0
  const transacciones = +datos.periodo.count || 0
  const ticket = transacciones ? bruto / transacciones : 0
  const ticketPrevio = datos.previo.count ? datos.previo.total_iva / datos.previo.count : 0
  const delta = (actual: number, previo: number) => previo ? (actual - previo) / Math.abs(previo) * 100 : null
  const maxBarra = Math.max(1, ...datos.barras.map(b => b.valor))
  const maxPago = Math.max(1, ...datos.pagos.map(p => p.monto))
  const totalSucursales = datos.porSucursal.reduce((s, b) => s + b.bruto, 0)
  const ventasVisibles = mostrarTodas ? (recientes.data?.ventas ?? []) : (recientes.data?.ventas ?? []).slice(0, 5)

  return (
    <div className="flex flex-col gap-3">
      <div><h2 className="text-lg font-extrabold text-gray-900 m-0">Ventas</h2><p className="text-xs text-gray-500 mt-1 mb-0">Cuánto vendiste, cuántas ventas realizaste, dónde vendiste y cómo te pagaron.</p></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Ventas brutas" valor={clp(bruto)} variacion={delta(bruto, datos.previo.total_iva)} />
        <Kpi label="Ventas netas" valor={clp(neto)} contexto="Sin IVA" />
        <Kpi label="Transacciones" valor={transacciones.toLocaleString('es-CL')} variacion={delta(transacciones, datos.previo.count)} />
        <Kpi label="Ticket promedio" valor={clp(ticket)} variacion={delta(ticket, ticketPrevio)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_.8fr] gap-3">
        <Panel titulo="Evolución de ventas" bajada={`Venta neta ${rangoCorto ? 'por semana' : 'por mes'}`}>
          {datos.barras.length === 0 ? <Vacio /> : <div className="h-52 flex items-end gap-2 pt-7 border-b border-gray-200" role="img" aria-label="Evolución de ventas netas del período">
            {datos.barras.map(b => <div key={b.clave} className="flex-1 h-full min-w-0 flex flex-col justify-end items-center gap-2">
              <span className="text-[10px] font-bold text-gray-600 whitespace-nowrap">{clp(b.valor)}</span>
              <div className="w-full max-w-14 bg-blue-600 rounded-t-md" style={{ height: `${Math.max(3, b.valor / maxBarra * 135)}px` }} />
              <span className="text-[10px] text-gray-400 whitespace-nowrap capitalize">{b.etiqueta}</span>
            </div>)}
          </div>}
        </Panel>

        <Panel titulo="Métodos de pago" bajada="Monto y participación sobre ventas brutas">
          {datos.pagos.length === 0 ? <Vacio /> : <div className="flex flex-col gap-4">{datos.pagos.map(p => {
            const participacion = bruto ? Math.round(p.monto / bruto * 100) : 0
            return <div key={p.id}>
              <div className="flex justify-between gap-3 mb-1.5 text-xs"><span className="font-semibold text-gray-700">{p.nombre} · {p.cantidad}</span><strong className="tabular-nums text-gray-900">{participacion}% · {clp(p.monto)}</strong></div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${p.monto / maxPago * 100}%` }} /></div>
            </div>
          })}</div>}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <Panel titulo="Ventas por sucursal" bajada="Comparación comercial del período">
          {datos.porSucursal.length === 0 ? <Vacio /> : <div className="overflow-x-auto"><table className="w-full text-xs border-collapse">
            <thead><tr className="border-b border-gray-200"><Th>Sucursal</Th><Th right>Venta bruta</Th><Th right>Transacciones</Th><Th right>Ticket prom.</Th><Th right>Participación</Th></tr></thead>
            <tbody>{datos.porSucursal.map(b => <tr key={b.id} className="border-b border-gray-50 last:border-0">
              <td className="py-2.5 font-semibold text-gray-800">{b.nombre}</td><Td>{clp(b.bruto)}</Td><Td>{b.transacciones.toLocaleString('es-CL')}</Td><Td>{clp(b.transacciones ? b.bruto / b.transacciones : 0)}</Td><Td>{totalSucursales ? Math.round(b.bruto / totalSucursales * 100) : 0}%</Td>
            </tr>)}</tbody>
          </table></div>}
        </Panel>

        <Panel titulo="Detalle de ventas" bajada="Últimas operaciones pagadas del período" accion={(recientes.data?.ventas.length ?? 0) > 5 ? <button type="button" onClick={() => setMostrarTodas(v => !v)} className="text-xs font-bold text-blue-600 bg-transparent border-0 cursor-pointer">{mostrarTodas ? 'Mostrar menos' : 'Ver todas'}</button> : undefined}>
          {ventasVisibles.length === 0 ? <Vacio /> : <div className="overflow-x-auto"><table className="w-full text-xs border-collapse">
            <thead><tr className="border-b border-gray-200"><Th>Venta / cliente</Th><Th right>Fecha</Th><Th right>Sucursal</Th><Th right>Pago</Th><Th right>Total</Th></tr></thead>
            <tbody>{ventasVisibles.map(v => <tr key={v.id} onClick={() => navigate(`/ventas?abrir=${encodeURIComponent(v.id)}`)} className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
              <td className="py-2.5 font-semibold text-gray-800 whitespace-nowrap">{v.numero} · {v.cliente || 'Sin cliente'}</td><Td>{etiquetaFecha(v.fecha)}</Td><Td>{v.branchNombre || bodegas.find(b => b.id === (v.branchId || v.bodega_id))?.nombre || 'Sin sucursal'}</Td><Td>{nombreMetodoPago(v.metodo_pago, metodos)}</Td><Td>{clp(v.total_iva)}</Td>
            </tr>)}</tbody>
          </table></div>}
        </Panel>
      </div>
    </div>
  )
}

function Kpi({ label, valor, contexto, variacion }: { label: string; valor: string; contexto?: string; variacion?: number | null }) {
  return <article className="min-w-0 p-4 rounded-xl border border-gray-200 bg-white"><span className="text-[10px] font-extrabold uppercase tracking-wide text-gray-400">{label}</span><strong className="block mt-2 text-xl font-extrabold text-gray-900 truncate tabular-nums">{valor}</strong><div className="mt-2 text-[11px] text-gray-400">{variacion == null ? (contexto ?? 'Período seleccionado') : <><span className={variacion >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{variacion >= 0 ? '↑' : '↓'} {Math.abs(variacion).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%</span> vs. período anterior</>}</div></article>
}

function Panel({ titulo, bajada, accion, children }: { titulo: string; bajada: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return <section className="min-w-0 p-4 rounded-xl border border-gray-200 bg-white"><div className="flex justify-between items-start gap-3 mb-3"><div><h3 className="text-sm font-extrabold text-gray-900 m-0">{titulo}</h3><p className="text-[11px] text-gray-400 mt-1 mb-0">{bajada}</p></div>{accion}</div>{children}</section>
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) { return <th className={`pb-2 text-[10px] uppercase tracking-wide text-gray-400 whitespace-nowrap ${right ? 'text-right' : 'text-left'}`}>{children}</th> }
function Td({ children }: { children: React.ReactNode }) { return <td className="py-2.5 pl-3 text-right text-gray-600 tabular-nums whitespace-nowrap">{children}</td> }
function Vacio() { return <p className="py-10 text-center text-sm text-gray-400 m-0">Sin datos para el período seleccionado.</p> }
