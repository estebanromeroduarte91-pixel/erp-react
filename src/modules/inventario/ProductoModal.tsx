import { useState } from 'react'
import { useGuardarProductos } from '@/lib/queries'
import type { Producto, Bodega } from '@/types'

interface Props {
  producto: Producto | null
  productos: Producto[]
  bodegas: Bodega[]
  onClose: () => void
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

export function ProductoModal({ producto, productos, bodegas, onClose }: Props) {
  const guardar = useGuardarProductos()
  const isEditing = !!producto

  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [sku, setSku] = useState(producto?.sku ?? '')
  const [unidad, setUnidad] = useState(producto?.unidad ?? 'unidad')
  const [precioCompra, setPrecioCompra] = useState(String(producto?.precio_compra ?? ''))
  const [precioVenta, setPrecioVenta] = useState(String(producto?.precio_venta ?? ''))
  const [stock, setStock] = useState(String(producto?.stock ?? ''))
  const [stockMin, setStockMin] = useState(String(producto?.stock_min ?? ''))
  const [stockSucs, setStockSucs] = useState<Record<string, number>>(producto?.stock_sucursales ?? {})
  const [categoria, setCategoria] = useState(producto?.categoria ?? '')
  const [subcategoria, setSubcategoria] = useState(producto?.subcategoria ?? '')
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const tieneSucs = bodegas.length > 0

  // Categorías existentes para autocompletar
  const cats = [...new Set(productos.map((p) => p.categoria).filter(Boolean))].sort() as string[]

  async function handleGuardar() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    if (sku.trim()) {
      const dup = productos.find((p) => p.sku?.toLowerCase() === sku.toLowerCase() && p.id !== producto?.id)
      if (dup) { setError(`SKU "${sku}" ya está en uso por "${dup.nombre}"`); return }
    }
    setError('')
    setGuardando(true)

    const prod: Producto = {
      id: producto?.id ?? uid(),
      nombre: nombre.trim(),
      sku: sku.trim() || undefined,
      unidad,
      precio_compra: +precioCompra || 0,
      precio_venta: +precioVenta || 0,
      stock: tieneSucs ? undefined : +stock || 0,
      stock_min: +stockMin || 0,
      stock_sucursales: tieneSucs ? stockSucs : undefined,
      categoria: categoria.trim() || undefined,
      subcategoria: subcategoria.trim() || undefined,
      descripcion: descripcion.trim() || undefined,
    }

    let nuevos: Producto[]
    if (isEditing) {
      nuevos = productos.map((p) => p.id === prod.id ? { ...p, ...prod } : p)
    } else {
      nuevos = [...productos, prod]
    }

    await guardar.mutateAsync(nuevos)
    setGuardando(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {isEditing ? `Editar: ${producto!.nombre}` : 'Nuevo producto'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Inventario</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-4">

          {/* Datos básicos */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Datos del producto</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Nombre *" value={nombre} onChange={setNombre} placeholder="Ej: Pantalla iPhone 14" />
              </div>
              <Field label="SKU / Código" value={sku} onChange={setSku} placeholder="Ej: PAN-IP14" />
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Unidad</label>
                <select value={unidad} onChange={(e) => setUnidad(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                  {['unidad', 'par', 'caja', 'kg', 'litro', 'metro', 'servicio'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría</label>
                <input value={categoria} onChange={(e) => setCategoria(e.target.value)}
                  list="cats-list" placeholder="Ej: Pantallas"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                <datalist id="cats-list">
                  {cats.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <Field label="Subcategoría" value={subcategoria} onChange={setSubcategoria} placeholder="Ej: iPhone 14" />
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Descripción</label>
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                  rows={2} placeholder="Descripción opcional..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
              </div>
            </div>
          </section>

          {/* Precios */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Precios</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Costo neto ($)" type="number" value={precioCompra} onChange={setPrecioCompra} placeholder="0" />
              <Field label="Precio de venta ($)" type="number" value={precioVenta} onChange={setPrecioVenta} placeholder="0" />
            </div>
          </section>

          {/* Stock */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Stock</h4>
            {tieneSucs ? (
              <div className="space-y-2">
                {bodegas.map((b) => (
                  <div key={b.id} className="flex items-center gap-3">
                    <span className="text-sm text-gray-700 flex-1">{b.nombre ?? b.name}</span>
                    <input
                      type="number" min="0"
                      value={stockSucs[b.id] ?? 0}
                      onChange={(e) => setStockSucs((s) => ({ ...s, [b.id]: +e.target.value || 0 }))}
                      className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-right bg-gray-50 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <Field label="Stock actual" type="number" value={stock} onChange={setStock} placeholder="0" />
                <Field label="Stock mínimo" type="number" value={stockMin} onChange={setStockMin} placeholder="0" />
              </div>
            )}
          </section>

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear producto'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
    </div>
  )
}
