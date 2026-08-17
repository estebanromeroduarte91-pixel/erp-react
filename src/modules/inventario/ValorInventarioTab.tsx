import { useMemo } from 'react'
import { useProductos, useBodegas, useLotes } from '@/lib/queries'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import type { LoteInventario } from '@/types'

const SIN_SUCURSAL = '__sin_sucursal__'

// Mismo criterio de costeo que POSTab.tsx al vender: valorizar con el costo
// real de los lotes FIFO que quedan (cantidad_restante × costo_unitario), y
// solo recurrir al precio_compra actual para la parte del stock que no tiene
// ningún lote detrás (aperturas manuales, ajustes, o productos cargados antes
// de que existiera el costeo por lote). Es una valorización, no un consumo:
// no importa el orden de los lotes, solo se suma lo que queda de cada uno.
function valorizarStock(productos: ReturnType<typeof useProductos>['data'], lotes: LoteInventario[] | undefined) {
  const porSucursal = new Map<string, number>()
  if (!productos) return { porSucursal, total: 0 }

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
    for (const [bodegaId, cantidad] of Object.entries(p.stock_sucursales)) {
      if (!cantidad) continue
      const lotesProd = lotesPorClave.get(`${p.id}|${bodegaId}`) ?? []
      const cantidadEnLotes = lotesProd.reduce((s, l) => s + l.cantidad_restante, 0)
      const valorLotes = lotesProd.reduce((s, l) => s + l.cantidad_restante * l.costo_unitario, 0)
      const faltante = Math.max(0, cantidad - cantidadEnLotes)
      const valor = valorLotes + faltante * (p.precio_compra ?? 0)
      const clave = bodegaId || SIN_SUCURSAL
      porSucursal.set(clave, (porSucursal.get(clave) ?? 0) + valor)
      total += valor
    }
  }
  return { porSucursal, total }
}

export function ValorInventarioTab() {
  const { data: productos, isLoading: cargandoProductos } = useProductos()
  const { data: bodegas = [] } = useBodegas()
  const { data: lotes, isLoading: cargandoLotes } = useLotes()

  const { porSucursal, total } = useMemo(
    () => valorizarStock(productos, lotes),
    [productos, lotes],
  )

  const filas = useMemo(() => {
    const conNombre = [...porSucursal.entries()].map(([id, valor]) => {
      const bodega = bodegas.find((b) => b.id === id)
      const nombre = id === SIN_SUCURSAL ? 'Sin sucursal / bodega no encontrada' : (bodega?.nombre ?? bodega?.name ?? id)
      return { id, nombre, valor }
    })
    return conNombre.sort((a, b) => b.valor - a.valor)
  }, [porSucursal, bodegas])

  if (cargandoProductos || cargandoLotes) {
    return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>
  }

  const max = Math.max(1, ...filas.map((f) => f.valor))

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Total invertido en inventario</p>
        <p className="text-3xl font-bold text-gray-900"><Money value={total} /></p>
        <p className="text-xs text-gray-400 mt-2">
          Costo real de lo que queda en stock (costeo FIFO por lote; el precio de compra actual solo se usa como
          respaldo para el stock que no tiene un lote asociado).
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Por sucursal</p>
        {filas.length === 0 ? (
          <p className="text-sm text-gray-400">No hay stock valorizado todavía.</p>
        ) : (
          <div className="space-y-4">
            {filas.map((f) => (
              <div key={f.id}>
                <div className="flex items-center justify-between mb-1.5 text-sm">
                  <span className="font-medium text-gray-700">{f.nombre}</span>
                  <span className="font-semibold text-gray-900"><Money value={f.valor} /></span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-blue-600"
                    style={{ width: `${Math.max(2, (f.valor / max) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
