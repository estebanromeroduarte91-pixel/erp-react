import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import {
  useBodegas, useGastoCategoriaConfig, useGastoComportamientoConfig,
  useGastosEnRango, useGuardarClasificacionCategoria, useGuardarMetaVentasConfig,
  useMetaVentasConfig, useRentabilidadSucursales,
} from '@/lib/queries'
import { cascada, type RentabilidadSucursales } from '@/lib/rentabilidad'
import { naturalezaEfectiva, naturalezaSugerida, type ConfigNaturaleza } from '@/lib/naturalezaGasto'
import { comportamientoEfectivo, type ConfigComportamiento } from '@/lib/comportamientoGasto'
import { calcularMetaVentas, type MetaVentasConfig } from '@/lib/metaVentas'
import { describirError } from '@/lib/errorUtils'
import type { Bodega, ComportamientoGasto, Gasto } from '@/types'

const SIN_NATURALEZA: ConfigNaturaleza = new Map()
const SIN_COMPORTAMIENTO: ConfigComportamiento = new Map()
const DIAS = [
  { id: 1, label: 'L' }, { id: 2, label: 'M' }, { id: 3, label: 'X' },
  { id: 4, label: 'J' }, { id: 5, label: 'V' }, { id: 6, label: 'S' }, { id: 7, label: 'D' },
]

function hoy() { return new Date().toISOString().slice(0, 10) }
function mesActual() { return hoy().slice(0, 7) }
function fmt(n: number | null) { return n == null || !Number.isFinite(n) ? '—' : `$${Math.round(n).toLocaleString('es-CL')}` }
function pct(n: number) { return `${Math.round(n * 10) / 10}%` }
function numero(v: string) { return Number(v.replace(/[^0-9]/g, '')) || 0 }

function limitesMes(periodo: string) {
  const [y, m] = periodo.split('-').map(Number)
  const ultimo = new Date(y, m, 0).getDate()
  return { desde: `${periodo}-01`, hasta: `${periodo}-${String(ultimo).padStart(2, '0')}` }
}

