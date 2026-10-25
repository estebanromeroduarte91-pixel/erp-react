import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useReposicionSugerida, useCrearOC, useIncrementarContadorOC, useProveedores } from '@/lib/queries'
import {
  cantidadInicial, claveFila, comprasPorProveedor, filasTabla, hayQueReponer, secciones, trasladosPorRuta,
  type FilaReposicion, type LineaElegida, type TrasladoSugerido,
} from '@/lib/reposicion'
import { fechaLocal } from '@/lib/fecha'
import { describirError } from '@/lib/errorUtils'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import { ModalTraslado } from './MovimientosTab'
import type { OC } from '@/types'

const IVA = 0.19
const PERIODOS = [7, 30, 60, 90] as const
const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const uds = (n: number) => Math.round(n).toLocaleString('es-CL')
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

// Lo elegido en la tabla: si la fila está marcada y cuánto comprar.
type Eleccion = { marcada: boolean; cantidad: number }

export function ReposicionTab() {
  const [dias, setDias] = useState<number>(30)
  const { data, isLoading, error, refetch, isFetching } = useReposicionSugerida(dias)
  const [bodegaId, setBodegaId] = useState<string | null>(null)
  const [soloReponer, setSoloReponer] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  // Solo se guarda lo que el usuario cambió; lo demás sale de la sugerencia.
  const [cambios, setCambios] = useState<Record<string, Eleccion>>({})
  const [traslado, setTraslado] = useState<TrasladoSugerido | null>(null)
  const [comprar, setComprar] = useState<LineaElegida[] | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const filas = useMemo(() => filasTabla(data?.filas ?? [], { bodegaId, soloReponer, busqueda }), [data, bodegaId, soloReponer, busqueda])
  const s = useMemo(() => secciones(data?.filas ?? [], bodegaId), [data, bodegaId])

  const eleccion = (f: FilaReposicion): Eleccion => cambios[claveFila(f)] ?? {
    marcada: cantidadInicial(f) > 0 || +f.trasladar > 0,
    cantidad: cantidadInicial(f),
  }
  const marcadas = filas.filter(f => eleccion(f).marcada)
  const lineasCompra: LineaElegida[] = marcadas
    .map(f => ({ fila: f, cantidad: eleccion(f).cantidad }))
    .filter(l => l.cantidad > 0)
  const traslados = trasladosPorRuta(marcadas)
  const totalUnidades = lineasCompra.reduce((a, l) => a + l.cantidad, 0)
  const totalNeto = lineasCompra.reduce((a, l) => a + l.cantidad * (+l.fila.costo_unitario || 0), 0)
  const porReponer = (data?.filas ?? []).filter(f => (!bodegaId || f.bodega_id === bodegaId) && hayQueReponer(f)).length
  const inmovilizado = (data?.resumen ?? []).filter(r => !bodegaId || r.bodega_id === bodegaId)
    .reduce((a, r) => a + (+r.monto_inmovilizado || 0), 0)

  function cambiar(f: FilaReposicion, patch: Partial<Eleccion>) {
    setCambios(prev => ({ ...prev, [claveFila(f)]: { ...eleccion(f), ...patch } }))
  }
  function marcarTodas(valor: boolean) {
    setCambios(prev => {
      const n = { ...prev }
      for (const f of filas) n[claveFila(f)] = { ...eleccion(f), marcada: valor }
      return n
    })
  }

  if (isLoading) return <div className="py-16"><Spinner /></div>
  if (error) {
    const sinPermiso = /permiso|encargados/i.test((error as Error).message)
    return (
      <div className="py-14 text-center text-sm text-gray-500">
        {sinPermiso ? 'La reposición la ven el administrador y los encargados.' : `No se pudo calcular la reposición: ${(error as Error).message}`}
      </div>
    )
  }
  if (!data) return null

  const todasMarcadas = filas.length > 0 && filas.every(f => eleccion(f).marcada)

  return (
    <div className="flex flex-col gap-3 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Vendido en</span>
          <Segmento opciones={PERIODOS.map(d => ({ id: d, label: `${d} días` }))} valor={dias} onChange={d => { setDias(d); setCambios({}) }} />
          <Segmento opciones={[{ id: null as string | null, label: 'Todas' }, ...data.sucursales.map(b => ({ id: b.id as string | null, label: b.nombre }))]}
            valor={bodegaId} onChange={setBodegaId} />
          {isFetching && <span className="text-[11px] text-gray-400">Actualizando…</span>}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-gray-700 cursor-pointer">
          <input type="checkbox" checked={soloReponer} onChange={e => setSoloReponer(e.target.checked)} className="rounded border-gray-300 text-blue-600" />
          Solo lo que hay que reponer
        </label>
      </div>

      {aviso && (
        <div className={`rounded-lg border px-3 py-2 text-xs font-medium flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-red-50 border-red-100 text-red-700'}`}>
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Por reponer" valor={uds(porReponer)} sub="productos" />
        <Kpi label="Corregir stock" valor={uds(s.corregir.length)} sub="en negativo" />
        <Kpi label="Plata parada" valor={clp(inmovilizado)} sub="sin venta en 90 días" />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5 border-b border-gray-100">
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar producto o categoría…"
            className="flex-1 min-w-[180px] px-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-gray-700 tabular-nums">
              {marcadas.length} seleccionados{totalUnidades > 0 ? ` · ${uds(totalUnidades)} u. · ${clp(totalNeto)}` : ''}
            </span>
            {traslados.map(t => (
              <button key={`${t.origen_id}>${t.destino_id}`} onClick={() => setTraslado(t)}
                className="px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50">
                Trasladar {uds(t.unidades)} u. {t.origen_nombre} → {t.destino_nombre}
              </button>
            ))}
            <button onClick={() => lineasCompra.length && setComprar(lineasCompra)} disabled={!lineasCompra.length}
              className="px-3 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
              Crear orden de compra
            </button>
          </div>
        </div>

        {filas.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400 m-0">
            {soloReponer ? `Nada que reponer con lo vendido en ${dias} días.` : 'No hay ventas en el período.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <Th className="w-8">
                    <input type="checkbox" checked={todasMarcadas} onChange={e => marcarTodas(e.target.checked)} aria-label="Marcar todas" className="rounded border-gray-300 text-blue-600" />
                  </Th>
                  <Th>Producto</Th>{!bodegaId && <Th>Tienda</Th>}
                  <Th right>Vendió</Th><Th right>Stock</Th><Th right>Alcanza</Th><Th right>Pedir</Th><Th>Nota</Th>
                </tr>
              </thead>
              <tbody>
                {filas.map(f => {
                  const e = eleccion(f)
                  return (
                    <tr key={claveFila(f)} className={`border-b border-gray-50 last:border-0 ${e.marcada ? 'bg-blue-50/30' : ''}`}>
                      <td className="px-3 py-2">
                        <input type="checkbox" checked={e.marcada} onChange={ev => cambiar(f, { marcada: ev.target.checked })} aria-label={`Seleccionar ${f.nombre}`} className="rounded border-gray-300 text-blue-600" />
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-bold text-gray-800">{f.nombre}</div>
                        <div className="text-[11px] text-gray-400">{[f.categoria, f.proveedor?.nombre?.trim()].filter(Boolean).join(' · ')}</div>
                      </td>
                      {!bodegaId && <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{f.bodega_nombre}</td>}
                      <td className="px-3 py-2 text-right font-bold tabular-nums">{uds(f.vendidas_periodo)}</td>
                      <td className="px-3 py-2 text-right"><Stock f={f} /></td>
                      <td className="px-3 py-2 text-right whitespace-nowrap"><Alcanza f={f} objetivo={data.parametros.dias_objetivo} /></td>
                      <td className="px-3 py-2 text-right">
                        <input type="number" min={0} step={1} value={e.cantidad}
                          onChange={ev => cambiar(f, { cantidad: Math.max(0, Math.floor(+ev.target.value || 0)), marcada: true })}
                          aria-label={`Cantidad a pedir de ${f.nombre}`}
                          className="w-16 px-2 py-1 text-center font-bold border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-400" />
                      </td>
                      <td className="px-3 py-2"><Nota f={f} /></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-3 py-2 border-t border-gray-100 text-[11px] text-gray-400">
          Ordenado por urgencia: lo que se acaba antes, arriba. "Pedir" viene calculado para {data.parametros.dias_objetivo} días de venta y lo puedes cambiar.
        </div>
      </section>

      <Plegable titulo="⚠ Corregir stock" cuenta={s.corregir.length}
        bajada="Se vendió más de lo registrado, así que no se sabe cuánto hay. Haz un conteo en Toma de inventario.">
        <TablaSimple filas={s.corregir} mostrarTienda={!bodegaId} columnas={[
          ['Stock', f => <span className="font-bold text-red-700 tabular-nums">{uds(f.stock)}</span>],
          [`Vendió ${dias}d`, f => uds(f.vendidas_periodo)],
        ]} />
      </Plegable>

      <Plegable titulo="Bajo pedido" cuenta={s.bajoPedido.length}
        bajada="Se compran cuando entra la reparación.">
        <TablaSimple filas={s.bajoPedido} mostrarTienda={!bodegaId} columnas={[
          [`Vendió ${dias}d`, f => uds(f.vendidas_periodo)],
        ]} />
      </Plegable>

      <Plegable titulo="Plata parada" cuenta={s.plataParada.length} monto={inmovilizado}
        bajada="Sin venta en 90 días, o con stock para más de 3 meses. No comprar; evaluar traslado o liquidación.">
        <TablaSimple filas={s.plataParada} mostrarTienda={!bodegaId} columnas={[
          ['Stock', f => uds(f.stock)],
          ['Valor', f => clp(f.stock * f.costo_unitario)],
          ['Situación', f => f.estado === 'sin_movimiento' ? 'Sin venta en 90 días' : `Stock para ${uds(f.cobertura_dias ?? 0)} días`],
        ]} />
      </Plegable>

      {traslado && (
        <ModalTraslado
          inicial={{
            origenId: traslado.origen_id, destinoId: traslado.destino_id, lineas: traslado.lineas,
            notas: `Reposición: ${traslado.origen_nombre} → ${traslado.destino_nombre}`,
          }}
          onClose={() => { setTraslado(null); void refetch() }}
        />
      )}

      {comprar && (
        <ConfirmarCompras
          lineas={comprar}
          onCerrar={() => setComprar(null)}
          onCreadas={numeros => {
            setComprar(null)
            setCambios({})
            setAviso({ tipo: 'ok', texto: `Órdenes creadas en borrador: ${numeros.join(', ')}. Revísalas en Compras antes de enviarlas.` })
            void refetch()
          }}
          onError={texto => setAviso({ tipo: 'error', texto })}
        />
      )}
    </div>
  )
}

function Stock({ f }: { f: FilaReposicion }) {
  const cls = f.stock <= 0 ? 'bg-red-50 text-red-700' : hayQueReponer(f) ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-700'
  return <span className={`inline-block px-2 py-0.5 rounded-md font-bold tabular-nums ${cls}`}>{f.stock <= 0 ? '✕ ' : ''}{uds(f.stock)}</span>
}

function Alcanza({ f, objetivo }: { f: FilaReposicion; objetivo: number }) {
  if (f.stock <= 0) return <span className="font-bold text-red-700">agotado</span>
  if (f.cobertura_dias == null) return <span className="text-gray-400">—</span>
  const d = Math.round(+f.cobertura_dias)
  const cls = d < 7 ? 'text-red-700 font-bold' : d < objetivo ? 'text-amber-800 font-bold' : 'text-gray-600'
  return <span className={cls}>{d > 365 ? '+1 año' : `${uds(d)} días`}</span>
}

function Nota({ f }: { f: FilaReposicion }) {
  const chips: React.ReactNode[] = []
  if (f.trasladar > 0 && f.trasladar_desde) {
    chips.push(<span key="t" className="px-2 py-0.5 rounded-md font-bold bg-blue-50 text-blue-700 whitespace-nowrap">⇄ Traer {uds(f.trasladar)} de {f.trasladar_desde.nombre}</span>)
  } else if (f.stock_otras?.length && f.stock <= 0) {
    const o = f.stock_otras[0]
    chips.push(<span key="o" className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 whitespace-nowrap">Hay {uds(o.stock)} en {o.nombre}</span>)
  }
  if (f.estado === 'stock_negativo') {
    chips.push(<span key="n" className="px-2 py-0.5 rounded-md font-bold bg-amber-50 text-amber-800 whitespace-nowrap">⚠ Stock en {uds(f.stock)}: contar</span>)
  }
  if (f.se_repone === false) {
    chips.push(<span key="b" className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 whitespace-nowrap">Bajo pedido</span>)
  }
  if (+f.ya_viene > 0) {
    chips.push(<span key="v" className="px-2 py-0.5 rounded-md bg-gray-100 text-gray-700 whitespace-nowrap">Vienen {uds(f.ya_viene)}</span>)
  }
  return <div className="flex flex-wrap gap-1">{chips}</div>
}

function ConfirmarCompras({ lineas, onCerrar, onCreadas, onError }: {
  lineas: LineaElegida[]
  onCerrar: () => void
  onCreadas: (numeros: string[]) => void
  onError: (texto: string) => void
}) {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const crearOC = useCrearOC()
  const contador = useIncrementarContadorOC()
  const { data: proveedores = [] } = useProveedores()
  const [creando, setCreando] = useState(false)
  // Grupos iniciales por el proveedor de la última compra; cada uno se puede reasignar.
  const grupos = useMemo(() => comprasPorProveedor(lineas), [lineas])
  const [elegido, setElegido] = useState<Record<string, string>>(() =>
    Object.fromEntries(grupos.map(g => [g.proveedor_id, g.proveedor_id])))

  async function crear() {
    setCreando(true)
    const numeros: string[] = []
    try {
      // El proveedor elegido manda: dos grupos con el mismo proveedor van en una sola OC.
      const conProveedor = lineas.map(l => {
        const id = elegido[l.fila.proveedor?.id ?? ''] ?? l.fila.proveedor?.id ?? ''
        const p = proveedores.find(x => x.id === id)
        return { ...l, proveedor: id ? { id, nombre: p?.nombre ?? l.fila.proveedor?.nombre ?? '' } : null }
      })
      for (const c of comprasPorProveedor(conProveedor)) {
        const n = await contador.mutateAsync()
        const items = c.lineas.map(l => {
          const conIva = Math.round(l.costo_neto * (1 + IVA))
          return {
            id: uid(), producto_id: l.producto_id, producto_nombre: l.producto_nombre, cantidad: l.cantidad,
            precio_neto: l.costo_neto, precio_iva: conIva, precio_unitario: l.costo_neto,
            // Cada línea va a la tienda que la necesita: así no se recibe en una y se vende en otra.
            subtotal: l.cantidad * conIva, bodega_id: l.bodega_id, bodega_nombre: l.bodega_nombre,
          }
        })
        const unaBodega = new Set(c.lineas.map(l => l.bodega_id)).size === 1 ? c.lineas[0] : null
        const oc: OC = {
          id: uid(),
          numero: 'OC-' + String(n).padStart(5, '0'),
          estado: 'borrador',
          proveedor_id: c.proveedor_id,
          proveedor_nombre: c.proveedor_nombre,
          fecha: fechaLocal(),
          fecha_creacion: fechaLocal(),
          bodega_id: unaBodega?.bodega_id,
          bodega_nombre: unaBodega?.bodega_nombre,
          notas: 'Creada desde Reposición',
          items,
          total: items.reduce((a, i) => a + i.subtotal, 0),
        }
        await crearOC.mutateAsync(oc)
        numeros.push(oc.numero)
      }
      void qc.invalidateQueries({ queryKey: ['ocs', empresaId] })
      onCreadas(numeros)
    } catch (e) {
      // Las que alcanzaron a crearse quedan; se informa cuáles para no duplicarlas.
      const hechas = numeros.length ? ` Se alcanzaron a crear: ${numeros.join(', ')}.` : ''
      onError(describirError(e, 'No se pudieron crear las órdenes de compra.').mensaje + hechas)
      onCerrar()
    } finally {
      setCreando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={creando ? undefined : onCerrar}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="text-base font-extrabold text-gray-900 m-0">Crear orden de compra</h3>
          <p className="text-xs text-gray-500 mt-1 mb-0">Elige el proveedor de cada grupo. Quedan en <b>borrador</b> para revisarlas en Compras.</p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {grupos.map(g => (
            <div key={g.proveedor_id || 'sin'} className="rounded-lg border border-gray-200">
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-gray-100">
                <select value={elegido[g.proveedor_id] ?? ''} onChange={e => setElegido(prev => ({ ...prev, [g.proveedor_id]: e.target.value }))}
                  aria-label="Proveedor" className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                  <option value="">Sin proveedor (elegir después)</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
                <span className="text-xs font-bold tabular-nums text-gray-700">{clp(g.total_neto)} neto</span>
              </div>
              <ul className="m-0 px-3 py-2 list-none text-xs text-gray-600 flex flex-col gap-1">
                {g.lineas.map(l => (
                  <li key={`${l.producto_id}@${l.bodega_id}`} className="flex justify-between gap-3">
                    <span>{l.cantidad} × {l.producto_nombre} <span className="text-gray-400">· {l.bodega_nombre}</span></span>
                    <span className="tabular-nums">{clp(l.cantidad * l.costo_neto)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100 bg-gray-50">
          <Link to="/compras" className="mr-auto self-center text-xs text-blue-600 hover:underline">Ir a Compras</Link>
          <button onClick={onCerrar} disabled={creando} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-60">Cancelar</button>
          <button onClick={crear} disabled={creando} className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60">
            {creando ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Segmento<T extends string | number | null>({ opciones, valor, onChange }: {
  opciones: { id: T; label: string }[]; valor: T; onChange: (v: T) => void
}) {
  return (
    <div className="flex gap-0.5 bg-gray-200/70 p-[3px] rounded-[10px]">
      {opciones.map(o => (
        <button key={String(o.id)} onClick={() => onChange(o.id)}
          className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${valor === o.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub: string }) {
  return (
    <article className="min-w-0 p-3 rounded-xl border border-gray-200 bg-white">
      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
      <strong className="block mt-1 text-lg font-extrabold tracking-tight text-gray-900 truncate">{valor}</strong>
      <div className="text-[11px] text-gray-400 truncate">{sub}</div>
    </article>
  )
}

function Plegable({ titulo, cuenta, monto, bajada, children }: {
  titulo: string; cuenta: number; monto?: number; bajada: string; children: React.ReactNode
}) {
  const [abierta, setAbierta] = useState(false)
  return (
    <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button onClick={() => setAbierta(a => !a)} aria-expanded={abierta}
        className="w-full flex justify-between items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/60">
        <div>
          <div className="text-sm font-extrabold text-gray-900">
            {titulo} <span className="font-semibold text-gray-400">· {monto != null ? clp(monto) : uds(cuenta)}</span>
          </div>
          <div className="text-[11px] text-gray-400 mt-0.5">{bajada}</div>
        </div>
        <span className="text-gray-400 text-xs">{abierta ? '▾' : '▸'}</span>
      </button>
      {abierta && (cuenta === 0
        ? <p className="py-6 text-center text-xs text-gray-400 m-0 border-t border-gray-100">Nada por ahora.</p>
        : <div className="border-t border-gray-100">{children}</div>)}
    </section>
  )
}

function TablaSimple({ filas, mostrarTienda, columnas }: {
  filas: FilaReposicion[]
  mostrarTienda: boolean
  columnas: [string, (f: FilaReposicion) => React.ReactNode][]
}) {
  return (
    <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
      <table className="w-full min-w-[480px] text-xs border-collapse">
        <thead className="sticky top-0 bg-white">
          <tr className="border-b border-gray-100">
            <Th>Producto</Th>{mostrarTienda && <Th>Tienda</Th>}
            {columnas.map(([t]) => <Th key={t} right>{t}</Th>)}
          </tr>
        </thead>
        <tbody>
          {filas.map(f => (
            <tr key={claveFila(f)} className="border-b border-gray-50 last:border-0">
              <td className="px-3 py-2 font-semibold text-gray-800">{f.nombre}</td>
              {mostrarTienda && <td className="px-3 py-2 text-gray-600">{f.bodega_nombre}</td>}
              {columnas.map(([t, render]) => <td key={t} className="px-3 py-2 text-right tabular-nums text-gray-600">{render(f)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Th({ children, right, className = '' }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <th className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-gray-400 ${right ? 'text-right' : 'text-left'} ${className}`}>{children}</th>
}
