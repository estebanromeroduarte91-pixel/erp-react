import { useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useGuardarProducto, useCategorias, useGuardarCategorias } from '@/lib/queries'
import { buscarSimilar } from '@/lib/texto'
import type { Producto, Bodega } from '@/types'

interface Props {
  producto: Producto | null
  productos: Producto[]
  bodegas: Bodega[]
  onClose: () => void
  /**
   * Se llama con el producto ya guardado. Lo usa el POS para meterlo al
   * carrito enseguida: si hubiera que buscarlo de nuevo después de crearlo,
   * la mitad de la ventaja de crearlo desde la caja se pierde.
   */
  onGuardado?: (producto: Producto) => void
  /** Nombre con el que abre el formulario (lo que se tipeó en el buscador). */
  nombreInicial?: string
  /**
   * Modo caja: deja a la vista solo lo imprescindible y pliega el resto.
   * Con un cliente esperando, un formulario largo se completa a medias o no se
   * completa; los campos siguen estando, solo dejan de estorbar.
   */
  compacto?: boolean
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function nextSku(productos: Producto[]): string {
  const nums = productos.map(p => parseInt(p.sku ?? '', 10)).filter(n => !isNaN(n))
  const max = nums.length ? Math.max(...nums) : 998
  return String(max % 2 === 0 ? max + 2 : max + 1)
}

export function ProductoModal({ producto, productos, bodegas, onClose, onGuardado, nombreInicial, compacto = false }: Props) {
  const guardar = useGuardarProducto()
  const isEditing = !!producto

  const [tipo, setTipo] = useState<'producto' | 'servicio'>(producto?.tipo ?? 'producto')
  const [nombre, setNombre] = useState(producto?.nombre ?? nombreInicial ?? '')
  const [sku, setSku] = useState(() => producto?.sku ?? (isEditing ? '' : nextSku(productos)))
  const [unidad, setUnidad] = useState(producto?.unidad ?? 'unidad')
  const [precioCompra, setPrecioCompra] = useState(String(producto?.precio_compra ?? ''))
  const [precioVenta, setPrecioVenta] = useState(String(producto?.precio_venta ?? ''))
  const [stock, setStock] = useState(String(producto?.stock ?? ''))
  const [stockMin, setStockMin] = useState(String(producto?.stock_min ?? ''))
  const [stockSucs, setStockSucs] = useState<Record<string, number>>(producto?.stock_sucursales ?? {})
  const [categoria, setCategoria] = useState(producto?.categoria ?? '')
  const [subcategoria, setSubcategoria] = useState(producto?.subcategoria ?? '')
  const [venderOnline, setVenderOnline] = useState(producto?.vender_online === true)
  const [categoriaOpen, setCategoriaOpen] = useState(false)
  const [catQuery, setCatQuery] = useState('')
  // El desplegable se dibuja en una capa aparte anclada al campo: dentro del
  // modal quedaba recortado por el contenedor con scroll, y se veía la lista
  // cortada a la mitad.
  const catBtnRef = useRef<HTMLButtonElement>(null)
  const [catPos, setCatPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null)

  function abrirCategorias() {
    const r = catBtnRef.current?.getBoundingClientRect()
    if (r) {
      const alto = 300
      // Si no entra abajo, se abre hacia arriba en vez de salirse de la
      // pantalla. La medición se hace acá y no en el render: leer
      // `window.innerHeight` mientras se renderiza es una lectura impura.
      const haciaArriba = r.bottom + alto > window.innerHeight && r.top > alto
      setCatPos(haciaArriba
        ? { left: r.left, width: r.width, bottom: window.innerHeight - r.top + 4 }
        : { left: r.left, width: r.width, top: r.bottom + 4 })
    }
    setCatQuery('')
    setCategoriaOpen(true)
  }
  // En modo caja arranca plegado; fuera de la caja no aplica.
  const [masOpciones, setMasOpciones] = useState(false)
  const verSecundarios = !compacto || masOpciones
  const [subcategoriaOpen, setSubcategoriaOpen] = useState(false)
  const [enlace, setEnlace] = useState(producto?.enlace ?? '')
  const [enlaceOpen, setEnlaceOpen] = useState(false)
  const [descripcion, setDescripcion] = useState(producto?.descripcion ?? '')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  const esServicio = tipo === 'servicio'

  const tieneSucs = bodegas.length > 0

  // Categorías: la lista curada (Inventario → Categorías) es la fuente principal
  // (trae también sus subcategorías, para enlazar el submenú); se completa con
  // categorías sueltas que ya tengan productos pero no estén en la lista curada,
  // para no perder ninguna por no haberla registrado ahí.
  const { data: categoriasCuradas = [] } = useCategorias()
  const guardarCategorias = useGuardarCategorias()
  const cats = useMemo(() => {
    const deProductos = new Set(productos.map((p) => p.categoria).filter(Boolean) as string[])
    const deCuradas = new Set(categoriasCuradas.map((c) => c.nombre))
    return [...new Set([...deCuradas, ...deProductos])].sort()
  }, [productos, categoriasCuradas])

  // Enlaces existentes (ej. "iPhone 11") para sugerir — el mismo valor que
  // agrupa variantes de color en Kits/Equipos y en la columna "Enlace" de la
  // planilla de importación masiva.
  const enlaces = useMemo(() => {
    return [...new Set(productos.map((p) => p.enlace).filter(Boolean) as string[])].sort()
  }, [productos])

  // Desplegable propio (no <datalist> nativo, que no se puede estilizar y con
  // ~130 enlaces se veía como una lista gigante sin estética): filtra por lo
  // tipeado y muestra las primeras coincidencias.
  const enlacesFiltrados = useMemo(() => {
    const q = enlace.trim().toLowerCase()
    const base = q ? enlaces.filter((e) => e.toLowerCase().includes(q)) : enlaces
    return base.slice(0, 8)
  }, [enlaces, enlace])

  // Se filtra por lo escrito para que la lista no tape lo que se está
  // tipeando, y se detecta si es una categoría que todavía no existe.
  const conteoPorCat = useMemo(() => {
    const m: Record<string, number> = {}
    productos.forEach(p => {
      if (p.categoria) m[p.categoria] = (m[p.categoria] ?? 0) + 1
    })
    return m
  }, [productos])

  const catsFiltradas = useMemo(() => {
    const q = catQuery.trim().toLowerCase()
    return q ? cats.filter(c => c.toLowerCase().includes(q)) : cats
  }, [cats, catQuery])
  // "Cable" cuando ya existe "Cables" no es una categoría nueva: es la misma
  // escrita distinto. Sin este aviso las variantes se acumulan solas y después
  // hay productos repartidos entre dos categorías que deberían ser una.
  const catSimilar = useMemo(() => buscarSimilar(catQuery, cats), [catQuery, cats])

  const categoriaNueva = useMemo(() => {
    const q = catQuery.trim()
    return !!q && !cats.some(c => c.toLowerCase() === q.toLowerCase())
  }, [cats, catQuery])

  // Subcategorías sugeridas: las de la categoría curada que coincide con lo
  // escrito (si existe), si no, las que ya usan otros productos de esa categoría.
  const subcats = useMemo(() => {
    const curada = categoriasCuradas.find((c) => c.nombre.toLowerCase() === categoria.trim().toLowerCase())
    if (curada) return [...new Set(curada.subcategorias ?? [])].sort()
    const deProductos = productos
      .filter((p) => p.categoria?.toLowerCase() === categoria.trim().toLowerCase())
      .map((p) => p.subcategoria)
      .filter(Boolean) as string[]
    return [...new Set(deProductos)].sort()
  }, [categoria, categoriasCuradas, productos])

  // Crear la categoría la agrega también a la lista curada de
  // Inventario → Categorías. Si quedara solo pegada al producto, convivirían
  // dos clases de categoría: las que se pueden ordenar y darles subcategorías,
  // y las que aparecen en las listas solo porque algún producto las usa.
  const subSimilar = useMemo(() => buscarSimilar(subcategoria, subcats), [subcategoria, subcats])

  async function crearCategoria(nombre: string) {
    const limpio = nombre.trim()
    if (!limpio) return
    setCategoria(limpio)
    setSubcategoria('')
    setCategoriaOpen(false)
    const yaEsta = categoriasCuradas.some(c => c.nombre.toLowerCase() === limpio.toLowerCase())
    if (yaEsta) return
    try {
      await guardarCategorias.mutateAsync([
        ...categoriasCuradas,
        { id: uid(), nombre: limpio, subcategorias: [] },
      ])
    } catch {
      // Que falle el alta en la lista curada no puede impedir guardar el
      // producto: la categoría igual queda registrada en él.
    }
  }

  async function handleGuardar() {
    if (!nombre.trim()) { setError('El nombre es obligatorio'); return }
    // El precio de venta sí es obligatorio: sin él la venta saldría en $0.
    // El costo NO lo es, por decisión de producto — pero se avisa abajo,
    // porque sin costo el margen y el costo de lo vendido quedan mal.
    if (!(+precioVenta > 0)) { setError('El precio de venta es obligatorio'); return }
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
      enlace: enlace.trim() || undefined,
      descripcion: descripcion.trim() || undefined,
      tipo,
      // Un servicio no tiene stock que publicar ni despachar.
      vender_online: esServicio ? false : venderOnline,
    }

    try {
      await guardar.mutateAsync(prod)
      onGuardado?.(prod)
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
              {verSecundarios && <Field label="SKU / Código" value={sku} onChange={setSku} placeholder="Ej: PAN-IP14" />}
              {verSecundarios && <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Unidad</label>
                <select value={unidad} onChange={(e) => setUnidad(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                  {['unidad', 'par', 'caja', 'kg', 'litro', 'metro', 'servicio'].map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>}
              <div className="relative">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Categoría</label>
                {/* Selector, no caja de texto: antes parecía cerrado y nadie
                    intentaba escribir una categoría nueva. El buscador va
                    adentro para que el campo de arriba muestre solo lo elegido
                    y no se confunda "lo que busco" con "lo que voy a guardar". */}
                <button type="button" ref={catBtnRef}
                  onClick={() => categoriaOpen ? setCategoriaOpen(false) : abrirCategorias()}
                  className="w-full flex items-center justify-between gap-2 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 hover:border-gray-300 transition text-left">
                  <span className={categoria ? 'text-gray-900' : 'text-gray-400'}>
                    {categoria || 'Seleccionar categoría'}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition ${categoriaOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="m6 9 6 6 6-6" /></svg>
                </button>
                {categoriaOpen && catPos && createPortal(
                  <>
                    <div className="fixed inset-0 z-[120]" onClick={() => setCategoriaOpen(false)} />
                    <div
                      className="fixed z-[121] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
                      style={{ left: catPos.left, width: catPos.width, top: catPos.top, bottom: catPos.bottom }}
                    >
                      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50">
                        <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M21 21l-6-6" /></svg>
                        <input autoFocus value={catQuery} onChange={e => setCatQuery(e.target.value)}
                          placeholder="Buscar categoría…"
                          className="w-full bg-transparent text-sm focus:outline-none" />
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {catsFiltradas.map(c => (
                          <button key={c} type="button"
                            onClick={() => { setCategoria(c); setSubcategoria(''); setCategoriaOpen(false) }}
                            className={`w-full flex items-center justify-between px-3.5 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition ${c === categoria ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`}>
                            <span>{c}</span>
                            {/* El conteo distingue la categoría buena de un
                                tipeo: "Accesorios 142" contra "Accesorio 3". */}
                            <span className="text-[10px] text-gray-400">{conteoPorCat[c] ?? 0}</span>
                          </button>
                        ))}
                        {catsFiltradas.length === 0 && !categoriaNueva && (
                          <p className="px-3.5 py-4 text-xs text-gray-400 text-center">Ninguna categoría coincide</p>
                        )}
                      </div>
                      {categoriaNueva && catSimilar && (
                        <div className="px-3.5 py-3 bg-amber-50 border-t border-amber-200">
                          <p className="text-xs text-amber-900 leading-snug">
                            Ya existe <strong>&quot;{catSimilar}&quot;</strong>
                            {conteoPorCat[catSimilar] ? ` con ${conteoPorCat[catSimilar]} producto${conteoPorCat[catSimilar] === 1 ? '' : 's'}` : ''}.
                            ¿Es la misma?
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button type="button"
                              onClick={() => { setCategoria(catSimilar); setSubcategoria(''); setCategoriaOpen(false) }}
                              className="px-3 py-1.5 text-xs font-semibold text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition">
                              Usar &quot;{catSimilar}&quot;
                            </button>
                            <button type="button" onClick={() => void crearCategoria(catQuery)}
                              className="px-3 py-1.5 text-xs font-medium text-amber-800 underline underline-offset-2">
                              Crear &quot;{catQuery.trim()}&quot; igual
                            </button>
                          </div>
                        </div>
                      )}
                      {categoriaNueva && !catSimilar && (
                        <button type="button" onClick={() => void crearCategoria(catQuery)}
                          className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm font-semibold text-blue-700 bg-blue-50 border-t border-blue-100 hover:bg-blue-100 transition">
                          <span className="font-bold">+</span>
                          <span>Crear categoría &quot;{catQuery.trim()}&quot;</span>
                        </button>
                      )}
                    </div>
                  </>,
                  document.body,
                )}
              </div>
              {verSecundarios && <div className="relative">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Subcategoría</label>
                <input value={subcategoria} onChange={(e) => { setSubcategoria(e.target.value); setSubcategoriaOpen(true) }}
                  onFocus={() => setSubcategoriaOpen(true)}
                  onBlur={() => setTimeout(() => setSubcategoriaOpen(false), 150)}
                  placeholder="Ej: iPhone 14"
                  className="w-full border border-gray-200 rounded-lg pl-3 pr-9 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                {subcats.length > 0 && (
                  <button type="button" tabIndex={-1} aria-label="Mostrar subcategorías"
                    onMouseDown={e => { e.preventDefault(); setSubcategoriaOpen(v => !v) }}
                    className="absolute right-1 top-6 w-8 h-8 flex items-center justify-center text-gray-400">
                    <svg className={`w-4 h-4 transition ${subcategoriaOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="m6 9 6 6 6-6" /></svg>
                  </button>
                )}
                {subcategoriaOpen && subcats.length > 0 && (
                  <div className="absolute left-0 right-0 z-40 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {subcats.map(s => (
                      <button key={s} type="button"
                        onMouseDown={() => { setSubcategoria(s); setSubcategoriaOpen(false) }}
                        className={`w-full text-left px-3.5 py-2.5 text-sm hover:bg-blue-50 hover:text-blue-700 transition ${s === subcategoria ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700'}`}>
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {subSimilar && (
                  <p className="mt-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Ya existe <strong>&quot;{subSimilar}&quot;</strong>.{' '}
                    <button type="button" onClick={() => setSubcategoria(subSimilar)}
                      className="font-semibold underline underline-offset-2">Usar esa</button>
                  </p>
                )}
              </div>}
              {verSecundarios && <div className="col-span-2 relative">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Enlace (opcional)</label>
                <input value={enlace}
                  onChange={(e) => setEnlace(e.target.value)}
                  onFocus={() => setEnlaceOpen(true)}
                  onBlur={() => setTimeout(() => setEnlaceOpen(false), 150)}
                  placeholder="Ej: iPhone 11"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                {enlaceOpen && enlacesFiltrados.length > 0 && (
                  <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                    {enlacesFiltrados.map((e) => (
                      <button key={e} type="button"
                        onMouseDown={() => { setEnlace(e); setEnlaceOpen(false) }}
                        className="w-full text-left px-3.5 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition">
                        {e}
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-gray-400 mt-1">
                  Agrupa este producto con otros del mismo modelo (misma columna "Enlace" de la planilla Excel).
                  Se usa en <strong>Kits / Equipos</strong> para armar automáticamente las variantes de color.
                  Déjalo vacío para desenlazarlo.
                </p>
              </div>}
              {verSecundarios && <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Descripción</label>
                <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)}
                  rows={2} placeholder="Descripción opcional..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
              </div>}

              {/* El stock que se publica es el de la bodega desde la que se
                  despacha lo online, no el total: no se puede ofrecer algo que
                  está en la otra sucursal. */}
              {!esServicio && verSecundarios && (
                <div className="col-span-2">
                  <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-gray-200 px-3 py-2.5 hover:border-gray-300 transition">
                    <input type="checkbox" checked={venderOnline}
                      onChange={(e) => setVenderOnline(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-blue-600 flex-shrink-0" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-gray-700">Vender en la tienda online</span>
                      <span className="block text-xs text-gray-400 leading-relaxed mt-0.5">
                        {sku.trim()
                          ? 'Se publica en WooCommerce y su precio y stock quedan sincronizados.'
                          : 'Necesita un SKU: es lo que enlaza el producto con la tienda.'}
                      </span>
                    </span>
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* Precios */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Precios</h4>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Costo neto ($)" type="number" value={precioCompra} onChange={setPrecioCompra} placeholder="0" />
              <Field label="Precio de venta con IVA ($) *" type="number" value={precioVenta} onChange={setPrecioVenta} placeholder="0" />
            </div>
            {/* El margen en vivo evita el error de comparar un precio con IVA
                contra un costo neto, que infla el margen en 19 puntos. */}
            {+precioVenta > 0 && +precioCompra > 0 && (() => {
              const neto = Math.round(+precioVenta / 1.19)
              const pct = neto > 0 ? Math.round((neto - +precioCompra) / neto * 100) : 0
              return (
                <p className={`mt-2 text-xs font-semibold rounded-lg px-3 py-2 ${pct < 0 ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                  Margen {pct}% · precio neto ${neto.toLocaleString('es-CL')}
                </p>
              )
            })()}
            {+precioVenta > 0 && !(+precioCompra > 0) && (
              <p className="mt-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Sin costo, este producto va a figurar con 100% de margen y no va a sumar al costo de lo vendido. Podés completarlo después desde Inventario.
              </p>
            )}
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
          {compacto && !masOpciones && (
            <button onClick={() => setMasOpciones(true)}
              className="mr-auto text-sm font-medium text-blue-600 hover:underline">
              Más opciones
            </button>
          )}
          <button onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : compacto ? 'Crear y agregar' : 'Crear producto'}
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
