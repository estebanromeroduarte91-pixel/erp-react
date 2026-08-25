import { useState, useMemo, useRef, useCallback } from 'react'
import {
  useReporteSerie, useReporteMatriz, useBuscarProductosReporte,
  useReporteRentabilidad, useCategorias, useBodegas,
} from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import { escalaGrafico, rangoPeriodo, etiquetaMes, type Periodo } from '@/lib/reportes'
import { ResumenTab } from './ResumenTab'
import { VistaGeneralBI } from './VistaGeneralBI'

// Paleta categórica validada con el script de dataviz del proyecto: pasa el
// chequeo de daltonismo en claro y oscuro (peor par adyacente ΔE 9.1 protan).
// El orden importa — es el mecanismo de seguridad, no decoración.
const SLOTS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300']
const MAX_SERIES = SLOTS.length
const GRIS = '#c7c7cc'

type Metrica = 'unidades' | 'neto' | 'margen'
type Agrupacion = 'producto' | 'categoria'
type SeccionReporte = 'general' | 'ventas' | 'rentabilidad' | 'gastos' | 'compras' | 'operacion'

const MET_LABEL: Record<Metrica, string> = {
  unidades: 'Unidades vendidas', neto: 'Venta neta', margen: 'Margen',
}
const PERIODO_LABEL: Record<Periodo, string> = {
  '6m': 'Últimos 6 meses', '12m': 'Últimos 12 meses', '24m': 'Últimos 24 meses',
  'año': 'Este año', 'anterior': 'Año anterior', 'todo': 'Todo el histórico',
}

const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const uds = (n: number) => Math.round(n).toLocaleString('es-CL')

