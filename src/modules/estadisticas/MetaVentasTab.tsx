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
  const faltaPorVender = Math.max(0, resultado.metaMensual - resultado.ventas)
  const metaSuperada = resultado.metaMensual > 0 && resultado.ventas >= resultado.metaMensual

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
        <section className="rounded-2xl border border-gray-200 bg-white p-5 md:p-7">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Meta de {nombreAlcance}</p>
              <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-3xl font-extrabold text-gray-900 md:text-4xl">{fmt(resultado.ventas)}</span>
                <span className="text-sm text-gray-400">de {fmt(resultado.metaMensual)}</span>
              </div>
              <p className="mt-2 text-xs text-gray-400">
                {configMeta?.meta_mensual
                  ? `Meta configurada · Punto de equilibrio ${fmt(resultado.puntoEquilibrio)}`
                  : 'Meta automática para cubrir todos los costos del mes'}
              </p>
            </div>
            <span className={`self-start rounded-full px-3 py-1.5 text-xs font-bold ${
              metaSuperada ? 'bg-green-50 text-green-700'
                : resultado.holgura >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'
            }`}>
              {metaSuperada ? 'Meta cumplida' : resultado.holgura >= 0 ? 'Vas bien' : 'Hay que recuperar ritmo'}
            </span>
          </div>

          <div className="mt-6 h-4 overflow-hidden rounded-full bg-gray-100">
            <div className={`h-full rounded-full transition-all ${metaSuperada ? 'bg-green-500' : 'bg-blue-600'}`}
              style={{ width: `${Math.min(100, Math.max(0, resultado.avancePct))}%` }} />
          </div>
          <div className="mt-2 flex items-center justify-between text-xs">
            <span className="font-bold text-blue-600">{pct(resultado.avancePct)} cumplido</span>
            <span className="text-gray-400">{resultado.diasRestantes} días de venta disponibles</span>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <DatoSimple label={metaSuperada ? 'Superaste la meta por' : 'Falta por vender'} value={fmt(metaSuperada ? resultado.ventas - resultado.metaMensual : faltaPorVender)} />
            <DatoSimple label="Necesitas vender por día" value={fmt(resultado.metaNecesariaDiaria)} destacado />
            <DatoSimple label="Proyección al cierre" value={fmt(resultado.proyeccionCierre)} />
          </div>

          {!metaSuperada && (
            <p className={`mt-5 rounded-xl px-4 py-3 text-sm ${resultado.holgura >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-800'}`}>
              {resultado.holgura >= 0
                ? `Llevas ${fmt(resultado.holgura)} de ventaja. Por eso la venta diaria necesaria bajó.`
                : `Vas ${fmt(Math.abs(resultado.holgura))} bajo el avance esperado. Pixit ya repartió esa diferencia entre los días restantes.`}
            </p>
          )}
          {sinBase && <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Todavía no hay ventas suficientes para estimar los costos. Pixit usará el mes anterior cuando exista información.</p>}
        </section>

        {puedeConfigurar && (
          <details className="group rounded-xl border border-gray-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
              <div><p className="text-sm font-bold text-gray-900">Configurar meta</p><p className="mt-0.5 text-xs text-gray-400">Cambiar monto mensual, costos previstos o días de trabajo</p></div>
              <span className="text-xl text-gray-400 transition group-open:rotate-45">＋</span>
            </summary>
            <div className="border-t border-gray-100 p-4">
              <ConfiguracionMeta
                key={`${periodo}-${alcance}-${configMeta?.meta_mensual ?? 'nueva'}-${configMeta?.costos_fijos_presupuestados ?? 'auto'}`}
                periodo={periodo}
                alcance={alcance}
                config={configMeta}
                fijoAnterior={gastoPrevio.fijos}
                guardando={guardarMeta.isPending}
                onGuardar={async p => { await guardarMeta.mutateAsync(p) }}
              />
            </div>
          </details>
        )}

        <details className="group overflow-hidden rounded-xl border border-gray-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
            <div><p className="text-sm font-bold text-gray-900">Ver cómo se calculó</p><p className="mt-0.5 text-xs text-gray-400">Punto de equilibrio y clasificación de costos</p></div>
            <span className="text-xl text-gray-400 transition group-open:rotate-45">＋</span>
          </summary>
          <div className="grid gap-5 border-t border-gray-100 p-5 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-bold text-gray-800">Cálculo del punto de equilibrio</h3>
              <div className="mt-4 space-y-3 text-sm">
                <Formula label="Ventas netas" value={fmt(baseContribucion.ventas)} />
                <Formula label="− Costo de productos" value={fmt(baseContribucion.costo)} />
                <Formula label="− Gastos variables" value={fmt(baseContribucion.variable)} />
                <div className="border-t border-gray-100 pt-3"><Formula label="= Margen disponible" value={fmt(baseContribucion.ventas - baseContribucion.costo - baseContribucion.variable)} strong /></div>
                <Formula label="Costos fijos" value={fmt(resultado.costosFijosBase)} />
                <Formula label="Punto de equilibrio" value={fmt(resultado.puntoEquilibrio)} strong />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between"><h3 className="text-sm font-bold text-gray-800">Costos por categoría</h3><Link to="/contabilidad?tab=gastos" className="text-xs font-semibold text-blue-600 hover:underline">Ver gastos</Link></div>
              {mensaje && <p className="mt-2 rounded bg-red-50 px-3 py-2 text-xs text-red-600">{mensaje}</p>}
              {categorias.length === 0 ? <p className="py-6 text-sm text-gray-400">No hay gastos operacionales este mes.</p> : (
                <div className="mt-3 max-h-72 divide-y divide-gray-100 overflow-y-auto">
                  {categorias.map(c => (
                    <div key={c.categoria} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-gray-700">{c.categoria}</p><p className="text-xs text-gray-400">{fmt(c.monto)}</p></div>
                      {puedeConfigurar ? <select value={c.comportamiento} onChange={e => void cambiarCategoria(c, e.target.value as ComportamientoGasto)} disabled={guardarCategoria.isPending}
                        className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs font-bold text-gray-700"><option value="fijo">Fijo</option><option value="variable">Variable</option></select>
                        : <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-600">{c.comportamiento === 'variable' ? 'Variable' : 'Fijo'}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </details>
      </>}
    </div>
  )
}

function DatoSimple({ label, value, destacado = false }: { label: string; value: string; destacado?: boolean }) {
  return <div className={`rounded-xl p-4 ${destacado ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-900'}`}><p className={`text-[11px] font-semibold uppercase tracking-wide ${destacado ? 'text-blue-100' : 'text-gray-400'}`}>{label}</p><p className="mt-1 text-xl font-extrabold">{value}</p></div>
}
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

  return <div>
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
  </div>
}
