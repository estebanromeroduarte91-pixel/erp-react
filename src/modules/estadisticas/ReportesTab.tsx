import { useMemo, useState } from 'react'
import { useBodegas, useReporteRentabilidad, useReporteSerie } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import { coincideBusqueda, rangoPeriodo, type Periodo } from '@/lib/reportes'
import { ResumenTab } from './ResumenTab'
import { VentasBI } from './VentasBI'
import { VistaGeneralBI } from './VistaGeneralBI'

type Agrupacion = 'producto' | 'categoria'
type SeccionReporte = 'general' | 'ventas' | 'rentabilidad' | 'gastos' | 'compras' | 'operacion'

const PERIODO_LABEL: Record<Periodo, string> = {
  mes: 'Este mes',
  '6m': 'Últimos 6 meses', '12m': 'Últimos 12 meses', '24m': 'Últimos 24 meses',
  'año': 'Este año', 'anterior': 'Año anterior', 'todo': 'Todo el histórico', 'rango': 'Rango de fechas',
}

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const uds = (n: number) => Math.round(n).toLocaleString('es-CL')

export function ReportesTab() {
  const { esAdmin, branchId: userBranchId } = useAuth()
  const { data: bodegas } = useBodegas()
  const rangoMesActual = useMemo(() => rangoPeriodo('mes'), [])
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [desdePersonalizado, setDesdePersonalizado] = useState(rangoMesActual.desde)
  const [hastaPersonalizado, setHastaPersonalizado] = useState(rangoMesActual.hasta)
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('producto')
  const [sucursal, setSucursal] = useState('')
  const [seccion, setSeccion] = useState<SeccionReporte>('general')

  const { desde, hasta } = useMemo(() => {
    if (periodo !== 'rango') return rangoPeriodo(periodo)
    return desdePersonalizado <= hastaPersonalizado
      ? { desde: desdePersonalizado, hasta: hastaPersonalizado }
      : { desde: hastaPersonalizado, hasta: desdePersonalizado }
  }, [periodo, desdePersonalizado, hastaPersonalizado])

  const branchPropio = esAdmin || !userBranchId ? null : userBranchId
  const branchId = branchPropio ?? (sucursal || null)
  const serieCategorias = useReporteSerie({ desde, hasta, agrupacion: 'categoria', productoIds: [], branchId })
  const rentabilidad = useReporteRentabilidad({ desde, hasta, branchId, activo: seccion === 'rentabilidad' })

  const totalesRentabilidad = useMemo(() => (rentabilidad.data?.filas ?? []).reduce((acc, f) => ({
    unidades: acc.unidades + (+f.unidades || 0),
    neto: acc.neto + (+f.neto || 0),
    margen: acc.margen + (+f.margen || 0),
  }), { unidades: 0, neto: 0, margen: 0 }), [rentabilidad.data])

  const filasRentabilidad = useMemo(() => {
    if (agrupacion === 'categoria') {
      return (serieCategorias.data?.series ?? []).map(s => {
        const unidades = s.unidades.reduce((a, b) => a + (+b || 0), 0)
        const neto = s.neto.reduce((a, b) => a + (+b || 0), 0)
        const margen = s.margen.reduce((a, b) => a + (+b || 0), 0)
        return { id: s.clave, nombre: s.nombre, unidades, neto, costo: neto - margen, margen }
      })
    }
    return (rentabilidad.data?.filas ?? []).map(f => ({
      id: f.producto_id, nombre: f.nombre, unidades: +f.unidades || 0,
      neto: +f.neto || 0, costo: +f.costo || 0, margen: +f.margen || 0,
    }))
  }, [agrupacion, serieCategorias.data, rentabilidad.data])

  const secciones: { id: SeccionReporte; label: string }[] = [
    { id: 'general', label: 'Vista general' }, { id: 'ventas', label: 'Ventas' },
    { id: 'rentabilidad', label: 'Rentabilidad' }, { id: 'gastos', label: 'Gastos' },
    { id: 'compras', label: 'Compras' }, { id: 'operacion', label: 'Operación' },
  ]

  const camposRango = periodo === 'rango' && <>
    <Campo label="Desde"><input type="date" value={desdePersonalizado} max={hastaPersonalizado} onChange={e => setDesdePersonalizado(e.target.value)} className={SELECT} /></Campo>
    <Campo label="Hasta"><input type="date" value={hastaPersonalizado} min={desdePersonalizado} onChange={e => setHastaPersonalizado(e.target.value)} className={SELECT} /></Campo>
  </>

  const cabecera = <div className="flex flex-wrap items-end justify-between gap-3">
    <div><h2 className="text-xl font-extrabold text-gray-900 m-0">Reportes BI</h2><p className="text-xs text-gray-400 mt-1 mb-0">Análisis ejecutivo y detalle de la operación.</p></div>
    <div className="flex flex-wrap gap-2.5 items-end">
      <Campo label="Período"><select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} className={SELECT}>{(Object.keys(PERIODO_LABEL) as Periodo[]).map(p => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}</select></Campo>
      {camposRango}
      {!branchPropio && (bodegas ?? []).length > 1 && <Campo label="Sucursal"><select value={sucursal} onChange={e => setSucursal(e.target.value)} className={SELECT}><option value="">Todas</option>{(bodegas ?? []).map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}</select></Campo>}
    </div>
  </div>

  if (seccion === 'general') return <div className="flex flex-col gap-4 pb-8">{cabecera}<NavegacionBI seccion={seccion} secciones={secciones} onChange={setSeccion} /><VistaGeneralBI desde={desde} hasta={hasta} branchId={branchId} /></div>
  if (seccion === 'gastos' || seccion === 'compras' || seccion === 'operacion') return <div className="flex flex-col gap-4 pb-8">{cabecera}<NavegacionBI seccion={seccion} secciones={secciones} onChange={setSeccion} /><ResumenTab seccion={seccion} mostrarEncabezado={false} mostrarFiltros={false} rangoExterno={{ from: desde, to: hasta }} branchId={branchId} /></div>

  return <div className="flex flex-col gap-4 pb-8">
    {cabecera}
    <NavegacionBI seccion={seccion} secciones={secciones} onChange={setSeccion} />
    {seccion === 'ventas' ? <VentasBI desde={desde} hasta={hasta} branchId={branchId} /> : <>
      <div><h2 className="text-lg font-extrabold text-gray-900 m-0">Rentabilidad de productos</h2><p className="text-xs text-gray-500 mt-1 mb-0">Unidades, venta neta y margen bruto generado. El margen no descuenta gastos operacionales.</p></div>
      <Campo label="Agrupar por"><Seg valor={agrupacion} onChange={setAgrupacion} opciones={[['producto', 'Producto'], ['categoria', 'Categoría']]} /></Campo>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3"><Tile label="Unidades vendidas" valor={uds(totalesRentabilidad.unidades)} /><Tile label="Venta neta" valor={clp(totalesRentabilidad.neto)} /><Tile label="Margen bruto" valor={clp(totalesRentabilidad.margen)} /><Tile label="Margen %" valor={`${totalesRentabilidad.neto ? Math.round(totalesRentabilidad.margen / totalesRentabilidad.neto * 100) : 0}%`} /></div>
      {rentabilidad.isLoading || (agrupacion === 'categoria' && serieCategorias.isLoading) ? <div className="py-12"><Spinner /></div> : <TablaRentabilidad key={agrupacion} filas={filasRentabilidad} agrupacion={agrupacion} />}
    </>}
  </div>
}

