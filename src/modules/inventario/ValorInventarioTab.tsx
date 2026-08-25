import { useMemo, useState } from 'react'
import { useProductos, useBodegas, useLotes } from '@/lib/queries'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import type { LoteInventario } from '@/types'

const SIN_SUCURSAL = '__sin_sucursal__'
const SIN_CATEGORIA = 'Sin categoría'
const SIN_SUBCATEGORIA = 'Sin subcategoría'

// Rojo + verde validados con el script del dataviz skill para que la
// diferencia se note incluso con daltonismo rojo-verde (separados por
// luminosidad, no solo por matiz: CVD deutan ΔE 17.5, normal-vision 29.2).
// Del tercer color en adelante no hay validación formal — son de respaldo
// para empresas con más de 2 sucursales; si eso se vuelve común vale la
// pena correr el validador con el set completo.
const PALETA = ['#8f2f2f', '#5a9c3f', '#b8873a', '#4a56ad', '#2f7d7d', '#8a4f9e']
const PALETA_TINT = ['#f5e6e6', '#e8f0e2', '#f6ecdb', '#e9eaf6', '#e3efef', '#f1e6f4']
const COLOR_SIN_SUCURSAL = '#a2a8b4'
const TINT_SIN_SUCURSAL = '#eceef2'

type FilaSucursal = { id: string; nombre: string; valor: number; productos: number; color: string; tint: string }
type NodoCategoria = { valor: number; sub: Map<string, number> }

// Mismo criterio de costeo que POSTab.tsx al vender: valorizar con el costo
// real de los lotes FIFO que quedan (cantidad_restante × costo_unitario), y
// solo recurrir al precio_compra actual para la parte del stock que no tiene
// ningún lote detrás (aperturas manuales, ajustes, o productos cargados antes
// de que existiera el costeo por lote). Es una valorización, no un consumo:
// no importa el orden de los lotes, solo se suma lo que queda de cada uno.
function valorizarStock(productos: ReturnType<typeof useProductos>['data'], lotes: LoteInventario[] | undefined) {
  const valorPorSucursal = new Map<string, number>()
  const productosPorSucursal = new Map<string, number>()
  const detallePorSucursal = new Map<string, Map<string, NodoCategoria>>()
  if (!productos) return { valorPorSucursal, productosPorSucursal, detallePorSucursal, total: 0 }

  const lotesPorClave = new Map<string, LoteInventario[]>()
  for (const l of lotes ?? []) {
    if (l.cantidad_restante <= 0) continue
    const clave = `${l.producto_id}|${l.bodega_id}`
    const arr = lotesPorClave.get(clave)
    if (arr) arr.push(l)
    else lotesPorClave.set(clave, [l])
  }

  let total = 0
  for (const p of productos) {
    if (p.tipo === 'servicio' || !p.stock_sucursales) continue
    const categoria = p.categoria?.trim() || SIN_CATEGORIA
    const subcategoria = p.subcategoria?.trim() || SIN_SUBCATEGORIA
    for (const [bodegaId, cantidad] of Object.entries(p.stock_sucursales)) {
      if (!cantidad) continue
      const clave = bodegaId || SIN_SUCURSAL
      const lotesProd = lotesPorClave.get(`${p.id}|${bodegaId}`) ?? []
      const cantidadEnLotes = lotesProd.reduce((s, l) => s + l.cantidad_restante, 0)
      const valorLotes = lotesProd.reduce((s, l) => s + l.cantidad_restante * l.costo_unitario, 0)
      const faltante = Math.max(0, cantidad - cantidadEnLotes)
      const valor = valorLotes + faltante * (p.precio_compra ?? 0)

      valorPorSucursal.set(clave, (valorPorSucursal.get(clave) ?? 0) + valor)
      productosPorSucursal.set(clave, (productosPorSucursal.get(clave) ?? 0) + 1)
      total += valor

      let detalle = detallePorSucursal.get(clave)
      if (!detalle) { detalle = new Map(); detallePorSucursal.set(clave, detalle) }
      let nodo = detalle.get(categoria)
      if (!nodo) { nodo = { valor: 0, sub: new Map() }; detalle.set(categoria, nodo) }
      nodo.valor += valor
      nodo.sub.set(subcategoria, (nodo.sub.get(subcategoria) ?? 0) + valor)
    }
  }
  return { valorPorSucursal, productosPorSucursal, detallePorSucursal, total }
}

