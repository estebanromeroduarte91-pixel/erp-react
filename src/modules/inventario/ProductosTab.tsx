import { useState, useMemo } from 'react'
import { useProductos, useBodegas, useGuardarProductos } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import { ProductoModal } from './ProductoModal'
import type { Producto } from '@/types'

function stockTotal(p: Producto): number {
  if (p.stock_sucursales && Object.keys(p.stock_sucursales).length > 0)
    return Object.values(p.stock_sucursales).reduce((s, v) => s + (Number(v) || 0), 0)
  return Number(p.stock) || 0
}

function stockSucursal(p: Producto, bodegaId: string): number {
  return Number(p.stock_sucursales?.[bodegaId]) || 0
}

export function ProductosTab() {
  const { data: productos, isLoading } = useProductos()
  const { data: bodegas } = useBodegas()
  const guardar = useGuardarProductos()
  const { esAdmin } = useAuth()

  const [busqueda, setBusqueda]     = useState('')
  const [filtroBodega, setFiltroBodega] = useState('')
  const [filtroCat, setFiltroCat]   = useState('')
  const [filtroSub, setFiltroSub]   = useState('')
  const [bajosStock, setBajosStock] = useState(false)
  const [modalOpen, setModalOpen]   = useState(false)
  const [editando, setEditando]     = useState<Producto | null>(null)

  const categorias = useMemo(
    () => [...new Set((productos ?? []).map((p) => p.categoria).filter(Boolean))].sort() as string[],
    [productos],
  )

  // Subcategorías disponibles según la categoría seleccionada
  const subcategorias = useMemo(() => {
    const base = (productos ?? []).filter(p => !filtroCat || p.categoria === filtroCat)
    return [...new Set(base.map(p => p.subcategoria).filter(Boolean))].sort() as string[]
  }, [productos, filtroCat])

  const lista = useMemo(() => {
    let r = productos ?? []
    // filtroBodega solo cambia la columna de stock visible, no filtra productos
    if (filtroCat)  r = r.filter(p => p.categoria === filtroCat)
    if (filtroSub)  r = r.filter(p => p.subcategoria === filtroSub)
    if (bajosStock) r = r.filter(p => {
      const st = filtroBodega ? stockSucursal(p, filtroBodega) : stockTotal(p)
      return st <= (p.stock_min ?? 0)
    })
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(p => p.nombre.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
    }
    return r
  }, [productos, filtroBodega, filtroCat, filtroSub, bajosStock, busqueda])

  const hayFiltros = !!(filtroBodega || filtroCat || filtroSub || bajosStock || busqueda)

  function limpiarFiltros() {
    setBusqueda(''); setFiltroBodega(''); setFiltroCat(''); setFiltroSub(''); setBajosStock(false)
  }

  function cambiarCat(cat: string) {
    setFiltroCat(cat)
    setFiltroSub('')  // reset subcat cuando cambia la cat
  }

  function abrirNuevo()         { setEditando(null);  setModalOpen(true) }
  function abrirEditar(p: Producto) { setEditando(p); setModalOpen(true) }

  async function eliminar(p: Producto) {
    if (!esAdmin) return
    if (!confirm(`¿Eliminar "${p.nombre}"?`)) return
    await guardar.mutateAsync((productos ?? []).filter(x => x.id !== p.id))
  }

  async function eliminarTodo() {
    if (!esAdmin) return
    const total = (productos ?? []).length
    if (!confirm(`¿Eliminar los ${total} productos del inventario? Esta acción no se puede deshacer.`)) return
    await guardar.mutateAsync([])
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  const bdList = bodegas ?? []

  return (
    <div>
      {/* Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4">
        {/* Fila 1: búsqueda + botón */}
        <div className="flex flex-wrap gap-3 items-center mb-3">
          <div className="relative flex-1 min-w-48">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input type="text" value={busqueda} onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto o SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {esAdmin && (
              <button onClick={eliminarTodo}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Eliminar todo
              </button>
            )}
            <button onClick={abrirNuevo}
              className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Nuevo producto
            </button>
          </div>
        </div>

        {/* Fila 2: filtros */}
        <div className="flex flex-wrap gap-2 items-center">
          {/* Sucursal */}
          {bdList.length > 0 && (
            <select value={filtroBodega} onChange={e => setFiltroBodega(e.target.value)}
              className={[
                'text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400',
                filtroBodega ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 bg-gray-50',
              ].join(' ')}>
              <option value="">Todas las sucursales</option>
              {bdList.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
            </select>
          )}

          {/* Categoría */}
          <select value={filtroCat} onChange={e => cambiarCat(e.target.value)}
            className={[
              'text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400',
              filtroCat ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 bg-gray-50',
            ].join(' ')}>
            <option value="">Todas las categorías</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Subcategoría — solo visible si hay subcats disponibles */}
          {subcategorias.length > 0 && (
            <select value={filtroSub} onChange={e => setFiltroSub(e.target.value)}
              className={[
                'text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400',
                filtroSub ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 bg-gray-50',
              ].join(' ')}>
              <option value="">Todas las subcategorías</option>
              {subcategorias.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          )}

          {/* Bajo stock */}
          <button onClick={() => setBajosStock(v => !v)}
            className={[
              'inline-flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 font-medium transition',
              bajosStock
                ? 'border-red-400 bg-red-50 text-red-700'
                : 'border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100',
            ].join(' ')}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            Bajo stock
          </button>

          {/* Limpiar */}
          {hayFiltros && (
            <button onClick={limpiarFiltros}
              className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 transition px-2 py-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Limpiar filtros
            </button>
          )}

          <span className="ml-auto text-xs text-gray-400">
            {lista.length} de {(productos ?? []).length} productos
          </span>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <div className="py-16 text-center text-gray-400 text-sm">
            {hayFiltros ? (
              <div>
                <p className="mb-3">Sin resultados para los filtros seleccionados</p>
                <button onClick={limpiarFiltros}
                  className="text-blue-600 hover:underline text-sm font-medium">
                  Limpiar filtros
                </button>
              </div>
            ) : 'No hay productos todavía'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">SKU</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Categoría</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Subcategoría</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Costo</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Precio venta</th>
                  {/* Columnas de stock */}
                  {bdList.length > 0 ? (
                    // Si hay filtro de sucursal, muestra solo esa; si no, muestra todas
                    (filtroBodega ? bdList.filter(b => b.id === filtroBodega) : bdList).map(b => (
                      <th key={b.id} className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
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
                {lista.map(p => {
                  const displayBodegas = bdList.length > 0
                    ? (filtroBodega ? bdList.filter(b => b.id === filtroBodega) : bdList)
                    : []
                  return (
                    <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.sku || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{p.nombre}</p>
                        {p.descripcion && <p className="text-xs text-gray-400 truncate max-w-48">{p.descripcion}</p>}
                      </td>
                      <td className="px-4 py-3">
                        {p.categoria
                          ? <span className="text-xs bg-blue-50 text-blue-700 rounded-full px-2 py-0.5 font-medium">{p.categoria}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {p.subcategoria
                          ? <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-2 py-0.5 font-medium">{p.subcategoria}</span>
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-600">
                        {p.precio_compra ? <Money value={p.precio_compra} /> : '—'}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-green-700">
                        {p.precio_venta ? <Money value={p.precio_venta} /> : '—'}
                      </td>
                      {displayBodegas.length > 0 ? (
                        displayBodegas.map(b => (
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
                          {esAdmin && <button onClick={() => eliminar(p)}
                            className="text-xs text-red-500 hover:underline font-medium">Eliminar</button>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
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