function NavegacionBI({ seccion, secciones, onChange }: { seccion: SeccionReporte; secciones: { id: SeccionReporte; label: string }[]; onChange: (id: SeccionReporte) => void }) {
  return <div className="flex gap-1 overflow-x-auto border-b border-gray-200">{secciones.map(item => <button key={item.id} type="button" onClick={() => onChange(item.id)} aria-pressed={seccion === item.id} className={`shrink-0 px-3.5 py-2.5 border-b-2 text-xs font-bold transition ${seccion === item.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>{item.label}</button>)}</div>
}

function TablaRentabilidad({ filas, agrupacion }: { filas: { id: string; nombre: string; unidades: number; neto: number; costo: number; margen: number }[]; agrupacion: Agrupacion }) {
  const [busqueda, setBusqueda] = useState('')
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const ordenadas = [...filas].sort((a, b) => b.margen - a.margen)
  const margenTotal = ordenadas.reduce((s, f) => s + f.margen, 0)
  const termino = busqueda.trim()
  const filtradas = termino ? ordenadas.filter(f => coincideBusqueda(f.nombre, termino)) : ordenadas
  const visibles = mostrarTodos || termino ? filtradas : filtradas.slice(0, 8)
  return <div className="bg-white rounded-xl border border-gray-200 p-4">
    <div className="flex flex-wrap items-start justify-between gap-3 mb-3"><div><h3 className="text-sm font-extrabold text-gray-900 m-0">Rentabilidad por {agrupacion === 'producto' ? 'producto' : 'categoría'}</h3><p className="text-[11px] text-gray-400 mt-1 mb-0">{agrupacion === 'producto' ? 'Cuántos salieron y cuánto margen bruto dejaron.' : 'Venta, costo y margen bruto consolidado por categoría.'}</p></div><div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto"><input type="search" value={busqueda} onChange={e => { setBusqueda(e.target.value); setMostrarTodos(false) }} placeholder={`Buscar ${agrupacion === 'producto' ? 'producto' : 'categoría'}…`} aria-label={`Buscar por ${agrupacion === 'producto' ? 'producto' : 'categoría'}`} className="w-full sm:w-64 text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-500" /><span className={`text-sm font-extrabold tabular-nums text-right ${margenTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{clp(margenTotal)}</span></div></div>
    <div className="overflow-x-auto"><table className="w-full text-[13px] border-collapse"><thead><tr className="border-b border-gray-200"><th className={TH_L}>{agrupacion === 'producto' ? 'Producto' : 'Categoría'}</th><th className={TH_R}>Unid.</th><th className={TH_R}>Venta neta</th><th className={TH_R}>Costo vendido</th><th className={TH_R}>Margen bruto</th><th className={TH_R}>Margen %</th></tr></thead><tbody>{visibles.map(f => { const pct = f.neto ? Math.round(f.margen / f.neto * 100) : 0; return <tr key={f.id} className="border-b border-gray-50 last:border-0"><td className="py-2.5 px-2 font-semibold text-gray-900">{f.nombre}</td><td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{uds(f.unidades)}</td><td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{clp(f.neto)}</td><td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{clp(f.costo)}</td><td className={`py-2.5 px-2 text-right tabular-nums font-bold ${f.margen >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{clp(f.margen)}</td><td className={`py-2.5 px-2 text-right tabular-nums font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pct}%</td></tr> })}</tbody></table></div>
    {filtradas.length === 0 && <p className="text-sm text-gray-400 py-8 text-center m-0">No hay resultados para “{busqueda.trim()}”.</p>}
    {!termino && filtradas.length > 8 && <button type="button" onClick={() => setMostrarTodos(v => !v)} className="mt-3 w-full px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-blue-600 hover:bg-blue-50 transition">{mostrarTodos ? 'Mostrar sólo los primeros 8' : `Ver todos (${filtradas.length})`}</button>}
  </div>
}

const SELECT = 'text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 cursor-pointer focus:outline-none focus:border-blue-400'
const LBL = 'text-[10px] font-extrabold tracking-wide uppercase text-gray-400 mb-2'
const TH_L = 'text-left text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2'
const TH_R = 'text-right text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2 whitespace-nowrap'

function Campo({ label, children }: { label: string; children: React.ReactNode }) { return <div className="flex flex-col items-start gap-1.5"><span className="text-[10px] font-extrabold tracking-wide uppercase text-gray-400">{label}</span>{children}</div> }
function Seg<T extends string>({ valor, onChange, opciones }: { valor: T; onChange: (v: T) => void; opciones: [T, string][] }) { return <div className="inline-flex bg-white border border-gray-200 rounded-lg overflow-hidden">{opciones.map(([v, l]) => <button key={v} onClick={() => onChange(v)} aria-pressed={valor === v} className={`text-xs font-semibold px-3 py-1.5 transition ${valor === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>{l}</button>)}</div> }
function Tile({ label, valor }: { label: string; valor: string }) { return <div className="bg-white rounded-xl border border-gray-200 p-4"><p className={LBL} style={{ marginBottom: 0 }}>{label}</p><p className="text-2xl font-extrabold text-gray-900 mt-1 tabular-nums">{valor}</p></div> }