function BarraFila({
  nombre, valor, base, color, onClick, drillable,
}: { nombre: string; valor: number; base: number; color: string; onClick?: () => void; drillable?: boolean }) {
  const pct = base > 0 ? (valor / base) * 100 : 0
  return (
    <div className={`mb-4 last:mb-0 ${onClick ? 'cursor-pointer group' : ''}`} onClick={onClick}>
      <div className="flex items-center justify-between mb-1.5 text-sm">
        <span className="font-medium text-gray-700 flex items-center gap-1 group-hover:underline">
          {nombre}
          {drillable && (
            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
            </svg>
          )}
        </span>
        <span className="font-semibold text-gray-900 tabular-nums">
          <Money value={valor} /> <span className="text-gray-400 font-medium">· {pct.toFixed(1)}%</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, pct)}%`, background: color }} />
      </div>
    </div>
  )
}

export function ValorInventarioTab() {
  const { data: productos, isLoading: cargandoProductos } = useProductos()
  const { data: bodegas = [] } = useBodegas()
  const { data: lotes, isLoading: cargandoLotes } = useLotes()

  const [modalSucursal, setModalSucursal] = useState<string | null>(null)
  const [modalCategoria, setModalCategoria] = useState<string | null>(null)

  const { valorPorSucursal, productosPorSucursal, detallePorSucursal, total } = useMemo(
    () => valorizarStock(productos, lotes),
    [productos, lotes],
  )

  // El color se asigna por la POSICIÓN de la sucursal en `bodegas` (estable),
  // no por su ranking de valor: así una sucursal no cambia de color solo
  // porque otra la superó este mes.
  const colorDeSucursal = useMemo(() => {
    const mapa = new Map<string, { color: string; tint: string }>()
    bodegas.forEach((b, i) => mapa.set(b.id, { color: PALETA[i % PALETA.length], tint: PALETA_TINT[i % PALETA_TINT.length] }))
    return mapa
  }, [bodegas])

  const filas = useMemo<FilaSucursal[]>(() => {
    const conNombre = [...valorPorSucursal.entries()].map(([id, valor]) => {
      const bodega = bodegas.find((b) => b.id === id)
      const nombre = id === SIN_SUCURSAL ? 'Sin sucursal / bodega no encontrada' : (bodega?.nombre ?? bodega?.name ?? id)
      const { color, tint } = colorDeSucursal.get(id) ?? { color: COLOR_SIN_SUCURSAL, tint: TINT_SIN_SUCURSAL }
      return { id, nombre, valor, productos: productosPorSucursal.get(id) ?? 0, color, tint }
    })
    return conNombre.sort((a, b) => b.valor - a.valor)
  }, [valorPorSucursal, productosPorSucursal, bodegas, colorDeSucursal])

  if (cargandoProductos || cargandoLotes) {
    return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
  }

  if (filas.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-sm text-gray-400">
        No hay stock valorizado todavía.
      </div>
    )
  }

  const max = Math.max(1, ...filas.map((f) => f.valor))

  // Segmentos del donut: circunferencia de un círculo r=15.9 en un viewBox de
  // 36×36 ≈ 100 unidades, así el % se usa directo en stroke-dasharray.
  const segmentos = filas.reduce<{
    acumulado: number
    filas: Array<FilaSucursal & { pct: number; offset: number }>
  }>((estado, f) => {
    const pct = total > 0 ? (f.valor / total) * 100 : 0
    return {
      acumulado: estado.acumulado + pct,
      filas: [...estado.filas, { ...f, pct, offset: -estado.acumulado }],
    }
  }, { acumulado: 0, filas: [] }).filas

  const filaSucursalAbierta = modalSucursal ? filas.find((f) => f.id === modalSucursal) : undefined
  const categoriasAbiertas = modalSucursal ? detallePorSucursal.get(modalSucursal) : undefined
  const categoriasOrdenadas = categoriasAbiertas
    ? [...categoriasAbiertas.entries()].sort((a, b) => b[1].valor - a[1].valor)
    : []
  const nodoCategoriaAbierta = modalCategoria && categoriasAbiertas ? categoriasAbiertas.get(modalCategoria) : undefined
  const subOrdenadas = nodoCategoriaAbierta ? [...nodoCategoriaAbierta.sub.entries()].sort((a, b) => b[1] - a[1]) : []

  function abrirModal(id: string) {
    setModalSucursal(id)
    setModalCategoria(null)
  }
  function cerrarModal() {
    setModalSucursal(null)
    setModalCategoria(null)
  }

  return (
    <div className="space-y-4">
      {/* Total + donut de participación */}
      <div className="grid md:grid-cols-5 gap-4">
        <div className="md:col-span-3 bg-white rounded-2xl border border-gray-200 p-6 flex flex-col justify-center">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: filas[0].tint }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={filas[0].color} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20 7L12 3 4 7m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total invertido en inventario</p>
          </div>
          <p className="text-3xl md:text-4xl font-bold text-gray-900"><Money value={total} /></p>
          <p className="text-xs text-gray-400 mt-3 leading-relaxed">
            Costo real de lo que queda en stock (costeo FIFO por lote; el precio de compra actual solo se usa como
            respaldo para el stock que no tiene un lote asociado).
          </p>
        </div>

        <div className="md:col-span-2 bg-white rounded-2xl border border-gray-200 p-6 flex items-center gap-5">
          <div className="relative shrink-0" style={{ width: 104, height: 104 }}>
            <svg viewBox="0 0 36 36" width={104} height={104} style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="#eceef2" strokeWidth={4.5} />
              {segmentos.map((s) => (
                <circle
                  key={s.id} cx="18" cy="18" r="15.9" fill="none" stroke={s.color} strokeWidth={4.5}
                  strokeDasharray={`${s.pct} 100`} strokeDashoffset={s.offset} strokeLinecap="butt"
                />
              ))}
            </svg>
            <div className="absolute inset-0 flex items-center justify-center text-center px-2">
              <span className="text-[10px] font-semibold text-gray-400">{filas.length} sucursal{filas.length === 1 ? '' : 'es'}</span>
            </div>
          </div>
          <div className="flex-1 space-y-2 text-sm min-w-0">
            {filas.map((f) => (
              <div key={f.id} className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: f.color }} />
                <span className="flex-1 truncate text-gray-700">{f.nombre}</span>
                <span className="font-semibold text-gray-900 tabular-nums">
                  {total > 0 ? ((f.valor / total) * 100).toFixed(1) : '0.0'}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tiles por sucursal — clickeables: abren el desglose por categoría */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filas.map((f) => (
          <button
            key={f.id} onClick={() => abrirModal(f.id)}
            className="text-left bg-white rounded-2xl border border-gray-200 p-4 flex items-center gap-4 transition hover:shadow-md hover:border-gray-300"
          >
            <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: f.tint }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke={f.color} strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-gray-700 truncate">{f.nombre}</p>
                <p className="text-xs font-semibold text-gray-400 tabular-nums shrink-0">
                  {total > 0 ? ((f.valor / total) * 100).toFixed(1) : '0.0'}%
                </p>
              </div>
              <p className="text-xl font-bold text-gray-900 tabular-nums leading-tight"><Money value={f.valor} /></p>
              <div className="flex items-center gap-1.5 mt-1">
                <svg className="w-3.5 h-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7L12 3 4 7m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
                <span className="text-xs text-gray-400 tabular-nums">{f.productos} producto{f.productos === 1 ? '' : 's'} con stock</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Ranking en barras — también clickeable */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-5">Ranking por sucursal</p>
        <div className="space-y-4">
          {filas.map((f) => (
            <div
              key={f.id} onClick={() => abrirModal(f.id)}
              className="grid grid-cols-[160px_1fr_96px] items-center gap-3.5 group cursor-pointer"
            >
              <span className="text-sm font-medium text-gray-700 truncate group-hover:underline">{f.nombre}</span>
              <div className="relative h-2.5 rounded-full bg-gray-100 overflow-visible">
                <div
                  className="h-full rounded-full transition-[filter] group-hover:brightness-110"
                  style={{ width: `${Math.max(2, (f.valor / max) * 100)}%`, background: f.color }}
                />
                <div
                  className="absolute bottom-full mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-gray-800 px-2.5 py-1.5 text-[11px] leading-tight text-white opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 z-10"
                  style={{ left: `${Math.max(2, (f.valor / max) * 100)}%` }}
                >
                  <Money value={f.valor} /> · {total > 0 ? ((f.valor / total) * 100).toFixed(1) : '0.0'}% del total
                </div>
              </div>
              <span className="text-sm font-semibold text-gray-900 tabular-nums text-right"><Money value={f.valor} /></span>
            </div>
          ))}
        </div>
      </div>

      {/* Modal: desglose por categoría / subcategoría */}
      {filaSucursalAbierta && (
        <div
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) cerrarModal() }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[85vh]">
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">{filaSucursalAbierta.nombre}</h3>
                <p className="text-xs text-gray-400 mt-0.5 tabular-nums">
                  {modalCategoria && nodoCategoriaAbierta
                    ? <><Money value={nodoCategoriaAbierta.valor} /> invertidos en {modalCategoria}</>
                    : <><Money value={filaSucursalAbierta.valor} /> invertidos en esta sucursal</>}
                </p>
              </div>
              <button onClick={cerrarModal} className="text-gray-400 hover:text-gray-600 p-1 -mr-1 -mt-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-6 pt-4 text-xs font-semibold uppercase tracking-wide">
              {modalCategoria ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setModalCategoria(null)}
                    className="inline-flex items-center gap-1 hover:underline"
                    style={{ color: filaSucursalAbierta.color }}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                    </svg>
                    Categorías
                  </button>
                  <span className="text-gray-300 normal-case">/</span>
                  <span className="text-gray-700 normal-case">{modalCategoria}</span>
                </div>
              ) : (
                <span className="text-gray-400">Categorías</span>
              )}
            </div>

            <div className="px-6 py-4 overflow-y-auto">
              {!modalCategoria ? (
                categoriasOrdenadas.length === 0 ? (
                  <p className="text-sm text-gray-400">Sin productos categorizados en esta sucursal.</p>
                ) : (
                  categoriasOrdenadas.map(([nombre, nodo]) => {
                    const drillable = nodo.sub.size > 1 || (nodo.sub.size === 1 && !nodo.sub.has(SIN_SUBCATEGORIA))
                    return (
                      <BarraFila
                        key={nombre} nombre={nombre} valor={nodo.valor} base={filaSucursalAbierta.valor}
                        color={filaSucursalAbierta.color} drillable={drillable}
                        onClick={drillable ? () => setModalCategoria(nombre) : undefined}
                      />
                    )
                  })
                )
              ) : (
                subOrdenadas.map(([nombre, valor]) => (
                  <BarraFila
                    key={nombre} nombre={nombre} valor={valor}
                    base={nodoCategoriaAbierta?.valor ?? 0} color={filaSucursalAbierta.color}
                  />
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