export function ReportesTab() {
  const { esAdmin, branchId: userBranchId } = useAuth()
  const { data: categorias } = useCategorias()
  const { data: bodegas } = useBodegas()

  const [periodo, setPeriodo] = useState<Periodo>('12m')
  const [metrica, setMetrica] = useState<Metrica>('unidades')
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('producto')
  const [vista, setVista] = useState<'grafico' | 'tabla'>('grafico')
  const [sucursal, setSucursal] = useState('')
  const [seleccion, setSeleccion] = useState<string[]>([])
  const [nombres, setNombres] = useState<Record<string, string>>({})
  const [pickerAbierto, setPickerAbierto] = useState(false)
  const [q, setQ] = useState('')
  const [catFiltro, setCatFiltro] = useState('')
  const [limiteMatriz, setLimiteMatriz] = useState(8)
  const [seccion, setSeccion] = useState<SeccionReporte>('general')

  const { desde, hasta } = useMemo(() => rangoPeriodo(periodo), [periodo])

  // El staff con sucursal asignada queda acotado a la suya. El servidor lo
  // vuelve a aplicar por su cuenta (migración 54): si el filtro viviera solo
  // acá, bastaría con llamar la RPC sin sucursal para ver todas.
  const branchPropio = esAdmin || !userBranchId ? null : userBranchId
  const branchId = branchPropio ?? (sucursal || null)

  // El color se toma AL AGREGAR y acompaña al producto mientras siga elegido.
  // Nunca se reparte por ranking: si un producto sube de puesto al cambiar de
  // métrica, no debe cambiar de color.
  const colores = useMemo(() => {
    const m: Record<string, string> = {}
    seleccion.forEach((id, i) => { if (i < MAX_SERIES) m[id] = SLOTS[i] })
    return m
  }, [seleccion])

  // Las categorías toman su color de su posición en el catálogo, NO del ranking:
  // si al cambiar de métrica una categoría adelanta a otra, no debe cambiar de
  // color. Una categoría que no está en el catálogo (o "Sin categoría") cae al
  // final de forma determinista, nunca a un color prestado de otra.
  const colorCategoria = useCallback((nombre: string) => {
    const lista = categorias ?? []
    const i = lista.findIndex(c => c.nombre === nombre)
    if (i >= 0) return SLOTS[i % SLOTS.length]
    let h = 0
    for (const ch of nombre) h = (h * 31 + ch.charCodeAt(0)) >>> 0
    return SLOTS[h % SLOTS.length]
  }, [categorias])

  const alternar = useCallback((id: string, nombre?: string) => {
    setSeleccion(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
    if (nombre) setNombres(prev => ({ ...prev, [id]: nombre }))
  }, [])

  const serie = useReporteSerie({ desde, hasta, agrupacion, productoIds: seleccion, branchId })
  const matriz = useReporteMatriz({ desde, hasta, branchId, limite: limiteMatriz })
  const busqueda = useBuscarProductosReporte({ q, categoria: catFiltro, desde, hasta, branchId, activo: pickerAbierto })
  const rentabilidad = useReporteRentabilidad({ desde, hasta, branchId, activo: seccion === 'rentabilidad' })

  const meses = serie.data?.meses ?? []
  const totales = serie.data?.totales ?? { unidades: 0, neto: 0, margen: 0 }
  const totalesRentabilidad = useMemo(() => (rentabilidad.data?.filas ?? []).reduce((acc, f) => ({
    unidades: acc.unidades + (+f.unidades || 0),
    neto: acc.neto + (+f.neto || 0),
    margen: acc.margen + (+f.margen || 0),
  }), { unidades: 0, neto: 0, margen: 0 }), [rentabilidad.data])
  const kpis = seccion === 'rentabilidad' ? totalesRentabilidad : totales
  const margenPct = kpis.neto ? Math.round(kpis.margen / kpis.neto * 100) : 0
  const filasRentabilidad = useMemo(() => {
    if (agrupacion === 'categoria') {
      return (serie.data?.series ?? []).map(s => {
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
  }, [agrupacion, serie.data, rentabilidad.data])

  // La tabla conserva todas las series. El gráfico usa como máximo seis y les
  // asigna colores únicos; así una categoría séptima no reutiliza un color.
  const seriesTodas = useMemo(() => {
    const filas = serie.data?.series ?? []
    return filas
      .map((s, i) => ({
        ...s,
        hex: agrupacion === 'categoria' ? (SLOTS[i] ?? colorCategoria(s.nombre)) : (colores[s.clave] ?? GRIS),
        datos: (metrica === 'unidades' ? s.unidades : metrica === 'neto' ? s.neto : s.margen) ?? [],
      }))
  }, [serie.data, colores, agrupacion, metrica, colorCategoria])

  const seriesGrafico = seriesTodas.slice(0, MAX_SERIES)
  const fueraGrafico = Math.max(0, seriesTodas.length - MAX_SERIES)
  const fmt = (v: number) => metrica === 'unidades' ? uds(v) : clp(v)

  const SECCIONES: { id: SeccionReporte; label: string }[] = [
    { id: 'general', label: 'Vista general' },
    { id: 'ventas', label: 'Ventas' },
    { id: 'rentabilidad', label: 'Rentabilidad' },
    { id: 'gastos', label: 'Gastos' },
    { id: 'compras', label: 'Compras' },
    { id: 'operacion', label: 'Operación' },
  ]

  const cambiarSeccion = (id: SeccionReporte) => {
    setSeccion(id)
    if (id === 'rentabilidad') setMetrica('margen')
  }

  if (seccion === 'general') {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-gray-900 m-0">Reportes BI</h2>
            <p className="text-xs text-gray-400 mt-1 mb-0">Análisis ejecutivo y detalle de la operación.</p>
          </div>
          <div className="flex flex-wrap gap-2.5 items-end">
            <Campo label="Período"><select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} className={SELECT}>
              {(Object.keys(PERIODO_LABEL) as Periodo[]).map(p => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}
            </select></Campo>
            {!branchPropio && (bodegas ?? []).length > 1 && <Campo label="Sucursal"><select value={sucursal} onChange={e => setSucursal(e.target.value)} className={SELECT}>
              <option value="">Todas</option>{(bodegas ?? []).map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
            </select></Campo>}
          </div>
        </div>
        <NavegacionBI seccion={seccion} secciones={SECCIONES} onChange={cambiarSeccion} />
        <VistaGeneralBI desde={desde} hasta={hasta} branchId={branchId} />
      </div>
    )
  }

  if (seccion === 'gastos' || seccion === 'compras' || seccion === 'operacion') {
    return (
      <div className="flex flex-col gap-4 pb-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 className="text-xl font-extrabold text-gray-900 m-0">Reportes BI</h2><p className="text-xs text-gray-400 mt-1 mb-0">Análisis ejecutivo y detalle de la operación.</p></div>
          <div className="flex flex-wrap gap-2.5 items-end">
            <Campo label="Período"><select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} className={SELECT}>{(Object.keys(PERIODO_LABEL) as Periodo[]).map(p => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}</select></Campo>
            {!branchPropio && (bodegas ?? []).length > 1 && <Campo label="Sucursal"><select value={sucursal} onChange={e => setSucursal(e.target.value)} className={SELECT}><option value="">Todas</option>{(bodegas ?? []).map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}</select></Campo>}
          </div>
        </div>
        <NavegacionBI seccion={seccion} secciones={SECCIONES} onChange={cambiarSeccion} />
        <ResumenTab seccion={seccion} mostrarEncabezado={false} mostrarFiltros={false} rangoExterno={{ from: desde, to: hasta }} branchId={branchId} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 className="text-xl font-extrabold text-gray-900 m-0">Reportes BI</h2><p className="text-xs text-gray-400 mt-1 mb-0">Análisis ejecutivo y detalle de la operación.</p></div>
        <div className="flex flex-wrap gap-2.5 items-end">
          <Campo label="Período"><select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)} className={SELECT}>{(Object.keys(PERIODO_LABEL) as Periodo[]).map(p => <option key={p} value={p}>{PERIODO_LABEL[p]}</option>)}</select></Campo>
          {!branchPropio && (bodegas ?? []).length > 1 && <Campo label="Sucursal"><select value={sucursal} onChange={e => setSucursal(e.target.value)} className={SELECT}><option value="">Todas</option>{(bodegas ?? []).map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}</select></Campo>}
        </div>
      </div>
      <NavegacionBI seccion={seccion} secciones={SECCIONES} onChange={cambiarSeccion} />
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-extrabold text-gray-900 m-0">
            {seccion === 'ventas' ? 'Análisis de ventas' : 'Rentabilidad de productos'}
          </h2>
          <p className="text-xs text-gray-500 mt-1 mb-0">
            {seccion === 'ventas'
              ? 'Evolución, participación y detalle por producto o categoría.'
              : 'Unidades, venta neta y margen bruto generado. El margen no descuenta gastos operacionales.'}
          </p>
        </div>
      </div>
      {/* ── Filtros ── */}
      <div className="flex flex-wrap gap-2.5 items-end">
        <Campo label="Medir">
          <Seg valor={metrica} onChange={setMetrica} opciones={[
            ['unidades', 'Unidades'], ['neto', 'Venta neta'], ['margen', 'Margen'],
          ]} />
        </Campo>
        <Campo label="Agrupar por">
          <Seg valor={agrupacion} onChange={setAgrupacion} opciones={[
            ['producto', 'Producto'], ['categoria', 'Categoría'],
          ]} />
        </Campo>
        <div className="ml-auto flex gap-2 items-end">
          <Seg valor={vista} onChange={setVista} opciones={[['grafico', 'Gráfico'], ['tabla', 'Tabla']]} />
        </div>
      </div>

      {/* ── Selector de productos ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className={LBL}>
          Productos en el reporte · {seleccion.length === 0 ? 'ninguno' : `${seleccion.length} seleccionado${seleccion.length > 1 ? 's' : ''}`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {seleccion.map(id => (
            <button key={id} onClick={() => alternar(id)} title="Quitar del reporte"
              className="inline-flex items-center gap-2 text-xs font-semibold px-2.5 py-1.5 rounded-full border border-gray-900 text-gray-900 bg-gray-50">
              <span className="w-2 h-2 rounded-sm flex-shrink-0" style={{ background: colores[id] ?? GRIS }} />
              {nombres[id] ?? id}
              <span className="w-4 h-4 rounded-full bg-gray-200 text-gray-600 text-[10px] leading-4 text-center">×</span>
            </button>
          ))}
          <button onClick={() => setPickerAbierto(v => !v)}
            className="text-xs font-bold px-2.5 py-1.5 rounded-full border border-dashed border-blue-200 text-blue-600 hover:bg-blue-50 transition">
            {pickerAbierto ? 'Cerrar buscador' : '+ Agregar productos'}
          </button>
        </div>

        {fueraGrafico > 0 && (
          <p className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
            El gráfico dibuja {MAX_SERIES} series como máximo — más líneas dejan de distinguirse.{' '}
            <b>{fueraGrafico} {agrupacion === 'categoria' ? 'categoría' : 'producto'}{fueraGrafico > 1 ? 's' : ''}</b>{' '}
            quedan fuera del gráfico, pero siguen contando en los totales y aparecen en la tabla.
          </p>
        )}

        {pickerAbierto && (
          <div className="mt-3 border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex flex-wrap gap-2 p-3 bg-gray-50 border-b border-gray-100">
              <input type="search" value={q} onChange={e => setQ(e.target.value)} autoComplete="off"
                placeholder="Buscar por nombre o SKU…"
                className="flex-1 min-w-[220px] text-sm px-3 py-2 border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-blue-400" />
              <select value={catFiltro} onChange={e => setCatFiltro(e.target.value)} className={SELECT}>
                <option value="">Todas las categorías</option>
                {(categorias ?? []).map(c => <option key={c.id} value={c.nombre}>{c.nombre}</option>)}
              </select>
            </div>
            <div className="max-h-72 overflow-y-auto">
              {busqueda.isLoading && <div className="py-8"><Spinner /></div>}
              {!busqueda.isLoading && (busqueda.data?.productos ?? []).length === 0 && (
                <p className="px-3 py-5 text-sm text-gray-400 m-0">Ningún producto coincide con la búsqueda.</p>
              )}
              {(busqueda.data?.productos ?? []).map(p => (
                <label key={p.id} className="grid grid-cols-[20px_1fr_auto] gap-3 items-center px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50 cursor-pointer">
                  <input type="checkbox" checked={seleccion.includes(p.id)} onChange={() => alternar(p.id, p.nombre)}
                    className="w-4 h-4 accent-blue-600 cursor-pointer" />
                  <span>
                    <span className="block text-sm font-semibold text-gray-900">{p.nombre}</span>
                    <span className="block text-[11px] text-gray-400 mt-0.5">{p.sku || 'sin SKU'} · {p.categoria}</span>
                  </span>
                  <span className="text-xs text-gray-600 whitespace-nowrap tabular-nums">{uds(p.unidades)} u.</span>
                </label>
              ))}
            </div>
            <div className="flex justify-between items-center gap-3 px-3 py-2.5 bg-gray-50 border-t border-gray-100 text-[11px] text-gray-400">
              <span>
                Mostrando {(busqueda.data?.productos ?? []).length} de {busqueda.data?.coinciden ?? 0} productos
                {' · '}{seleccion.length} en el reporte
              </span>
              <button onClick={() => setPickerAbierto(false)}
                className="px-3.5 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg hover:bg-gray-700 transition">Listo</button>
            </div>
          </div>
        )}
      </div>

      {/* ── Tiles ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Unidades vendidas" valor={uds(kpis.unidades)} />
        <Tile label="Venta neta" valor={clp(kpis.neto)} />
        <Tile label="Margen bruto" valor={clp(kpis.margen)} />
        <Tile label="Margen %" valor={`${margenPct}%`} />
      </div>

      {seccion === 'rentabilidad' && rentabilidad.isLoading && <div className="py-12"><Spinner /></div>}
      {seccion === 'rentabilidad' && !rentabilidad.isLoading && (
        <TablaRentabilidad filas={filasRentabilidad} agrupacion={agrupacion} />
      )}

      {/* ── Serie en el tiempo ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3 className="text-sm font-extrabold text-gray-900 m-0">{MET_LABEL[metrica]} en el tiempo</h3>
          <span className="text-[11px] text-gray-400">{PERIODO_LABEL[periodo]}</span>
        </div>
        {serie.isLoading && <div className="py-16"><Spinner /></div>}
        {!serie.isLoading && seriesTodas.length === 0 && (
          <p className="text-sm text-gray-400 py-12 text-center m-0">
            {agrupacion === 'producto'
              ? 'Elige al menos un producto para ver su evolución.'
              : 'No hay ventas en el período seleccionado.'}
          </p>
        )}
        {!serie.isLoading && seriesTodas.length > 0 && (
          vista === 'grafico'
            ? <Lineas series={seriesGrafico} meses={meses} fmt={fmt} esDinero={metrica !== 'unidades'} />
            : <TablaSerie series={seriesTodas} meses={meses} fmt={fmt} />
        )}
      </div>

      {/* ── Ranking + detalle ── */}
      {seriesTodas.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h3 className="text-sm font-extrabold text-gray-900 m-0">
                {agrupacion === 'categoria' ? 'Por categoría' : 'Por producto'} · cantidad
              </h3>
              <span className="text-[11px] text-gray-400">Unidades del período</span>
            </div>
            <Ranking filas={[...(serie.data?.series ?? [])]
              .map(s => ({
                nombre: s.nombre,
                hex: agrupacion === 'categoria' ? colorCategoria(s.nombre) : (colores[s.clave] ?? GRIS),
                total: s.total_u,
              }))
              .sort((a, b) => b.total - a.total)} />
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-baseline justify-between gap-3 mb-3">
              <h3 className="text-sm font-extrabold text-gray-900 m-0">Detalle</h3>
              <span className="text-[11px] text-gray-400">En {MET_LABEL[metrica].toLowerCase()}</span>
            </div>
            <TablaDetalle
              filas={[...(serie.data?.series ?? [])].map(s => ({
                nombre: s.nombre,
                hex: agrupacion === 'categoria' ? colorCategoria(s.nombre) : (colores[s.clave] ?? GRIS),
                total: ((metrica === 'unidades' ? s.unidades : metrica === 'neto' ? s.neto : s.margen) ?? []).reduce((a, b) => a + (+b || 0), 0),
              })).sort((a, b) => b.total - a.total)}
              fmt={fmt} etiqueta={agrupacion === 'categoria' ? 'Categoría' : 'Producto'} />
          </div>
        </div>
      )}

      {/* ── Matriz producto × mes ── */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-baseline justify-between gap-3 mb-1">
          <h3 className="text-sm font-extrabold text-gray-900 m-0">Todos los productos vendidos por mes</h3>
          <span className="text-[11px] text-gray-400">Unidades · responde a los mismos filtros</span>
        </div>
        <p className="text-[11px] text-gray-400 mb-3 mt-1">Toca una fila para sumarla o sacarla del reporte de arriba.</p>
        {matriz.isLoading && <div className="py-10"><Spinner /></div>}
        {!matriz.isLoading && (
          <>
            <Matriz datos={matriz.data} seleccion={seleccion} colores={colores} onFila={alternar} />
            {(matriz.data?.productos_total ?? 0) > 8 && (
              <button onClick={() => setLimiteMatriz(actual => {
                const total = matriz.data?.productos_total ?? 8
                if (actual >= total) return 8
                return Math.min(total, actual === 8 ? 208 : actual + 200)
              })}
                className="mt-3 w-full px-4 py-2 border border-gray-200 rounded-lg text-xs font-bold text-gray-900 hover:bg-gray-50 transition">
                {limiteMatriz >= (matriz.data?.productos_total ?? 0)
                  ? 'Mostrar solo los 8 más vendidos'
                  : limiteMatriz === 8
                    ? `Ver más productos · ${matriz.data?.productos_total} en total`
                    : `Cargar más · mostrando ${matriz.data?.filas.length ?? 0} de ${matriz.data?.productos_total}`}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ── Piezas ────────────────────────────────────────────────────────

function NavegacionBI({ seccion, secciones, onChange }: {
  seccion: SeccionReporte
  secciones: { id: SeccionReporte; label: string }[]
  onChange: (id: SeccionReporte) => void
}) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
      {secciones.map(item => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)} aria-pressed={seccion === item.id}
          className={`shrink-0 px-3.5 py-2.5 border-b-2 text-xs font-bold transition ${seccion === item.id
            ? 'border-blue-600 text-blue-600'
            : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
          {item.label}
        </button>
      ))}
    </div>
  )
}

function TablaRentabilidad({ filas, agrupacion }: {
  filas: { id: string; nombre: string; unidades: number; neto: number; costo: number; margen: number }[]
  agrupacion: Agrupacion
}) {
  const ordenadas = [...filas].sort((a, b) => b.margen - a.margen)
  const perdidas = ordenadas.filter(f => f.margen < 0)
  const margenTotal = ordenadas.reduce((s, f) => s + f.margen, 0)
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-baseline justify-between gap-3 mb-3">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900 m-0">Rentabilidad por {agrupacion === 'producto' ? 'producto' : 'categoría'}</h3>
            <p className="text-[11px] text-gray-400 mt-1 mb-0">{agrupacion === 'producto' ? 'Cuántos salieron y cuánto margen bruto dejaron.' : 'Venta, costo y margen bruto consolidado por categoría.'}</p>
          </div>
          <span className={`text-sm font-extrabold tabular-nums ${margenTotal >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
            {clp(margenTotal)}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13px] border-collapse">
            <thead><tr className="border-b border-gray-200">
              <th className={TH_L}>{agrupacion === 'producto' ? 'Producto' : 'Categoría'}</th><th className={TH_R}>Unid.</th><th className={TH_R}>Venta neta</th>
              <th className={TH_R}>Costo vendido</th><th className={TH_R}>Margen bruto</th><th className={TH_R}>Margen %</th>
            </tr></thead>
            <tbody>{ordenadas.map(f => {
              const pct = f.neto ? Math.round(f.margen / f.neto * 100) : 0
              return <tr key={f.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2.5 px-2 font-semibold text-gray-900">{f.nombre}</td>
                <td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{uds(f.unidades)}</td>
                <td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{clp(f.neto)}</td>
                <td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{clp(f.costo)}</td>
                <td className={`py-2.5 px-2 text-right tabular-nums font-bold ${f.margen >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{clp(f.margen)}</td>
                <td className={`py-2.5 px-2 text-right tabular-nums font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{pct}%</td>
              </tr>
            })}</tbody>
          </table>
        </div>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-extrabold text-gray-900 m-0">{agrupacion === 'producto' ? 'Productos' : 'Categorías'} con pérdida</h3>
        <p className="text-[11px] text-gray-400 mt-1 mb-3">Prioridad de revisión de costo, precio o descuento.</p>
        {perdidas.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center m-0">No hay {agrupacion === 'producto' ? 'productos' : 'categorías'} con margen negativo en la selección.</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full text-[13px] border-collapse">
            <thead><tr className="border-b border-gray-200"><th className={TH_L}>{agrupacion === 'producto' ? 'Producto' : 'Categoría'}</th><th className={TH_R}>Unid.</th><th className={TH_R}>Pérdida</th><th className={TH_R}>Margen</th></tr></thead>
            <tbody>{perdidas.map(f => <tr key={f.id} className="border-b border-gray-50 last:border-0">
              <td className="py-2.5 px-2 font-semibold text-gray-900">{f.nombre}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{uds(f.unidades)}</td>
              <td className="py-2.5 px-2 text-right tabular-nums font-bold text-red-600">{clp(f.margen)}</td>
              <td className="py-2.5 px-2 text-right tabular-nums font-bold text-red-600">{f.neto ? Math.round(f.margen / f.neto * 100) : 0}%</td>
            </tr>)}</tbody>
          </table></div>
        )}
      </div>
    </div>
  )
}

const SELECT = 'text-sm text-gray-900 bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 cursor-pointer focus:outline-none focus:border-blue-400'
const LBL = 'text-[10px] font-extrabold tracking-wide uppercase text-gray-400 mb-2'
const TH_L = 'text-left text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2'
const TH_R = 'text-right text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2 whitespace-nowrap'

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-extrabold tracking-wide uppercase text-gray-400">{label}</span>
      {children}
    </div>
  )
}

function Seg<T extends string>({ valor, onChange, opciones }: {
  valor: T; onChange: (v: T) => void; opciones: [T, string][]
}) {
  return (
    <div className="inline-flex bg-white border border-gray-200 rounded-lg overflow-hidden">
      {opciones.map(([v, l]) => (
        <button key={v} onClick={() => onChange(v)} aria-pressed={valor === v}
          className={`text-xs font-semibold px-3 py-1.5 transition ${valor === v ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'}`}>
          {l}
        </button>
      ))}
    </div>
  )
}

function Tile({ label, valor }: { label: string; valor: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className={LBL} style={{ marginBottom: 0 }}>{label}</p>
      <p className="text-2xl font-extrabold text-gray-900 mt-1 tabular-nums">{valor}</p>
    </div>
  )
}

type SerieDibujable = { clave: string; nombre: string; hex: string; datos: number[] }

function Lineas({ series, meses, fmt, esDinero }: {
  series: SerieDibujable[]; meses: string[]; fmt: (v: number) => string; esDinero: boolean
}) {
  const [activo, setActivo] = useState<number | null>(null)
  const W = 900, H = 300, L = 60, R = 170, T = 16, B = 34
  const iw = W - L - R, ih = H - T - B
  const n = Math.max(meses.length, 2)

  const escala = escalaGrafico(series.flatMap(s => s.datos.map(Number)))

  const x = (i: number) => L + (iw * i) / (n - 1)
  const y = (v: number) => T + ih - ((v - escala.min) / (escala.max - escala.min)) * ih

  // Etiquetas directas al final de cada línea: es el relieve que exige el
  // chequeo de contraste (tres de los seis tonos quedan bajo 3:1 en claro).
  const finales = series
    .map(s => ({ s, yy: y(s.datos[s.datos.length - 1] ?? 0) }))
    .sort((a, b) => a.yy - b.yy)
  finales.forEach((f, i) => { if (i > 0 && f.yy - finales[i - 1].yy < 15) f.yy = finales[i - 1].yy + 15 })

  return (
    <div className="relative overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img"
        onMouseLeave={() => setActivo(null)}>
        {[0, 1, 2, 3, 4].map(k => {
          const gv = escala.min + escala.paso * k
          const gy = y(gv)
          return (
            <g key={k}>
              <line x1={L} y1={gy} x2={L + iw} y2={gy} stroke={gv === 0 ? '#b8b8bd' : '#ececf0'} strokeWidth={gv === 0 ? 1.5 : 1} />
              <text x={L - 10} y={gy + 4} textAnchor="end" fontSize={10} fill="#8e8e93">
                {esDinero ? '$' + Math.round(gv / 1000).toLocaleString('es-CL') + 'k' : uds(gv)}
              </text>
            </g>
          )
        })}
        {meses.map((m, i) => (
          <text key={m} x={x(i)} y={H - 12} textAnchor="middle" fontSize={10} fill="#8e8e93">{etiquetaMes(m)}</text>
        ))}
        {activo !== null && <line x1={x(activo)} y1={T} x2={x(activo)} y2={T + ih} stroke="#8e8e93" strokeWidth={1} strokeDasharray="3 3" opacity={0.5} />}
        {series.map(s => (
          <g key={s.clave}>
            <path d={s.datos.map((v, i) => `${i ? 'L' : 'M'}${x(i)} ${y(+v || 0)}`).join(' ')}
              fill="none" stroke={s.hex} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            {s.datos.map((v, i) => (
              <circle key={i} cx={x(i)} cy={y(+v || 0)} r={4} fill={s.hex} stroke="#fff" strokeWidth={2} />
            ))}
          </g>
        ))}
        {finales.map(f => (
          <text key={f.s.clave} x={L + iw + 12} y={f.yy + 4} fontSize={11} fontWeight={700} fill={f.s.hex}>
            {f.s.nombre.length > 20 ? f.s.nombre.slice(0, 19) + '…' : f.s.nombre}
          </text>
        ))}
        {meses.map((m, i) => (
          <rect key={m} x={x(i) - iw / (n * 2)} y={T} width={iw / n} height={ih} fill="transparent"
            style={{ cursor: 'crosshair' }} onMouseEnter={() => setActivo(i)} />
        ))}
      </svg>

      {activo !== null && (
        <div className="absolute top-4 bg-white border border-gray-200 rounded-xl px-3 py-2.5 shadow-lg text-xs pointer-events-none min-w-[170px]"
          style={{ left: `min(${(x(activo) / W) * 100}%, calc(100% - 190px))` }}>
          <p className="text-[10px] font-extrabold uppercase tracking-wide text-gray-400 m-0 mb-1.5">{etiquetaMes(meses[activo])}</p>
          {series.map(s => (
            <div key={s.clave} className="flex items-center justify-between gap-3 mt-0.5">
              <span className="inline-flex items-center gap-1.5 text-gray-600">
                <span className="w-2 h-2 rounded-sm" style={{ background: s.hex }} />
                {s.nombre.length > 18 ? s.nombre.slice(0, 17) + '…' : s.nombre}
              </span>
              <b className="tabular-nums text-gray-900">{fmt(+s.datos[activo] || 0)}</b>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3.5 mt-3 pt-3 border-t border-gray-100">
        {series.map(s => (
          <span key={s.clave} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className="w-3 h-[3px] rounded-sm" style={{ background: s.hex }} />{s.nombre}
          </span>
        ))}
      </div>
    </div>
  )
}

function TablaSerie({ series, meses, fmt }: { series: SerieDibujable[]; meses: string[]; fmt: (v: number) => string }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr>
            <th className="text-left text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2">Serie</th>
            {meses.map(m => <th key={m} className="text-right text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2">{etiquetaMes(m)}</th>)}
          </tr>
        </thead>
        <tbody>
          {series.map(s => (
            <tr key={s.clave} className="border-t border-gray-50">
              <td className="py-2 px-2 font-semibold text-gray-900 whitespace-nowrap">
                <span className="inline-block w-2 h-2 rounded-sm mr-2 align-middle" style={{ background: s.hex }} />{s.nombre}
              </td>
              {s.datos.map((v, i) => <td key={i} className="py-2 px-2 text-right tabular-nums text-gray-600">{fmt(+v || 0)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Ranking({ filas }: { filas: { nombre: string; hex: string; total: number }[] }) {
  const max = Math.max(1, ...filas.map(f => f.total))
  return (
    <div className="flex flex-col gap-3">
      {filas.map(f => (
        <div key={f.nombre}>
          <div className="flex items-baseline justify-between gap-3 mb-1.5">
            <span className="text-xs font-semibold text-gray-900 truncate">{f.nombre}</span>
            <span className="text-xs font-bold text-gray-900 tabular-nums whitespace-nowrap">{uds(f.total)} u.</span>
          </div>
          <div className="h-[7px] rounded-full bg-gray-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, f.total / max * 100)}%`, background: f.hex }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function TablaDetalle({ filas, fmt, etiqueta }: {
  filas: { nombre: string; hex: string; total: number }[]; fmt: (v: number) => string; etiqueta: string
}) {
  const tot = filas.reduce((a, b) => a + b.total, 0) || 1
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className="text-left text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2">{etiqueta}</th>
            <th className="text-right text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2">Total</th>
            <th className="text-right text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2">Part.</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={f.nombre} className="border-b border-gray-50 last:border-0">
              <td className="py-2.5 px-2 font-semibold text-gray-900">
                <span className="inline-block w-2 h-2 rounded-sm mr-2 align-middle" style={{ background: f.hex }} />{f.nombre}
              </td>
              <td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{fmt(f.total)}</td>
              <td className="py-2.5 px-2 text-right tabular-nums text-gray-600">{Math.round(f.total / tot * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Matriz({ datos, seleccion, colores, onFila }: {
  datos: { meses: string[]; filas: { producto_id: string; nombre: string; sku: string; total: number; meses: number[] }[]; total_por_mes: number[]; productos_total: number } | undefined
  seleccion: string[]; colores: Record<string, string>; onFila: (id: string, nombre: string) => void
}) {
  const cont = useRef<HTMLDivElement>(null)
  if (!datos || datos.filas.length === 0) {
    return <p className="text-sm text-gray-400 py-8 text-center m-0">No hay ventas en el período seleccionado.</p>
  }
  return (
    <div ref={cont} className="overflow-x-auto">
      <table className="w-full text-[12.5px] border-collapse">
        <thead>
          <tr>
            <th className="sticky left-0 bg-white z-10 text-left text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2 min-w-[210px]">Producto</th>
            {datos.meses.map(m => <th key={m} className="text-right text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2">{etiquetaMes(m)}</th>)}
            <th className="text-right text-[10px] font-extrabold uppercase tracking-wide text-gray-400 pb-2 px-2 border-l border-gray-200">Total</th>
          </tr>
        </thead>
        <tbody>
          {datos.filas.map(f => {
            const dentro = seleccion.includes(f.producto_id)
            return (
              <tr key={f.producto_id} onClick={() => onFila(f.producto_id, f.nombre)}
                title={dentro ? 'Quitar del reporte' : 'Agregar al reporte'}
                className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-gray-50">
                <td className="sticky left-0 bg-white py-2.5 px-2 font-semibold text-gray-900 whitespace-nowrap">
                  <span className="inline-block w-[7px] h-[7px] rounded-sm mr-2 align-middle"
                    style={dentro ? { background: colores[f.producto_id] ?? GRIS } : { boxShadow: 'inset 0 0 0 1px #dcdce0' }} />
                  {f.nombre}
                </td>
                {f.meses.map((v, i) => (
                  <td key={i} className={`py-2.5 px-2 text-right tabular-nums ${v ? 'text-gray-600' : 'text-gray-300'}`}>{v || '—'}</td>
                ))}
                <td className="py-2.5 px-2 text-right tabular-nums font-bold text-gray-900 border-l border-gray-200">{uds(f.total)}</td>
              </tr>
            )
          })}
          <tr className="border-t border-gray-200 bg-gray-50 font-extrabold text-gray-900">
            <td className="sticky left-0 bg-gray-50 py-2.5 px-2">Total {datos.productos_total} productos</td>
            {datos.total_por_mes.map((v, i) => <td key={i} className="py-2.5 px-2 text-right tabular-nums">{uds(v)}</td>)}
            <td className="py-2.5 px-2 text-right tabular-nums border-l border-gray-200">
              {uds(datos.total_por_mes.reduce((a, b) => a + (+b || 0), 0))}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
