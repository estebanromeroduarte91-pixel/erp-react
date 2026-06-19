import { useState, useMemo, useRef } from 'react'
import { useProductos, useVentas, useGuardarVentas, useMetodosPago, useCajaSesiones, useCajas, useIncrementarContadorVenta } from '@/lib/queries'
import type { VentaItem, Venta } from '@/types'

const IVA = 0.19

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function today() { return new Date().toISOString().split('T')[0] }
function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

function lineTotal(it: VentaItem) {
  return Math.round(it.precio_iva * (1 - (it.descuento || 0) / 100) * it.cantidad)
}
function lineNeto(it: VentaItem) {
  return Math.round(lineTotal(it) / (1 + IVA))
}

export function POSTab() {
  const { data: productos } = useProductos()
  const { data: ventas } = useVentas()
  const { data: metodos } = useMetodosPago()
  const { data: sesiones } = useCajaSesiones()
  const { data: cajas } = useCajas()
  const guardarVentas = useGuardarVentas()
  const incrementarContador = useIncrementarContadorVenta()

  const [items, setItems] = useState<VentaItem[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [cliente, setCliente] = useState('')
  const [cobrarOpen, setCobrarOpen] = useState(false)
  const [metodoSel, setMetodoSel] = useState<string>('')
  const [guardando, setGuardando] = useState(false)
  const busRef = useRef<HTMLInputElement>(null)

  const sesionAbierta = useMemo(() => sesiones?.find(s => s.fecha === today() && s.estado === 'abierta'), [sesiones])
  const cajaAbierta = useMemo(() => sesionAbierta ? cajas?.find(c => c.id === sesionAbierta.cajaId) : undefined, [sesionAbierta, cajas])

  const totalIva = items.reduce((s, it) => s + lineTotal(it), 0)
  const totalNeto = items.reduce((s, it) => s + lineNeto(it), 0)

  const resultados = useMemo(() => {
    if (!busqueda.trim()) return []
    const q = busqueda.toLowerCase()
    return (productos ?? []).filter(p =>
      p.nombre.toLowerCase().includes(q) || (p.sku ?? '').toLowerCase().includes(q)
    ).slice(0, 8)
  }, [productos, busqueda])

  function agregarProducto(pId: string) {
    const p = (productos ?? []).find(x => x.id === pId)
    if (!p) return
    const precioIva = p.precio_venta ?? 0
    const precioNeto = Math.round(precioIva / (1 + IVA))
    const exist = items.find(i => i.producto_id === pId)
    if (exist) {
      setItems(prev => prev.map(i => i.producto_id === pId ? { ...i, cantidad: i.cantidad + 1 } : i))
    } else {
      setItems(prev => [...prev, {
        id: uid(), producto_id: pId, producto_nombre: p.nombre,
        cantidad: 1, precio_neto: precioNeto, precio_iva: precioIva, descuento: 0,
        subtotal: precioNeto,
      }])
    }
    setBusqueda('')
    busRef.current?.focus()
  }

  function cambiarCantidad(id: string, qty: number) {
    if (qty < 1) return
    setItems(prev => prev.map(i => i.id === id ? { ...i, cantidad: qty } : i))
  }
  function cambiarDescuento(id: string, desc: number) {
    setItems(prev => prev.map(i => i.id === id ? { ...i, descuento: Math.max(0, Math.min(100, desc)) } : i))
  }
  function eliminarItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function abrirCobrar() {
    if (!items.length) return
    setMetodoSel(metodos?.[0]?.id ?? 'efectivo')
    setCobrarOpen(true)
  }

  async function confirmarVenta() {
    if (!metodoSel) return
    setGuardando(true)
    try {
      const nextNum = await incrementarContador.mutateAsync()
      const numero = 'VTA-' + String(nextNum).padStart(5, '0')
      const venta: Venta = {
        id: uid(),
        numero,
        fecha: today(),
        estado: 'pagada',
        cliente: cliente.trim() || 'Cliente genérico',
        metodo_pago: metodoSel,
        branchId: cajaAbierta?.sucursalId ?? '',
        branchNombre: '',
        bodega_id: cajaAbierta?.bodegaId ?? '',
        cajaId: sesionAbierta?.cajaId ?? '',
        otId: null,
        otNum: null,
        items: items.map(it => ({
          id: it.id,
          producto_id: it.producto_id,
          producto_nombre: it.producto_nombre,
          cantidad: it.cantidad,
          precio_neto: Math.round(lineTotal(it) / (1 + IVA) / it.cantidad),
          precio_iva: Math.round(it.precio_iva * (1 - (it.descuento || 0) / 100)),
          descuento: it.descuento || 0,
          subtotal: lineNeto(it),
        })),
        total: totalNeto,
        total_iva: totalIva,
        fecha_creacion: today(),
      }
      await guardarVentas.mutateAsync([...(ventas ?? []), venta])
      setItems([])
      setCliente('')
      setCobrarOpen(false)
      setBusqueda('')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Panel izquierdo: buscador + carrito */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Buscador */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={busRef}
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto por nombre o SKU..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400"
            />
          </div>
          {resultados.length > 0 && (
            <ul className="mt-2 border border-gray-100 rounded-lg overflow-hidden shadow-sm">
              {resultados.map(p => (
                <li key={p.id}>
                  <button
                    onClick={() => agregarProducto(p.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-blue-50 transition-colors text-left"
                  >
                    <span>
                      <span className="font-medium text-gray-800">{p.nombre}</span>
                      {p.sku && <span className="ml-2 text-xs text-gray-400">{p.sku}</span>}
                    </span>
                    <span className="font-semibold text-blue-700">{fmt(p.precio_venta ?? 0)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Carrito */}
        <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-2">
              <svg className="w-12 h-12 text-gray-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-sm">Busca un producto para agregarlo al carrito</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Producto</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Qty</th>
                  <th className="text-right px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Precio c/IVA</th>
                  <th className="text-center px-3 py-3 text-xs font-semibold text-gray-500 uppercase">Desc %</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Subtotal</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {items.map(it => (
                  <tr key={it.id}>
                    <td className="px-4 py-3 font-medium text-gray-800">{it.producto_nombre}</td>
                    <td className="px-3 py-3">
                      <input
                        type="number" min={1} value={it.cantidad}
                        onChange={e => cambiarCantidad(it.id, Number(e.target.value))}
                        className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                      />
                    </td>
                    <td className="px-3 py-3 text-right text-gray-700">{fmt(it.precio_iva)}</td>
                    <td className="px-3 py-3">
                      <input
                        type="number" min={0} max={100} value={it.descuento}
                        onChange={e => cambiarDescuento(it.id, Number(e.target.value))}
                        className="w-16 text-center border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-blue-400"
                      />
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-gray-900">{fmt(lineTotal(it))}</td>
                    <td className="pr-3">
                      <button onClick={() => eliminarItem(it.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Panel derecho: resumen + cobrar */}
      <div className="w-72 flex flex-col gap-4 flex-shrink-0">
        {/* Cliente */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <label className="text-xs font-semibold text-gray-500 uppercase block mb-2">Cliente</label>
          <input
            value={cliente}
            onChange={e => setCliente(e.target.value)}
            placeholder="Cliente genérico"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
          />
        </div>

        {/* Resumen */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex-1">
          <p className="text-xs font-semibold text-gray-500 uppercase mb-4">Resumen</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-gray-600">
              <span>Subtotal (neto)</span>
              <span>{fmt(totalNeto)}</span>
            </div>
            <div className="flex justify-between text-gray-600">
              <span>IVA (19%)</span>
              <span>{fmt(totalIva - totalNeto)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg text-gray-900 border-t border-gray-100 pt-3 mt-3">
              <span>Total</span>
              <span className="text-blue-700">{fmt(totalIva)}</span>
            </div>
          </div>

          {sesionAbierta && (
            <div className="mt-4 text-xs text-gray-400 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              Caja abierta — {cajaAbierta?.nombre ?? 'Sin nombre'}
            </div>
          )}
        </div>

        {/* Botón cobrar */}
        <button
          onClick={abrirCobrar}
          disabled={!items.length}
          className="w-full bg-blue-600 text-white font-bold py-4 rounded-xl text-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
        >
          Cobrar {items.length > 0 ? fmt(totalIva) : ''}
        </button>
      </div>

      {/* Modal cobrar */}
      {cobrarOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={e => { if (e.target === e.currentTarget) setCobrarOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-bold text-gray-900">Confirmar cobro</h3>
              <button onClick={() => setCobrarOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-5">
              <div className="text-center">
                <p className="text-xs text-gray-400 mb-1">Total a cobrar</p>
                <p className="text-4xl font-extrabold text-blue-700">{fmt(totalIva)}</p>
                <p className="text-xs text-gray-400 mt-1">{items.length} producto(s)</p>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Método de pago</p>
                <div className="flex gap-2 flex-wrap">
                  {(metodos ?? []).map(m => (
                    <button
                      key={m.id}
                      onClick={() => setMetodoSel(m.id)}
                      className={[
                        'flex-1 min-w-[80px] py-3 px-2 rounded-xl border-2 text-sm font-semibold transition',
                        metodoSel === m.id
                          ? 'border-blue-600 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300',
                      ].join(' ')}
                    >
                      <span className="block text-lg mb-0.5">{m.icon}</span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
              <button
                onClick={() => setCobrarOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition"
              >Cancelar</button>
              <button
                onClick={confirmarVenta}
                disabled={!metodoSel || guardando}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition"
              >{guardando ? 'Guardando…' : 'Registrar venta'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
