import { useState, useMemo } from 'react'
import { useProductos, useBodegas, useGuardarProductos } from '@/lib/queries'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import { ProductoModal } from './ProductoModal'
import type { Producto } from '@/types'

function stockTotal(p: Producto): number {
  if (p.stock_sucursales && Object.keys(p.stock_sucursales).length > 0)
    return Object.values(p.stock_sucursales).reduce((s, v) => s + (Number(v) || 0), 0)
  return Number(p.stock) || 0
}

export function ProductosTab() {
  const { data: productos, isLoading } = useProductos()
  const { data: bodegas } = useBodegas()
  const guardar = useGuardarProductos()

  const [busqueda, setBusqueda] = useState('')
  const [filtroCat, setFiltroCat] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Producto | null>(null)

  const categorias = useMemo(
    () => [...new Set((productos ?? []).map((p) => p.categoria).filter(Boolean))].sort() as string[],
    [productos],
  )

  const lista = useMemo(() => {
    let r = productos ?? []
    if (filtroCat) r = r.filter((p) => p.categoria === filtroCat)
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(
        (p) => p.nombre.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q),
      )
    }
    return r
  }, [productos, filtroCat, busqueda])

  function abrirNuevo() { setEditando(null); setModalOpen(true) }
  function abrirEditar(p: Producto) { setEditando(p); setModalOpen(true) }

  async function eliminar(p: Producto) {
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return
    await guardar.mutateAsync((productos ?? []).filter((x) => x.id !== p.id))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar producto o SKU..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>

        <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 focus:outline-none focus:border-blue-400">
          <option value="">Todas las categorías</option>
          {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>

        <button onClick={abrirNuevo}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition ml-auto">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo producto
        </button>
      </div>

      {/* Contador */}
      <p className="text-xs text-gray-400 mb-2 px-1">{lista.length} productos</p>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {busqueda || filtroCat ? 'Sin resultados' : 'No hay productos todavía'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Costo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio venta</th>
                  {(bodegas ?? []).length > 0 ? (
                    (bodegas ?? []).map((b) => (
                      <th key={b.id} className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {b.nombre ?? b.name}
                      </th>
                    ))
                  ) : (
                    <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Stock</th>
                  )}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku || '—'}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{p.nombre}</p>
                      {p.descripcion && <p className="text-xs text-gray-400 truncate max-w-48">{p.descripcion}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{p.categoria || '—'}</td>
                    <td className="px-4 py-3 text-right text-gray-600">
                      {p.precio_compra ? <Money value={p.precio_compra} /> : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-green-700">
                      {p.precio_venta ? <Money value={p.precio_venta} /> : '—'}
                    </td>
                    {(bodegas ?? []).length > 0 ? (
                      (bodegas ?? []).map((b) => (
                        <td key={b.id} className="px-4 py-3 text-right">
                          <StockBadge value={p.stock_sucursales?.[b.id] ?? 0} min={p.stock_min} />
                        </td>
                      ))
                    ) : (
                      <td className="px-4 py-3 text-right">
                        <StockBadge value={stockTotal(p)} min={p.stock_min} />
                      </td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => abrirEditar(p)}
                          className="text-xs text-blue-600 hover:underline font-medium">Editar</button>
                        <button onClick={() => eliminar(p)}
                          className="text-xs text-red-500 hover:underline font-medium">Eliminar</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <ProductoModal
          producto={editando}
          productos={productos ?? []}
          bodegas={bodegas ?? []}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  )
}

function StockBadge({ value, min }: { value: number | undefined; min?: number }) {
  const n = Number(value) || 0
  const bajo = min != null && n <= min
  return (
    <span className={[
      'inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-semibold',
      bajo ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700',
    ].join(' ')}>
      {n}
    </span>
  )
}