function mesAnterior(periodo: string) {
  const [y, m] = periodo.split('-').map(Number)
  const d = new Date(y, m - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function metricas(r: RentabilidadSucursales | undefined, branchId: string) {
  const c = cascada(r, branchId === 'general' ? null : branchId)
  return { ventas: c.ventasNetas, costo: c.costo }
}

function participacion(r: RentabilidadSucursales | undefined, branchId: string) {
  if (branchId === 'general') return 1
  const suc = r?.sucursales.find(s => s.branch_id === branchId)
  if (!suc) return 0
  return Math.max(0, Number(suc.participacion_ventas ?? 0) / 100)
}

function montoCosto(g: Gasto) {
  return g.con_credito_fiscal ? Number(g.monto_neto ?? g.monto) : Number(g.monto)
}

function separarGastos(
  gastos: Gasto[], branchId: string, share: number,
  naturalezas: ConfigNaturaleza, comportamientos: ConfigComportamiento,
) {
  let fijos = 0
  let variables = 0
  for (const g of gastos) {
    const naturaleza = naturalezaEfectiva(g, naturalezas)
    if (!['tienda', 'corporativo'].includes(naturaleza)) continue
    let factor = 1
    if (branchId !== 'general') {
      if (naturaleza === 'tienda') {
        if (g.bodega_id !== branchId) continue
      } else factor = share
    }
    const monto = montoCosto(g) * factor
    if (comportamientoEfectivo(g, comportamientos) === 'variable') variables += monto
    else fijos += monto
  }
  return { fijos, variables }
}

function nombreSucursal(b: Bodega) { return b.nombre ?? b.name ?? 'Sucursal' }

export function MetaVentasTab() {
  const { rol, branchId: branchUsuario, esPlatformAdmin } = useAuth()
  const puedeConfigurar = rol === 'admin' || esPlatformAdmin
  const [periodo, setPeriodo] = useState(mesActual())
  const { data: bodegas = [] } = useBodegas()
  const alcanceForzado = !puedeConfigurar && branchUsuario ? branchUsuario : null
  const [alcanceElegido, setAlcanceElegido] = useState('general')
  const alcance = alcanceForzado ?? alcanceElegido
  const rango = limitesMes(periodo)
  const mesPrevio = mesAnterior(periodo)
  const rangoPrevio = limitesMes(mesPrevio)

  const { data: rentabilidad, isLoading: cargandoRentabilidad } = useRentabilidadSucursales(rango)
  const { data: rentabilidadPrevia } = useRentabilidadSucursales(rangoPrevio)
  const { data: gastos = [] } = useGastosEnRango(rangoPrevio.desde, rango.hasta)
  const { data: configNaturaleza = SIN_NATURALEZA } = useGastoCategoriaConfig()
  const { data: configComportamiento = SIN_COMPORTAMIENTO } = useGastoComportamientoConfig()
  const { data: configMeta, isLoading: cargandoConfig } = useMetaVentasConfig(periodo, alcance)
  const guardarMeta = useGuardarMetaVentasConfig()
  const guardarCategoria = useGuardarClasificacionCategoria()

  const [mensaje, setMensaje] = useState('')

  const gastosMes = useMemo(() => gastos.filter(g => g.fecha >= rango.desde && g.fecha <= rango.hasta), [gastos, rango.desde, rango.hasta])
  const gastosPrevios = useMemo(() => gastos.filter(g => g.fecha >= rangoPrevio.desde && g.fecha <= rangoPrevio.hasta), [gastos, rangoPrevio.desde, rangoPrevio.hasta])
  const actual = metricas(rentabilidad, alcance)
  const previo = metricas(rentabilidadPrevia, alcance)
  const gastoActual = separarGastos(gastosMes, alcance, participacion(rentabilidad, alcance), configNaturaleza, configComportamiento)
  const gastoPrevio = separarGastos(gastosPrevios, alcance, participacion(rentabilidadPrevia, alcance), configNaturaleza, configComportamiento)
  const baseContribucion = actual.ventas > 0
    ? { ventas: actual.ventas, costo: actual.costo, variable: gastoActual.variables }
    : { ventas: previo.ventas, costo: previo.costo, variable: gastoPrevio.variables }

  const resultado = calcularMetaVentas({
    ventas: actual.ventas,
    costoProductos: baseContribucion.costo,
    gastosVariables: baseContribucion.variable,
    costosFijosActuales: gastoActual.fijos,
    costosFijosReferencia: gastoPrevio.fijos,
    metaConfigurada: configMeta?.meta_mensual ?? 0,
    costosFijosPresupuestados: configMeta?.costos_fijos_presupuestados ?? null,
    diasOperacion: configMeta?.dias_operacion ?? [1, 2, 3, 4, 5, 6],
    periodo: rango.desde,
    hoy: hoy(),
  })

  const categorias = useMemo(() => {
    const mapa = new Map<string, { monto: number; filas: Gasto[] }>()
    for (const g of gastosMes) {
      const naturaleza = naturalezaEfectiva(g, configNaturaleza)
      if (!['tienda', 'corporativo'].includes(naturaleza)) continue
      const actualCat = mapa.get(g.categoria) ?? { monto: 0, filas: [] }
      actualCat.monto += montoCosto(g)
      actualCat.filas.push(g)
      mapa.set(g.categoria, actualCat)
    }
    return [...mapa.entries()].map(([categoria, v]) => ({
      categoria,
      monto: v.monto,
      comportamiento: comportamientoEfectivo(v.filas[0], configComportamiento),
      naturaleza: naturalezaSugerida(categoria, configNaturaleza) ?? naturalezaEfectiva(v.filas[0], configNaturaleza),
      explicita: configComportamiento.has(categoria.trim().toLocaleLowerCase('es')),
    })).sort((a, b) => b.monto - a.monto)
  }, [gastosMes, configNaturaleza, configComportamiento])

  async function cambiarCategoria(categoria: typeof categorias[number], comportamiento: ComportamientoGasto) {
    try {
      await guardarCategoria.mutateAsync({
        categoria: categoria.categoria,
        naturaleza: categoria.naturaleza,
        comportamiento,
      })
    } catch (e) {
      setMensaje(describirError(e, 'No se pudo actualizar la categoría.').mensaje)
    }
  }

  const nombreAlcance = alcance === 'general'
    ? 'Toda la empresa'
    : nombreSucursal(bodegas.find(b => b.id === alcance) ?? { id: alcance, nombre: 'Mi sucursal' })
  const sinBase = baseContribucion.ventas <= 0

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Metas y punto de equilibrio</h1>
          <p className="text-sm text-gray-500 mt-1">Seguimiento simple con ventas netas, costos fijos y costos variables.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-semibold text-gray-500">
            Mes
            <input type="month" value={periodo} onChange={e => setPeriodo(e.target.value)}
              className="mt-1 block rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800" />
          </label>
          <label className="text-xs font-semibold text-gray-500">
            Vista
            <select value={alcance} disabled={!!alcanceForzado} onChange={e => setAlcanceElegido(e.target.value)}
              className="mt-1 block min-w-44 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 disabled:bg-gray-100">
              {!alcanceForzado && <option value="general">Toda la empresa</option>}
              {bodegas.map(b => <option key={b.id} value={b.id}>{nombreSucursal(b)}</option>)}
            </select>
          </label>
        </div>
      </div>

      {(cargandoRentabilidad || cargandoConfig) ? (
        <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">Calculando metas…</div>
      ) : <>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Ventas acumuladas" value={fmt(resultado.ventas)} sub={`${pct(resultado.avancePct)} de la meta`} color="blue" />
          <Kpi label="Meta del mes" value={fmt(resultado.metaMensual)} sub={configMeta?.meta_mensual ? 'configurada' : 'igual al punto de equilibrio'} />
          <Kpi label="Punto de equilibrio" value={fmt(resultado.puntoEquilibrio)} sub="ventas netas necesarias" color="amber" />
          <Kpi label="Necesario desde hoy" value={fmt(resultado.metaNecesariaDiaria)} sub={`${resultado.diasRestantes} días de operación`} color={resultado.holgura >= 0 ? 'green' : 'red'} />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.45fr_1fr]">
          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-bold text-gray-900">Ritmo de {nombreAlcance}</h2>
                <p className="text-xs text-gray-400 mt-1">La meta base no cambia; el ritmo necesario sí absorbe lo vendido de más o de menos.</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${resultado.holgura >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                {resultado.holgura >= 0 ? 'Sobre el ritmo' : 'Bajo el ritmo'} {fmt(Math.abs(resultado.holgura))}
              </span>
            </div>
            <div className="mt-5 h-3 overflow-hidden rounded-full bg-gray-100">
              <div className={`h-full rounded-full ${resultado.holgura >= 0 ? 'bg-green-500' : 'bg-blue-600'}`}
                style={{ width: `${Math.min(100, Math.max(0, resultado.avancePct))}%` }} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
              <Mini label="Meta base diaria" value={fmt(resultado.metaBaseDiaria)} />
              <Mini label="Esperado a la fecha" value={fmt(resultado.esperadoALaFecha)} />
              <Mini label="Proyección de cierre" value={fmt(resultado.proyeccionCierre)} />
              <Mini label="Margen contribución" value={pct(resultado.margenContribucionPct * 100)} />
            </div>
            {sinBase && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Aún no hay ventas suficientes para calcular el margen de contribución. Pixit usará el mes anterior cuando exista información.</p>}
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="font-bold text-gray-900">Cómo se calcula</h2>
            <div className="mt-4 space-y-3 text-sm">
              <Formula label="Ventas netas" value={fmt(baseContribucion.ventas)} />
              <Formula label="− Costo de productos" value={fmt(baseContribucion.costo)} />
              <Formula label="− Gastos variables" value={fmt(baseContribucion.variable)} />
              <div className="border-t border-gray-100 pt-3"><Formula label="= Margen de contribución" value={fmt(baseContribucion.ventas - baseContribucion.costo - baseContribucion.variable)} strong /></div>
              <Formula label="Costos fijos base" value={fmt(resultado.costosFijosBase)} />
            </div>
            <p className="mt-4 text-[11px] leading-relaxed text-gray-400">Punto de equilibrio = costos fijos ÷ porcentaje de margen de contribución. Financiamiento e inversiones no entran en este cálculo.</p>
          </section>
        </div>

        {puedeConfigurar && (
          <ConfiguracionMeta
            key={`${periodo}-${alcance}-${configMeta?.meta_mensual ?? 'nueva'}-${configMeta?.costos_fijos_presupuestados ?? 'auto'}`}
            periodo={periodo}
            alcance={alcance}
            config={configMeta}
            fijoAnterior={gastoPrevio.fijos}
            guardando={guardarMeta.isPending}
            onGuardar={async p => { await guardarMeta.mutateAsync(p) }}
          />
        )}

        <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
            <div>
              <h2 className="font-bold text-gray-900">Clasificación de costos</h2>
              <p className="text-xs text-gray-400 mt-1">Pixit propone una clasificación por categoría. El administrador puede corregirla aquí para todos los gastos futuros e históricos sin decisión propia.</p>
            </div>
            <Link to="/contabilidad?tab=gastos" className="text-xs font-semibold text-blue-600 hover:underline">Ver gastos</Link>
          </div>
          {mensaje && <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-xs text-red-600">{mensaje}</p>}
          {categorias.length === 0 ? <p className="p-8 text-center text-sm text-gray-400">No hay gastos operacionales en este mes.</p> : (
            <div className="divide-y divide-gray-100">
              {categorias.map(c => (
                <div key={c.categoria} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-800">{c.categoria}</p>
                    <p className="text-xs text-gray-400">{fmt(c.monto)} este mes · {c.explicita ? 'clasificación confirmada' : 'sugerencia de Pixit'}</p>
                  </div>
                  {puedeConfigurar ? (
                    <select value={c.comportamiento} onChange={e => void cambiarCategoria(c, e.target.value as ComportamientoGasto)}
                      disabled={guardarCategoria.isPending}
                      className={`rounded-lg border px-3 py-2 text-xs font-bold ${c.comportamiento === 'variable' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-gray-200 bg-gray-50 text-gray-700'}`}>
                      <option value="fijo">Fijo</option><option value="variable">Variable</option>
                    </select>
                  ) : <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${c.comportamiento === 'variable' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{c.comportamiento === 'variable' ? 'Variable' : 'Fijo'}</span>}
                </div>
              ))}
            </div>
          )}
        </section>
      </>}
    </div>
  )
}

function Kpi({ label, value, sub, color = 'default' }: { label: string; value: string; sub: string; color?: 'default' | 'blue' | 'amber' | 'green' | 'red' }) {
  const colores = { default: 'text-gray-900', blue: 'text-blue-600', amber: 'text-amber-600', green: 'text-green-600', red: 'text-red-600' }
  return <div className="rounded-xl border border-gray-200 bg-white p-4"><p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className={`mt-2 text-xl font-extrabold ${colores[color]}`}>{value}</p><p className="mt-1 text-xs text-gray-400">{sub}</p></div>
}
function Mini({ label, value }: { label: string; value: string }) { return <div><p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p><p className="mt-1 text-base font-bold text-gray-900">{value}</p></div> }
function Formula({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) { return <div className={`flex items-center justify-between gap-3 ${strong ? 'font-bold text-gray-900' : 'text-gray-600'}`}><span>{label}</span><span className="font-semibold tabular-nums">{value}</span></div> }

function ConfiguracionMeta({ periodo, alcance, config, fijoAnterior, guardando, onGuardar }: {
  periodo: string
  alcance: string
  config: MetaVentasConfig | null | undefined
  fijoAnterior: number
  guardando: boolean
  onGuardar: (p: MetaVentasConfig) => Promise<void>
}) {
  const [meta, setMeta] = useState(config?.meta_mensual ? String(config.meta_mensual) : '')
  const [fijos, setFijos] = useState(config?.costos_fijos_presupuestados != null ? String(config.costos_fijos_presupuestados) : '')
  const [dias, setDias] = useState(config?.dias_operacion?.length ? config.dias_operacion : [1, 2, 3, 4, 5, 6])
  const [mensaje, setMensaje] = useState('')

  async function guardar() {
    setMensaje('')
    try {
      await onGuardar({
        periodo: `${periodo}-01`,
        branch_id: alcance,
        meta_mensual: numero(meta),
        costos_fijos_presupuestados: fijos.trim() ? numero(fijos) : null,
        dias_operacion: [...dias].sort((a, b) => a - b),
      })
      setMensaje('Configuración guardada')
    } catch (e) {
      setMensaje(describirError(e, 'No se pudo guardar la configuración.').mensaje)
    }
  }

  return <section className="rounded-xl border border-gray-200 bg-white p-5">
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end">
      <div className="flex-1">
        <h2 className="font-bold text-gray-900">Configuración mensual</h2>
        <p className="text-xs text-gray-400 mt-1">Si dejas los costos fijos vacíos, Pixit usa el último mes completo ({fmt(fijoAnterior)}).</p>
      </div>
      <label className="text-xs font-semibold text-gray-500">Meta de ventas netas
        <input value={meta} onChange={e => setMeta(e.target.value)} inputMode="numeric" placeholder="Ej: 30000000"
          className="mt-1 block w-full min-w-48 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" />
      </label>
      <label className="text-xs font-semibold text-gray-500">Costos fijos previstos <span className="font-normal text-gray-400">(opcional)</span>
        <input value={fijos} onChange={e => setFijos(e.target.value)} inputMode="numeric" placeholder={String(Math.round(fijoAnterior))}
          className="mt-1 block w-full min-w-48 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm" />
      </label>
      <div>
        <span className="text-xs font-semibold text-gray-500">Días de operación</span>
        <div className="mt-1 flex gap-1">
          {DIAS.map(d => <button key={d.id} type="button" onClick={() => setDias(prev => prev.includes(d.id) ? prev.filter(x => x !== d.id) : [...prev, d.id])}
            className={`h-9 w-9 rounded-lg text-xs font-bold ${dias.includes(d.id) ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{d.label}</button>)}
        </div>
      </div>
      <button type="button" onClick={() => void guardar()} disabled={guardando || dias.length === 0}
        className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar'}</button>
    </div>
    {mensaje && <p className={`mt-3 text-xs ${mensaje === 'Configuración guardada' ? 'text-green-700' : 'text-red-600'}`}>{mensaje}</p>}
  </section>
}
