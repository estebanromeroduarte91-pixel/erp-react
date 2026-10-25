import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useReposicionSugerida, useCrearOC, useIncrementarContadorOC } from '@/lib/queries'
import {
  claveFila, comprasPorProveedor, secciones, trasladosPorRuta,
  type FilaReposicion, type TrasladoSugerido,
} from '@/lib/reposicion'
import { fechaLocal } from '@/lib/fecha'
import { describirError } from '@/lib/errorUtils'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import { ModalTraslado } from './MovimientosTab'
import type { OC } from '@/types'

const IVA = 0.19
const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
const uds = (n: number) => Math.round(n).toLocaleString('es-CL')
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

// Cada estado lleva símbolo y texto, no solo color (rojo/verde no pasa el
// chequeo de daltonismo; ver Valor de inventario).
const CHIP = {
  agotado: { txt: '✕ Agotado', cls: 'bg-red-50 text-red-700' },
  reponer: { txt: '↓ Bajo el mínimo', cls: 'bg-amber-50 text-amber-800' },
  trasladar: { cls: 'bg-blue-50 text-blue-700' },
  comprar: { cls: 'bg-gray-100 text-gray-800' },
}

export function ReposicionTab() {
  const { data, isLoading, error, refetch } = useReposicionSugerida()
  const [bodegaId, setBodegaId] = useState<string | null>(null)
  const [descartadas, setDescartadas] = useState<Set<string>>(new Set())
  const [traslado, setTraslado] = useState<TrasladoSugerido | null>(null)
  const [confirmarOC, setConfirmarOC] = useState(false)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  const s = useMemo(() => secciones(data?.filas ?? [], bodegaId), [data, bodegaId])
  const elegidas = useMemo(() => s.pedir.filter(f => !descartadas.has(claveFila(f))), [s.pedir, descartadas])
  const compras = useMemo(() => comprasPorProveedor(elegidas), [elegidas])
  const traslados = useMemo(() => trasladosPorRuta(elegidas), [elegidas])

  const kpi = useMemo(() => {
    const resumen = (data?.resumen ?? []).filter(r => !bodegaId || r.bodega_id === bodegaId)
    return {
      montoCompra: compras.reduce((a, c) => a + c.total_neto, 0),
      unidadesCompra: compras.reduce((a, c) => a + c.unidades, 0),
      unidadesTraslado: traslados.reduce((a, t) => a + t.unidades, 0),
      inmovilizado: resumen.reduce((a, r) => a + (+r.monto_inmovilizado || 0), 0),
    }
  }, [data, bodegaId, compras, traslados])

  if (isLoading) return <div className="py-16"><Spinner /></div>
  if (error) {
    const sinPermiso = /permiso|encargados/i.test((error as Error).message)
    return (
      <div className="py-14 text-center text-sm text-gray-500">
        {sinPermiso
          ? 'La reposición la ven el administrador y los encargados.'
          : `No se pudo calcular la reposición: ${(error as Error).message}`}
      </div>
    )
  }
  if (!data) return null

  const p = data.parametros
  const alternar = (f: FilaReposicion) => setDescartadas(prev => {
    const n = new Set(prev)
    const k = claveFila(f)
    if (n.has(k)) n.delete(k); else n.add(k)
    return n
  })

  return (
    <div className="flex flex-col gap-3 pb-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-xs text-gray-500 m-0 max-w-2xl">
          Según lo vendido en los últimos {p.dias_historia} días · stock para {p.dias_objetivo} días ·
          se repone lo que se vendió en {p.min_ventas} o más ventas y cuesta menos de {clp(p.costo_bajo_pedido)} neto;
          lo demás se compra bajo pedido.
        </p>
        <div className="flex gap-0.5 bg-gray-200/70 p-[3px] rounded-[10px]">
          {[{ id: null, nombre: 'Todas' }, ...data.sucursales].map(b => (
            <button key={b.id ?? 'todas'} onClick={() => setBodegaId(b.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition ${bodegaId === b.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {b.nombre}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <div className={`rounded-lg border px-3 py-2 text-xs font-medium flex justify-between gap-3 ${aviso.tipo === 'ok' ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-red-50 border-red-100 text-red-700'}`}>
          <span>{aviso.texto}</span>
          <button onClick={() => setAviso(null)} aria-label="Cerrar aviso" className="opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi label="Comprar" valor={clp(kpi.montoCompra)} sub={`${uds(kpi.unidadesCompra)} unidades · ${compras.length} ${compras.length === 1 ? 'proveedor' : 'proveedores'}`} />
        <Kpi label="Trasladar" valor={`${uds(kpi.unidadesTraslado)} u.`} sub={traslados.length ? traslados.map(t => `${t.origen_nombre} → ${t.destino_nombre}`).join(' · ') : 'Nada que mover'} />
        <Kpi label="Corregir stock" valor={String(s.corregir.length)} sub="productos en negativo" />
        <Kpi label="Plata parada" valor={clp(kpi.inmovilizado)} sub={`${s.plataParada.filter(f => f.estado === 'sin_movimiento').length} sin venta en 90 días`} />
      </div>

      <section className="rounded-xl border border-gray-200 bg-white overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div>
            <h3 className="text-sm font-extrabold text-gray-900 m-0">Pedir esta semana</h3>
            <p className="text-[11px] text-gray-400 mt-0.5 mb-0">Primero se traslada lo que sobra en otra tienda; el resto se compra</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {traslados.map(t => (
              <button key={`${t.origen_id}>${t.destino_id}`} onClick={() => setTraslado(t)}
                className="px-3 py-2 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-800 hover:bg-gray-50">
                Crear traslado {t.origen_nombre} → {t.destino_nombre} ({uds(t.unidades)} u.)
              </button>
            ))}
            {compras.length > 0 && (
              <button onClick={() => setConfirmarOC(true)}
                className="px-3 py-2 text-xs font-bold rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                Crear {compras.length === 1 ? 'orden de compra' : `${compras.length} órdenes de compra`}
              </button>
            )}
          </div>
        </div>
        {s.pedir.length === 0 ? (
          <p className="py-10 text-center text-sm text-gray-400 m-0">No hay nada que pedir. Todo lo que rota tiene stock para {p.dias_objetivo} días.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-100">
                  <Th className="w-8" /><Th>Producto</Th>{!bodegaId && <Th>Tienda</Th>}<Th right>Stock</Th><Th right>Vendió {p.dias_historia}d</Th><Th>Qué hacer</Th>
                </tr>
              </thead>
              <tbody>
                {s.pedir.map(f => {
                  const marcada = !descartadas.has(claveFila(f))
                  return (
                    <tr key={claveFila(f)} className={`border-b border-gray-50 last:border-0 ${marcada ? '' : 'opacity-45'}`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={marcada} onChange={() => alternar(f)} aria-label={`Incluir ${f.nombre}`} className="rounded border-gray-300 text-blue-600" />
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="font-bold text-gray-800">{f.nombre}</div>
                        <div className="text-[11px] text-gray-400">{[f.proveedor?.nombre?.trim(), f.costo_unitario > 0 ? `${clp(f.costo_unitario)} neto` : null].filter(Boolean).join(' · ') || 'Sin proveedor registrado'}</div>
                      </td>
                      {!bodegaId && <td className="px-3 py-2.5 text-gray-600">{f.bodega_nombre}</td>}
                      <td className="px-3 py-2.5 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-md font-bold tabular-nums ${f.stock <= 0 ? CHIP.agotado.cls : CHIP.reponer.cls}`}>
                          {f.stock <= 0 ? '✕' : '↓'} {uds(f.stock)}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">{uds(f.vendidas_periodo)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {f.trasladar > 0 && <span className={`px-2 py-0.5 rounded-md font-bold ${CHIP.trasladar.cls}`}>⇄ Trasladar {uds(f.trasladar)}</span>}
                          {f.trasladar > 0 && f.trasladar_desde && <span className="text-[11px] text-gray-400">desde {f.trasladar_desde.nombre}</span>}
                          {f.comprar > 0 && <span className={`px-2 py-0.5 rounded-md font-bold ${CHIP.comprar.cls}`}>＋ Comprar {uds(f.comprar)}</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Plegable titulo="⚠ Corregir stock antes de comprar" cuenta={s.corregir.length}
        bajada="Se vendió más de lo registrado, así que no se sabe cuánto hay. Haz un conteo o ingresa la compra; recién ahí entra a la lista de pedido.">
        <TablaSimple filas={s.corregir} mostrarTienda={!bodegaId} columnas={[
          ['Stock', f => <span className="font-bold text-red-700 tabular-nums">{uds(f.stock)}</span>],
          [`Vendió ${p.dias_historia}d`, f => uds(f.vendidas_periodo)],
        ]} />
      </Plegable>

      {s.enCamino.length > 0 && (
        <Plegable titulo="En camino" cuenta={s.enCamino.length} bajada="Agotado, pero ya hay una orden de compra pendiente.">
          <TablaSimple filas={s.enCamino} mostrarTienda={!bodegaId} columnas={[
            ['Viene', f => uds(f.ya_viene)],
            ['Orden', f => (f.ocs_pendientes ?? []).join(', ')],
          ]} />
        </Plegable>
      )}

      <Plegable titulo="Bajo pedido" cuenta={s.bajoPedido.length}
        bajada={`Caros (desde ${clp(p.costo_bajo_pedido)}) o de poca rotación: se compran cuando entra la reparación.`}>
        <TablaSimple filas={s.bajoPedido} mostrarTienda={!bodegaId} columnas={[
          ['Costo', f => clp(f.costo_unitario)],
          ['Ventas', f => uds(f.ventas_distintas)],
          ['Motivo', f => f.motivo_bajo_pedido === 'caro' ? 'Caro' : 'Poca rotación'],
        ]} />
      </Plegable>

      <Plegable titulo="Plata parada" cuenta={s.plataParada.length} monto={kpi.inmovilizado}
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
            origenId: traslado.origen_id,
            destinoId: traslado.destino_id,
            lineas: traslado.lineas,
            notas: `Reposición: ${traslado.origen_nombre} → ${traslado.destino_nombre}`,
          }}
          onClose={() => { setTraslado(null); void refetch() }}
        />
      )}

      {confirmarOC && (
        <ConfirmarCompras
          compras={compras}
          onCerrar={() => setConfirmarOC(false)}
          onCreadas={numeros => {
            setConfirmarOC(false)
            setAviso({ tipo: 'ok', texto: `Órdenes creadas en borrador: ${numeros.join(', ')}. Revísalas en Compras antes de enviarlas.` })
            void refetch()
          }}
          onError={texto => setAviso({ tipo: 'error', texto })}
        />
      )}
    </div>
  )
}

function ConfirmarCompras({ compras, onCerrar, onCreadas, onError }: {
  compras: ReturnType<typeof comprasPorProveedor>
  onCerrar: () => void
  onCreadas: (numeros: string[]) => void
  onError: (texto: string) => void
}) {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const crearOC = useCrearOC()
  const contador = useIncrementarContadorOC()
  const [creando, setCreando] = useState(false)

  async function crear() {
    setCreando(true)
    const numeros: string[] = []
    try {
      for (const c of compras) {
        const n = await contador.mutateAsync()
        const items = c.lineas.map(l => {
          const conIva = Math.round(l.costo_neto * (1 + IVA))
          return {
            id: uid(), producto_id: l.producto_id, producto_nombre: l.producto_nombre, cantidad: l.cantidad,
            precio_neto: l.costo_neto, precio_iva: conIva, precio_unitario: l.costo_neto,
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
          notas: 'Creada desde Reposición sugerida',
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
          <h3 className="text-base font-extrabold text-gray-900 m-0">Crear órdenes de compra</h3>
          <p className="text-xs text-gray-500 mt-1 mb-0">Quedan en <b>borrador</b>: puedes revisarlas y editarlas en Compras antes de enviarlas.</p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {compras.map(c => (
            <div key={c.proveedor_id || 'sin'} className="rounded-lg border border-gray-200">
              <div className="flex justify-between gap-3 px-3 py-2 border-b border-gray-100 text-xs">
                <span className="font-bold text-gray-800">{c.proveedor_nombre || 'Sin proveedor (elígelo en Compras)'}</span>
                <span className="font-bold tabular-nums text-gray-700">{clp(c.total_neto)} neto</span>
              </div>
              <ul className="m-0 px-3 py-2 list-none text-xs text-gray-600 flex flex-col gap-1">
                {c.lineas.map(l => (
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
            {creando ? 'Creando…' : `Crear ${compras.length === 1 ? 'orden' : `${compras.length} órdenes`}`}
          </button>
        </div>
      </div>
    </div>
  )
}

function Kpi({ label, valor, sub }: { label: string; valor: string; sub: string }) {
  return (
    <article className="min-w-0 p-4 rounded-xl border border-gray-200 bg-white">
      <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
      <strong className="block mt-1.5 text-xl font-extrabold tracking-tight text-gray-900 truncate">{valor}</strong>
      <div className="mt-1 text-[11px] text-gray-400 truncate" title={sub}>{sub}</div>
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
      <table className="w-full min-w-[520px] text-xs border-collapse">
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
