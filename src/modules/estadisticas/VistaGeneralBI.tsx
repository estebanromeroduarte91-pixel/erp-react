import { useMemo } from 'react'
import { useVentasResumen, useBodegas, useReporteSerie, useReporteRentabilidad, useReporteSucursales, useRentabilidadSucursales } from '@/lib/queries'
import { cascada } from '@/lib/rentabilidad'
import { periodoAnteriorEquivalente } from '@/lib/metricas'
import { Spinner } from '@/components/shared/Spinner'

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

export function VistaGeneralBI({ desde, hasta, branchId }: {
  desde: string
  hasta: string
  branchId: string | null
}) {
  const anterior = useMemo(() => periodoAnteriorEquivalente('rango', desde, hasta), [desde, hasta])
  const ventas = useVentasResumen(desde, hasta, branchId)
  const ventasAnteriores = useVentasResumen(anterior.desde, anterior.hasta, branchId)
  // Resultado, gastos y corporativo salen de la función SQL, no de sumar gastos acá.
  const rentabilidadSucursales = useRentabilidadSucursales({ desde, hasta })
  const { data: bodegas = [] } = useBodegas()
  const serie = useReporteSerie({ desde, hasta, agrupacion: 'categoria', productoIds: [], branchId })
  const rentabilidad = useReporteRentabilidad({ desde, hasta, branchId, activo: true })
  const sucursales = useReporteSucursales({ desde, hasta, branchId })

  const data = useMemo(() => {
    const periodo = ventas.data?.periodo ?? { count: 0, total_iva: 0, total_neto: 0, utilidad: 0 }
    const periodoPrevio = ventasAnteriores.data?.periodo ?? { count: 0, total_iva: 0, total_neto: 0, utilidad: 0 }
    const actual = {
      ventasBrutas: +periodo.total_iva || 0,
      ventasNetas: +periodo.total_neto || 0,
      cantidadVentas: +periodo.count || 0,
    }
    const previo = {
      ventasBrutas: +periodoPrevio.total_iva || 0,
      ventasNetas: +periodoPrevio.total_neto || 0,
      cantidadVentas: +periodoPrevio.count || 0,
    }
    const resultado = cascada(rentabilidadSucursales.data, branchId)

    const nombresBodegas = new Map(bodegas.map(b => [b.id, b.nombre ?? b.name ?? 'Sin nombre']))
    const porSucursal = (sucursales.data?.filas ?? []).map(s => ({
      id: s.branch_id || 'sin-sucursal',
      nombre: s.branch_id ? (nombresBodegas.get(s.branch_id) ?? 'Sucursal') : 'Sin sucursal',
      neto: +s.total_neto || 0,
      cantidad: +s.transacciones || 0,
    })).filter(b => b.neto > 0).sort((a, b) => b.neto - a.neto)

    const topProductos = (rentabilidad.data?.filas ?? []).slice(0, 5).map(p => ({
      id: p.producto_id, nombre: p.nombre, unidades: +p.unidades || 0,
      neto: +p.neto || 0, costo: +p.costo || 0, margen: +p.margen || 0,
    }))

    const meses = (serie.data?.meses ?? []).map((mes, i) => [
      mes.slice(0, 7),
      (serie.data?.series ?? []).reduce((s, categoria) => s + (+categoria.neto[i] || 0), 0),
    ] as [string, number])

    return { actual, previo, resultado, porSucursal, topProductos, meses }
  }, [rentabilidadSucursales.data, ventas.data, ventasAnteriores.data, rentabilidad.data, serie.data, sucursales.data, branchId, bodegas])

  if (ventas.isLoading || ventasAnteriores.isLoading || rentabilidadSucursales.isLoading || serie.isLoading || rentabilidad.isLoading || sucursales.isLoading) return <div className="py-16"><Spinner /></div>

  const r = data.resultado
  const margenBruto = r.margenBruto
  const margenPct = r.ventasNetas ? margenBruto / r.ventasNetas * 100 : 0
  const delta = (actual: number, previo: number) => previo ? (actual - previo) / Math.abs(previo) * 100 : null
  const maxSucursal = Math.max(1, ...data.porSucursal.map(b => b.neto))

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi label="Ventas brutas" unidad="CLP" valor={clp(data.actual.ventasBrutas)} variacion={delta(data.actual.ventasBrutas, data.previo.ventasBrutas)} />
        <Kpi label="Ventas netas" unidad="sin IVA" valor={clp(data.actual.ventasNetas)} variacion={delta(data.actual.ventasNetas, data.previo.ventasNetas)} />
        <Kpi label="Margen bruto" unidad={`${margenPct.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`} valor={clp(margenBruto)} />
        <Kpi label="Resultado operacional" unidad={branchId ? 'con corporativo' : 'CLP'} valor={clp(r.resultado)} negativo={r.resultado < 0} />
        <Kpi label="Transacciones" unidad="ventas" valor={data.actual.cantidadVentas.toLocaleString('es-CL')} variacion={delta(data.actual.cantidadVentas, data.previo.cantidadVentas)} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[1.45fr_.8fr] gap-3">
        <Panel titulo="Ventas netas" bajada="Evolución mensual del período seleccionado">
          <Tendencia meses={data.meses} />
        </Panel>
        <Panel titulo="Puente de rentabilidad" bajada={branchId ? 'Incluye su parte de los gastos corporativos' : 'De la venta al resultado operacional'}>
          <Puente filas={[
            ['Ventas netas', r.ventasNetas, 'blue'],
            ['− Costo vendido', -r.costo, 'amber'],
            ['= Margen bruto', margenBruto, 'green'],
            ['− Gastos de tienda', -r.gastosTienda, 'red'],
            ['= Cuatro paredes', r.cuatroParedes, r.cuatroParedes >= 0 ? 'green' : 'red'],
            [branchId ? '− Corporativo asignado' : '− Corporativo', -r.corporativo, 'red'],
            ['Resultado', r.resultado, r.resultado >= 0 ? 'green' : 'red'],
          ]} />
          {r.fueraDeOperacion != null && r.fueraDeOperacion > 0 && (
            <p className="mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500 m-0">
              Fuera de la operación: <strong className="text-gray-700 tabular-nums">{clp(r.fueraDeOperacion)}</strong> en créditos, banco y equipos. No se restan al resultado.
            </p>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[.9fr_1.1fr] gap-3">
        <Panel titulo="Desempeño por sucursal" bajada="Ventas netas y participación">
          {data.porSucursal.length === 0 ? <Vacio /> : data.porSucursal.map(b => (
            <div key={b.id} className="grid grid-cols-[110px_1fr_auto] gap-3 items-center py-2.5 border-t border-gray-100 first:border-t-0 text-xs">
              <span className="font-semibold text-gray-700 truncate">{b.nombre}</span>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${b.neto / maxSucursal * 100}%` }} /></div>
              <strong className="tabular-nums text-gray-900">{clp(b.neto)}</strong>
            </div>
          ))}
        </Panel>
        <Panel titulo="Productos que explican el resultado" bajada="Cantidad, venta neta y margen bruto">
          <div className="overflow-x-auto"><table className="w-full text-xs border-collapse">
            <thead><tr className="border-b border-gray-200"><Th>Producto / servicio</Th><Th right>Unid.</Th><Th right>Venta neta</Th><Th right>Margen bruto</Th></tr></thead>
            <tbody>{data.topProductos.map(p => <tr key={p.id} className="border-b border-gray-50 last:border-0">
              <td className="py-2.5 font-semibold text-gray-800">{p.nombre}</td><Td>{p.unidades.toLocaleString('es-CL')}</Td><Td>{clp(p.neto)}</Td>
              <td className={`py-2.5 text-right font-bold tabular-nums ${p.margen >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{clp(p.margen)}</td>
            </tr>)}</tbody>
          </table></div>
        </Panel>
      </div>
    </div>
  )
}

function Kpi({ label, unidad, valor, variacion, negativo }: { label: string; unidad: string; valor: string; variacion?: number | null; negativo?: boolean }) {
  return <article className="min-w-0 p-4 rounded-xl border border-gray-200 bg-white">
    <div className="flex justify-between gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-400"><span>{label}</span><span>{unidad}</span></div>
    <strong className={`block mt-2 text-xl font-extrabold tracking-tight truncate ${negativo ? 'text-red-600' : 'text-gray-900'}`}>{valor}</strong>
    <div className="mt-2 text-[11px] text-gray-400">{variacion == null ? 'Período seleccionado' : <><span className={variacion >= 0 ? 'text-emerald-600 font-bold' : 'text-red-600 font-bold'}>{variacion >= 0 ? '↑' : '↓'} {Math.abs(variacion).toLocaleString('es-CL', { maximumFractionDigits: 1 })}%</span> vs. período anterior</>}</div>
  </article>
}

function Panel({ titulo, bajada, children }: { titulo: string; bajada: string; children: React.ReactNode }) {
  return <section className="min-w-0 p-4 rounded-xl border border-gray-200 bg-white">
    <div className="mb-3"><h3 className="text-sm font-extrabold text-gray-900 m-0">{titulo}</h3><p className="text-[11px] text-gray-400 mt-1 mb-0">{bajada}</p></div>{children}
  </section>
}

function Tendencia({ meses }: { meses: [string, number][] }) {
  if (!meses.length) return <Vacio />
  const max = Math.max(1, ...meses.map(([, v]) => v))
  return <div className="h-48 flex items-end gap-3 pt-5" role="img" aria-label="Ventas netas por mes">
    {meses.map(([mes, valor]) => <div key={mes} className="flex-1 h-full flex flex-col justify-end items-center gap-2 min-w-0">
      <span className="text-[10px] font-bold text-gray-600 tabular-nums">{clp(valor)}</span>
      <div className="w-full max-w-16 bg-blue-600 rounded-t-md" style={{ height: `${Math.max(3, valor / max * 135)}px` }} />
      <span className="text-[10px] text-gray-400 capitalize">{new Date(`${mes}-02T12:00:00`).toLocaleDateString('es-CL', { month: 'short' })}</span>
    </div>)}
  </div>
}

function Puente({ filas }: { filas: [string, number, string][] }) {
  const max = Math.max(1, ...filas.map(([, v]) => Math.abs(v)))
  const color: Record<string, string> = { blue: 'bg-blue-600', amber: 'bg-amber-400', green: 'bg-emerald-500', red: 'bg-red-500' }
  return <div className="flex flex-col gap-3">{filas.map(([nombre, valor, tono]) => <div key={nombre} className="grid grid-cols-[115px_1fr_auto] gap-3 items-center text-xs">
    <span className="text-gray-600">{nombre}</span><div className="h-3 rounded bg-gray-100 overflow-hidden"><div className={`h-full rounded ${color[tono]}`} style={{ width: `${Math.max(2, Math.abs(valor) / max * 100)}%` }} /></div>
    <strong className="text-gray-900 tabular-nums">{clp(valor)}</strong>
  </div>)}</div>
}

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) { return <th className={`pb-2 text-[10px] uppercase tracking-wide text-gray-400 ${right ? 'text-right' : 'text-left'}`}>{children}</th> }
function Td({ children }: { children: React.ReactNode }) { return <td className="py-2.5 text-right text-gray-600 tabular-nums">{children}</td> }
function Vacio() { return <p className="py-12 text-center text-sm text-gray-400 m-0">Sin datos para el período seleccionado.</p> }
