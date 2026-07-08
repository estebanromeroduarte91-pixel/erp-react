import { useState, useMemo, useRef } from 'react'
import * as XLSX from 'xlsx'
import { useProductos, useBodegas, useGuardarProductos } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Money } from '@/components/shared/Money'
import { Spinner } from '@/components/shared/Spinner'
import { ProductoModal } from './ProductoModal'
import type { Producto } from '@/types'

type ImportRow = { sku: string; nombre: string; costoNeto: number; precio: number; stock: number; categoria: string; subcategoria: string; enlace: string; tipo: 'producto' | 'servicio' }

function parseExcel(file: File): Promise<ImportRow[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const wb = XLSX.read(e.target!.result, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: Record<string, string>[] = XLSX.utils.sheet_to_json(ws, { defval: '' })
        const norm = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '')
        const find = (row: Record<string, string>, ...keys: string[]) => {
          const col = Object.keys(row).find(k => keys.some(kk => norm(k) === norm(kk)))
          return col ? String(row[col]).trim() : ''
        }
        const rows = raw.map(row => {
          const tipoRaw = find(row, 'tipo', 'type').toLowerCase()
          const tipo: 'producto' | 'servicio' = tipoRaw === 'servicio' || tipoRaw === 'service' ? 'servicio' : 'producto'
          return {
            sku:         find(row, 'sku'),
            nombre:      find(row, 'producto', 'nombre', 'name'),
            costoNeto:   Number(find(row, 'costo neto', 'costo', 'cost')) || 0,
            precio:      Number(find(row, 'precio venta', 'precio', 'price')) || 0,
            stock:       Number(find(row, 'stock')) || 0,
            categoria:   find(row, 'categoria', 'categoría', 'category'),
            subcategoria:find(row, 'subcategoria', 'subcategoría', 'subcategory'),
            enlace:      find(row, 'enlace', 'link', 'url'),
            tipo,
          }
        }).filter(r => r.nombre)
        resolve(rows)
      } catch (err) { reject(err) }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}

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
  const [filtroTipo, setFiltroTipo] = useState<'producto' | 'servicio' | ''>('')
  const [bajosStock, setBajosStock] = useState(false)
  const [modalOpen, setModalOpen]       = useState(false)
  const [editando, setEditando]         = useState<Producto | null>(null)
  const [importModal, setImportModal]     = useState(false)
  const [importRows, setImportRows]       = useState<ImportRow[]>([])
  const [importLoading, setImportLoading] = useState(false)
  const [importError, setImportError]     = useState('')
  const [importMode, setImportMode]       = useState<'reemplazar' | 'agregar'>('reemplazar')
  const [importTab, setImportTab]         = useState<'todos' | 'dup' | 'sinsku'>('todos')
  const fileInputRef = useRef<HTMLInputElement>(null)

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
    if (filtroTipo) r = r.filter(p => (p.tipo ?? 'producto') === filtroTipo)
    if (filtroCat)  r = r.filter(p => p.categoria === filtroCat)
    if (filtroSub)  r = r.filter(p => p.subcategoria === filtroSub)
    if (bajosStock) r = r.filter(p => {
      if (p.tipo === 'servicio') return false
      const st = filtroBodega ? stockSucursal(p, filtroBodega) : stockTotal(p)
      return st <= (p.stock_min ?? 0)
    })
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase()
      r = r.filter(p => p.nombre.toLowerCase().includes(q) || p.sku?.toLowerCase().includes(q))
    }
    return r
  }, [productos, filtroBodega, filtroCat, filtroSub, filtroTipo, bajosStock, busqueda])

  const hayFiltros = !!(filtroBodega || filtroCat || filtroSub || filtroTipo || bajosStock || busqueda)

  function limpiarFiltros() {
    setBusqueda(''); setFiltroBodega(''); setFiltroCat(''); setFiltroSub(''); setFiltroTipo(''); setBajosStock(false)
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

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError('')
    setImportRows([])
    try {
      const rows = await parseExcel(file)
      if (!rows.length) { setImportError('El archivo no contiene productos válidos.'); return }
      setImportRows(rows)
    } catch {
      setImportError('Error al leer el archivo. Verifica que sea un .xlsx válido.')
    }
    e.target.value = ''
  }

  async function confirmarImport() {
    if (!importRows.length) return
    setImportLoading(true)
    try {
      // Asignar SKUs automáticos a filas sin SKU, sin repetir con existentes ni entre sí
      const base = importMode === 'agregar' ? (productos ?? []) : []
      const allSkus = new Set([...base.map(p => p.sku ?? ''), ...(importMode === 'reemplazar' ? [] : [])])
      let lastSku = base.length
        ? Math.max(...base.map(p => parseInt(p.sku ?? '0', 10)).filter(n => !isNaN(n)), 998)
        : 998

      const nuevos: Producto[] = importRows.map(r => {
        let skuFinal = r.sku
        if (!skuFinal || allSkus.has(skuFinal)) {
          lastSku += 2
          while (allSkus.has(String(lastSku))) lastSku += 2
          skuFinal = String(lastSku)
        }
        allSkus.add(skuFinal)
        return {
          id: 'imp-' + Date.now() + '-' + Math.random().toString(36).slice(2),
          nombre: r.nombre,
          sku: skuFinal,
          categoria: r.categoria || 'Accesorio',
          subcategoria: r.subcategoria,
          precio_compra: r.costoNeto,
          precio_venta: r.precio,
          stock: r.tipo === 'servicio' ? undefined : r.stock,
          stock_min: r.tipo === 'servicio' ? undefined : 0,
          enlace: r.enlace,
          descripcion: '',
          tipo: r.tipo,
        }
      })
      await guardar.mutateAsync([...base, ...nuevos])
      setImportModal(false)
      setImportRows([])
    } finally {
      setImportLoading(false)
    }
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
              <button onClick={() => { setImportRows([]); setImportError(''); setImportModal(true) }}
                className="flex items-center gap-2 text-sm font-semibold px-4 py-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Importar Excel
              </button>
            )}
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

          {/* Tipo */}
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value as 'producto' | 'servicio' | '')}
            className={[
              'text-sm border rounded-lg px-3 py-1.5 focus:outline-none focus:border-blue-400',
              filtroTipo === 'servicio' ? 'border-violet-400 bg-violet-50 text-violet-700 font-semibold' : 'border-gray-200 bg-gray-50',
            ].join(' ')}>
            <option value="">Todos los tipos</option>
            <option value="producto">Productos</option>
            <option value="servicio">Servicios</option>
          </select>

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
                      {p.tipo === 'servicio' ? (
                        <td className="px-4 py-3 text-right">
                          <span className="text-base font-bold text-violet-500">∞</span>
                        </td>
                      ) : displayBodegas.length > 0 ? (
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

      {/* Modal importar Excel */}
      {importModal && (() => {
        const existingSkus = new Set((productos ?? []).map(p => p.sku ?? '').filter(Boolean))
        const dupRows    = importRows.filter(r => r.sku && existingSkus.has(r.sku))
        const noSkuRows  = importRows.filter(r => !r.sku)
        const okCount    = importRows.length - dupRows.length - noSkuRows.length

        // Calcular SKUs automáticos para preview
        const base = importMode === 'agregar' ? (productos ?? []) : []
        const allSkusPreview = new Set(base.map(p => p.sku ?? '').filter(Boolean))
        let lastSkuPreview = base.length
          ? Math.max(...base.map(p => parseInt(p.sku ?? '0', 10)).filter(n => !isNaN(n)), 998)
          : 998
        const autoSkus: string[] = noSkuRows.map(() => {
          lastSkuPreview += 2
          while (allSkusPreview.has(String(lastSkuPreview))) lastSkuPreview += 2
          allSkusPreview.add(String(lastSkuPreview))
          return String(lastSkuPreview)
        })

        const tabRows = importTab === 'dup' ? dupRows : importTab === 'sinsku' ? noSkuRows : importRows
        const showCols = importTab === 'dup' ? 'dup' : importTab === 'sinsku' ? 'sinsku' : 'todos'

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col max-h-[90vh]">

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Importar productos desde Excel</h2>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {importRows.length > 0
                      ? `${importRows.length} productos listos — revisa los avisos antes de continuar`
                      : 'Columnas: SKU, Producto, Costo Neto, Precio Venta, Stock, Categoría, Subcategoría, Enlace'}
                  </p>
                </div>
                <button onClick={() => setImportModal(false)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
              </div>

              <div className="px-6 py-5 flex-1 overflow-y-auto space-y-4">

                {/* Zona de carga */}
                <div onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/30 transition">
                  <svg className="w-8 h-8 mx-auto text-gray-300 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <p className="text-sm font-semibold text-gray-600">
                    {importRows.length > 0 ? 'Cargar otro archivo' : 'Seleccionar archivo Excel'}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">Soporta .xlsx y .xls</p>
                  <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} />
                </div>

                {importError && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-lg px-4 py-2">{importError}</p>
                )}

                {importRows.length > 0 && (<>

                  {/* Tarjetas resumen */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl p-3 bg-green-50 border border-green-100">
                      <p className="text-xl font-semibold text-green-800">{okCount.toLocaleString('es-CL')}</p>
                      <p className="text-xs text-green-700 mt-0.5">Sin problemas</p>
                    </div>
                    <div className="rounded-xl p-3 bg-amber-50 border border-amber-100">
                      <p className="text-xl font-semibold text-amber-800">{dupRows.length}</p>
                      <p className="text-xs text-amber-700 mt-0.5">SKU duplicado</p>
                    </div>
                    <div className="rounded-xl p-3 bg-blue-50 border border-blue-100">
                      <p className="text-xl font-semibold text-blue-800">{noSkuRows.length}</p>
                      <p className="text-xs text-blue-700 mt-0.5">Sin SKU — se asignará auto</p>
                    </div>
                  </div>

                  {/* Tabs */}
                  <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
                    {([['todos', `Todos (${importRows.length})`], ['dup', 'SKU duplicado'], ['sinsku', 'Sin SKU']] as const).map(([key, label]) => (
                      <button key={key} onClick={() => setImportTab(key)}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-semibold transition ${importTab === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                        {label}
                        {key === 'dup' && dupRows.length > 0 && (
                          <span className="bg-amber-200 text-amber-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{dupRows.length}</span>
                        )}
                        {key === 'sinsku' && noSkuRows.length > 0 && (
                          <span className="bg-blue-200 text-blue-900 text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">{noSkuRows.length}</span>
                        )}
                      </button>
                    ))}
                  </div>

                  {/* Tabla */}
                  <div className="border border-gray-200 rounded-xl overflow-hidden">
                    <div className={`grid px-4 py-2 bg-gray-50 text-[11px] font-semibold text-gray-400 uppercase tracking-wide ${showCols === 'dup' ? 'grid-cols-[90px_1fr_120px]' : showCols === 'sinsku' ? 'grid-cols-[90px_1fr_120px]' : 'grid-cols-[90px_1fr_90px_90px]'}`}>
                      <span>SKU</span><span>Producto</span>
                      {showCols === 'dup'    && <span>Estado</span>}
                      {showCols === 'sinsku' && <span>SKU asignado</span>}
                      {showCols === 'todos'  && <><span>Costo</span><span>Precio</span></>}
                    </div>
                    <div className="max-h-44 overflow-y-auto divide-y divide-gray-100">
                      {(tabRows.length === 0
                        ? <div className="px-4 py-6 text-center text-sm text-gray-400">Sin productos en esta categoría</div>
                        : tabRows.slice(0, 30).map((r, i) => {
                            const isDup = r.sku && existingSkus.has(r.sku)
                            const isNoSku = !r.sku
                            const autoIdx = noSkuRows.indexOf(r)
                            return (
                              <div key={i} className={`grid px-4 py-2.5 text-sm items-center ${showCols === 'dup' ? 'grid-cols-[90px_1fr_120px]' : showCols === 'sinsku' ? 'grid-cols-[90px_1fr_120px]' : 'grid-cols-[90px_1fr_90px_90px]'} ${isDup ? 'bg-amber-50/60' : isNoSku ? 'bg-blue-50/60' : ''}`}>
                                <span className={`font-mono text-xs font-medium ${isDup ? 'text-amber-700 line-through' : isNoSku ? 'text-gray-300' : 'text-gray-500'}`}>
                                  {r.sku || '—'}
                                </span>
                                <span className="truncate text-gray-800 pr-3">{r.nombre}</span>
                                {showCols === 'dup' && (
                                  <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md w-fit">Sobrescribir</span>
                                )}
                                {showCols === 'sinsku' && (
                                  <span className="font-mono text-xs font-semibold text-blue-600">→ {autoSkus[autoIdx]}</span>
                                )}
                                {showCols === 'todos' && (
                                  <><span className="text-xs text-gray-400">${r.costoNeto.toLocaleString('es-CL')}</span>
                                  <span className="text-xs text-gray-500">${r.precio.toLocaleString('es-CL')}</span></>
                                )}
                              </div>
                            )
                          })
                      )}
                      {tabRows.length > 30 && (
                        <div className="px-4 py-2 text-xs text-gray-400">...y {tabRows.length - 30} más</div>
                      )}
                    </div>
                  </div>

                  {/* Modo importación */}
                  <div className="flex gap-3">
                    {(['reemplazar', 'agregar'] as const).map(mode => (
                      <button key={mode} onClick={() => setImportMode(mode)}
                        className={`flex-1 text-left px-4 py-3 rounded-xl border transition ${importMode === mode ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}>
                        <p className={`text-sm font-semibold ${importMode === mode ? 'text-blue-800' : 'text-gray-800'}`}>
                          {mode === 'reemplazar' ? 'Reemplazar todo' : 'Agregar a los existentes'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {mode === 'reemplazar'
                            ? `Borra los ${(productos ?? []).length.toLocaleString('es-CL')} productos actuales e importa los nuevos`
                            : `Añade sin borrar lo que ya hay`}
                        </p>
                      </button>
                    ))}
                  </div>

                </>)}
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 gap-4">
                <p className="text-xs text-gray-400 flex-1">
                  {noSkuRows.length > 0 && (
                    <>{noSkuRows.length} producto{noSkuRows.length > 1 ? 's' : ''} recibirán SKU automático:{' '}
                    <span className="font-mono font-semibold text-blue-600">{autoSkus.slice(0, 5).join(', ')}{autoSkus.length > 5 ? '...' : ''}</span></>
                  )}
                </p>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={() => setImportModal(false)} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">Cancelar</button>
                  <button onClick={confirmarImport} disabled={!importRows.length || importLoading}
                    className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-40 disabled:cursor-not-allowed">
                    {importLoading && <Spinner className="w-4 h-4" />}
                    {importLoading ? 'Importando...' : `Importar ${importRows.length.toLocaleString('es-CL')} productos`}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )
      })()}
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
