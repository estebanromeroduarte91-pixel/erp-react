import { useState } from 'react'
import { useGuardarProducto } from '@/lib/queries'
import type { Producto, Bodega } from '@/types'

interface Props {
  producto: Producto | null
  productos: Producto[]
  bodegas: Bodega[]
  onClose: () => void
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function nextSku(productos: Producto[]): string {
  const nums = productos.map(p => parseInt(p.sku ?? '', 10)).filter(n => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 998
  return String(max % 2 === 0 ? max + 2 : max + 1)
}

export function ProductoModal({ producto, productos, bodegas, onClose }: Props) {
  const guardar = useGuardarProducto()
  const isEditing = !!producto

  const [tipo, setTipo] = useState<'producto' | 'servicio'>(producto?.tipo ?? 'producto')
  const [nombre, setNombre] = useState(producto?.nombre ?? '')
  const [sku, setSku] = useState(() => producto?.sku ?? (isEditing ? '' : nextSku(productos)))
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

  const esServicio = tipo === 'servicio'

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
      stock: esServicio ? undefined : (tieneSucs ? undefined : +stock || 0),
      stock_min: esServicio ? undefined : (+stockMin || 0),
      stock_sucursales: esServicio ? undefined : (tieneSucs ? stockSucs : undefined),
      categoria: categoria.trim() || undefined,
      subcategoria: subcategoria.trim() || undefined,
      descripcion: descripcion.trim() || undefined,
      tipo,
    }

    try {
      await guardar.mutateAsync(prod)
      onClose()
    } catch (e) {
      setError((e as Error).message || 'No se pudo guardar el producto')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-end md:items-center justify-center bg-black/40 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-xl flex flex-col max-h-[92vh] md:max-h-[90vh]">

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

          {/* Tipo */}
          <div className="flex gap-2 p-1 bg-gray-100 rounded-xl w-fit">
            {(['producto', 'servicio'] as const).map(t => (
              <button key={t} onClick={() => setTipo(t)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition ${
                  tipo === t
                    ? t === 'producto' ? 'bg-blue-600 text-white shadow-sm' : 'bg-violet-600 text-white shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}>
                {t === 'producto'
                  ? <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 10V11"/></svg>
                  : <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"/></svg>
                }
                {t === 'producto' ? 'Producto' : 'Servicio'}
              </button>
            ))}
          </div>

          {/* Datos básicos */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">{esServicio ? 'Datos del servicio' : 'Datos del producto'}</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Nombre *" value={nombre} onChange={setNombre} placeholder="Ej: Pantalla iPhone 14" />
              </div>
              <Field label="SKU / Código" value={sku} onChange={setSku} placeholder="Ej: PAN-IP14" />
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Unidad</label>
                <select value={unidad} onChange={(e) => setUnidad(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                  {['unidad', 'par', 'caja', 'kg', 'litro', 'metro', 'servicio'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría</label>
                <input value={categoria} onChange={(e) => setCategoria(e.target.value)}
                  list="cats-list" placeholder="Ej: Pantallas"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                <datalist id="cats-list">
                  {cats.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <Field label="Subcategoría" value={subcategoria} onChange={setSubcategoria} placeholder="Ej: iPhone 14" />
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Descripción</label>
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                  rows={2} placeholder="Descripción opcional..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
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

          {/* Stock — solo productos */}
          {esServicio ? (
            <div className="flex items-center gap-2.5 px-4 py-3 bg-violet-50 border border-violet-200 rounded-xl text-sm text-violet-700">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 106 18.75M13.5 10.5V3M13.5 10.5l3-3m-3 3l-3-3"/></svg>
              Los servicios no tienen stock. Se pueden vender sin límite.
            </div>
          ) : (
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
                        className="w-24 border border-gray-200 rounded-lg px-3 py-1.5 text-base md:text-sm text-right bg-gray-50 focus:outline-none focus:border-blue-400"
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
          )}

          {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-none md:rounded-b-2xl" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
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
        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
    </div>
  )
}
