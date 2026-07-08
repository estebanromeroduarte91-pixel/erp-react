import { useState, useMemo, useRef } from 'react'
import { useProductos, useGuardarProductos, useVentas, useGuardarVentas, useMetodosPago, useCajaSesiones, useCajas, useGuardarCajaSesiones, useIncrementarContadorVenta, useOrdenes, useGuardarOrden, useMovimientos, useGuardarMovimientos, useUserProfiles, useUserCargoMap, useCargos, CARGOS_DEFAULT } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import type { VentaItem, Venta, Orden, CajaSesion } from '@/types'

const IVA = 0.19

// Ícono SVG por método de pago (reemplaza los emojis de los datos)
function IconoMetodo({ id }: { id: string }) {
  const cls = 'w-5 h-5 mx-auto'
  if (id === 'efectivo') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /><path d="M6 12h.01M18 12h.01" /></svg>
  )
  if (id === 'tarjeta') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></svg>
  )
  if (id === 'transfer') return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11M9 10v11M15 10v11" /></svg>
  )
  return (
    <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v10M9.5 9.5a2.5 2 0 015 0c0 2.5-5 1.5-5 4a2.5 2 0 005 0" /></svg>
  )
}

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function today() { return new Date().toISOString().split('T')[0] }
function nowTime() { return new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) }
function fmt(n: number) { return '$' + Math.round(n).toLocaleString('es-CL') }

function lineTotal(it: VentaItem) {
  return Math.round(it.precio_iva * (1 - (it.descuento || 0) / 100) * it.cantidad)
}
function lineNeto(it: VentaItem) {
  return Math.round(lineTotal(it) / (1 + IVA))
}

export function POSTab() {
  const { nombre: nombreUsuario, branchId } = useAuth()
  const { data: productos } = useProductos()
  const guardarProductos = useGuardarProductos()
  const { data: ventas } = useVentas()
  const { data: ordenes } = useOrdenes()
  const { data: metodos } = useMetodosPago()
  const { data: sesiones } = useCajaSesiones()
  const { data: cajas } = useCajas()
  const { data: movimientos } = useMovimientos()
  const guardarVentas = useGuardarVentas()
  const guardarSesiones = useGuardarCajaSesiones()
  const guardarOrden = useGuardarOrden()
  const guardarMovimientos = useGuardarMovimientos()
  const incrementarContador = useIncrementarContadorVenta()
  const { data: userProfiles } = useUserProfiles()
  const { data: userCargoMap } = useUserCargoMap()
  const { data: cargosCustom } = useCargos()

  // Caja management state
  const [cajaSelId, setCajaSelId] = useState<string>('')
  const [fondo, setFondo] = useState('')
  const [responsable, setResponsable] = useState(nombreUsuario || '')
  const [cerrando, setCerrando] = useState(false)
  const [conteoEfect, setConteoEfect] = useState('')
  const [obsCierre, setObsCierre] = useState('')
  const [guardandoCaja, setGuardandoCaja] = useState(false)

  const [items, setItems] = useState<VentaItem[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [busquedaOT, setBusquedaOT] = useState('')
  const [otSeleccionada, setOtSeleccionada] = useState<Orden | null>(null)
  const [otPanelOpen, setOtPanelOpen] = useState(false)
  const [cliente, setCliente] = useState('')
  const [clienteRut, setClienteRut] = useState('')
  const [clienteTel, setClienteTel] = useState('')
  const [clienteEmail, setClienteEmail] = useState('')
  const [tipoDoc, setTipoDoc] = useState<'boleta' | 'factura' | 'ticket'>('boleta')
  const [metodoSel, setMetodoSel] = useState<string>('')
  const [guardando, setGuardando] = useState(false)
  const busRef = useRef<HTMLInputElement>(null)

  const metodoActual = metodoSel || metodos?.[0]?.id || ''

  // Cajas filtered by branch
  const cajasActivas = useMemo(() => {
    const todas = (cajas ?? []).filter(c => c.activa !== false)
    return branchId ? todas.filter(c => c.sucursalId === branchId) : todas
  }, [cajas, branchId])

  const cajaParaAbrir = cajasActivas.find(c => c.id === cajaSelId) ?? cajasActivas[0]

  // Usuarios con acceso a ventas (POS) filtrados por sucursal de la caja seleccionada
  const usuariosPos = useMemo(() => {
    const todos = (userProfiles ?? []).filter(u => u.activo !== false)
    const todosCargos = [...CARGOS_DEFAULT, ...(cargosCustom ?? [])]
    const sucursalId = cajaParaAbrir?.sucursalId
    return todos.filter(u => {
      const cargoId = userCargoMap?.[u.id]?.cargoId
      const cargo = todosCargos.find(c => c.id === cargoId)
      const tieneVentas = u.role === 'admin' || cargo?.permisos?.ventas === true
      if (!tieneVentas) return false
      if (!sucursalId) return true
      return userCargoMap?.[u.id]?.branchId === sucursalId
    })
  }, [userProfiles, userCargoMap, cargosCustom, cajaParaAbrir])

  const sesionAbierta = useMemo(() => {
    return sesiones?.find(s =>
      s.fecha === today() && s.estado === 'abierta' &&
      (branchId ? s.branchId === branchId : true) &&
      cajasActivas.some(c => c.id === s.cajaId)
    )
  }, [sesiones, branchId, cajasActivas])

  const cajaAbierta = useMemo(() => sesionAbierta ? cajas?.find(c => c.id === sesionAbierta.cajaId) : undefined, [sesionAbierta, cajas])

  // Totales del día para cierre
  const totalesHoy = useMemo(() => {
    if (!cajaAbierta) return { efectivo: 0, debito: 0, credito: 0, transferencia: 0, otro: 0, _total: 0, _count: 0 }
    const mpMap: Record<string, string> = {}
    ;(metodos ?? []).forEach(m => { mpMap[m.id] = (m.label ?? '').toLowerCase() })
    const ventasHoy = (ventas ?? []).filter(v =>
      v.estado !== 'anulada' && v.fecha === today() && v.cajaId === cajaAbierta.id
    )
    const totales = { efectivo: 0, debito: 0, credito: 0, transferencia: 0, otro: 0, _total: 0, _count: 0 }
    ventasHoy.forEach(v => {
      const label = mpMap[v.metodo_pago] ?? v.metodo_pago ?? ''
      const monto = +v.total_iva || 0
      totales._total += monto; totales._count++
      if (label.includes('efect')) totales.efectivo += monto
      else if (label.includes('debit') || label.includes('deb')) totales.debito += monto
      else if (label.includes('credit') || label.includes('cred')) totales.credito += monto
      else if (label.includes('transf')) totales.transferencia += monto
      else totales.otro += monto
    })
    return totales
  }, [ventas, cajaAbierta, metodos])

  const esperadoEfect = totalesHoy.efectivo + (sesionAbierta?.apertura?.montoInicial ?? 0)
  const contado = parseFloat(conteoEfect) || 0
  const diferencia = contado - esperadoEfect

  async function abrirCaja() {
    if (!cajaParaAbrir) return
    setGuardandoCaja(true)
    const nuevaSesion: CajaSesion = {
      id: 'cs-' + Date.now(),
      branchId: cajaParaAbrir.sucursalId ?? '',
      cajaId: cajaParaAbrir.id,
      fecha: today(),
      estado: 'abierta',
      apertura: {
        hora: nowTime(),
        responsable: responsable.trim() || nombreUsuario || '—',
        montoInicial: parseFloat(fondo) || 0,
      },
      cierre: null,
    }
    await guardarSesiones.mutateAsync([...(sesiones ?? []), nuevaSesion])
    setFondo('')
    setResponsable('')
    setGuardandoCaja(false)
  }

  async function cerrarCaja() {
    if (!sesionAbierta) return
    setGuardandoCaja(true)
    const updated = (sesiones ?? []).map(s =>
      s.id === sesionAbierta.id
        ? {
          ...s, estado: 'cerrada' as const,
          cierre: {
            hora: nowTime(),
            conteoEfectivo: contado,
            diferencia,
            observaciones: obsCierre.trim(),
            totalVentas: totalesHoy._total,
            conteo: totalesHoy._count,
          },
        }
        : s
    )
    await guardarSesiones.mutateAsync(updated)
    setCerrando(false)
    setConteoEfect('')
    setObsCierre('')
    setGuardandoCaja(false)
  }

  const totalIva = items.reduce((s, it) => s + lineTotal(it), 0)
  const totalNeto = items.reduce((s, it) => s + lineNeto(it), 0)

  const otsListas = useMemo(() => (ordenes ?? []).filter(o => o.status === 'Listo'), [ordenes])
  const otResultados = useMemo(() => {
    const q = busquedaOT.trim().toLowerCase()
    if (!q) return otsListas.slice(0, 6)
    return otsListas.filter(o =>
      o.nombre?.toLowerCase().includes(q) ||
      o.num?.toLowerCase().includes(q) ||
      o.modelo?.toLowerCase().includes(q)
    ).slice(0, 6)
  }, [otsListas, busquedaOT])

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

  function seleccionarOT(ot: Orden) {
    setOtSeleccionada(ot)
    setBusquedaOT('')
    setOtPanelOpen(false)
    setCliente([ot.nombre, ot.apellido].filter(Boolean).join(' '))
    setClienteRut(ot.rut ?? '')
    setClienteTel(ot.tel ?? '')
    setClienteEmail(ot.email ?? '')
    const nuevosItems: VentaItem[] = []
    if (ot.trabajo && ot.presup) {
      const precioIva = +ot.presup
      nuevosItems.push({
        id: uid(), producto_id: 'ot-servicio',
        producto_nombre: `Servicio: ${ot.trabajo.slice(0, 80)}`,
        cantidad: 1, precio_neto: Math.round(precioIva / (1 + IVA)),
        precio_iva: precioIva, descuento: 0, subtotal: Math.round(precioIva / (1 + IVA)),
      })
    }
    for (const r of ot.repuestos ?? []) {
      const precioIva = r.precio
      nuevosItems.push({
        id: uid(), producto_id: r.productId ?? ('rep-' + uid()),
        producto_nombre: r.name,
        cantidad: r.qty, precio_neto: Math.round(precioIva / (1 + IVA)),
        precio_iva: precioIva, descuento: 0, subtotal: Math.round(precioIva / (1 + IVA) * r.qty),
      })
    }
    if (nuevosItems.length) setItems(nuevosItems)
  }

  function deseleccionarOT() {
    setOtSeleccionada(null)
    setItems([])
    setCliente('')
    setClienteRut('')
    setClienteTel('')
    setClienteEmail('')
  }

  function limpiarCarrito() {
    setItems([])
    setBusqueda('')
    setCliente('')
    setClienteRut('')
    setClienteTel('')
    setClienteEmail('')
    setOtSeleccionada(null)
  }

  async function confirmarVenta() {
    if (!metodoActual || !items.length) return
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
        metodo_pago: metodoActual,
        tipo_doc: tipoDoc,
        branchId: cajaAbierta?.sucursalId ?? '',
        branchNombre: '',
        bodega_id: cajaAbierta?.bodegaId ?? '',
        cajaId: sesionAbierta?.cajaId ?? '',
        otId: otSeleccionada?.id ?? null,
        otNum: otSeleccionada?.num ?? null,
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

      // Movimiento de inventario: salida por venta
      const prodsSalida = venta.items.filter(it => it.producto_id && it.producto_id !== 'ot-servicio' && !it.producto_id.startsWith('rep-'))
      if (prodsSalida.length > 0) {
        const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
        const mov = {
          id: uid(), fecha: today(), hora,
          tipo: 'salida' as const,
          productos: prodsSalida.map(it => ({ producto_id: it.producto_id!, producto_nombre: it.producto_nombre, cantidad: it.cantidad })),
          bodega_origen: cajaAbierta ? (cajaAbierta.nombre ?? '') : '',
          referencia: venta.numero,
          referencia_id: venta.id,
          notas: 'Venta registrada',
        }
        await guardarMovimientos.mutateAsync([mov, ...(movimientos ?? [])])
        // Descontar stock de productos
        const prodsActualizados = (productos ?? []).map(p => {
          const vendido = prodsSalida.find(it => it.producto_id === p.id)
          if (!vendido) return p
          return { ...p, stock: Math.max(0, (p.stock ?? 0) - vendido.cantidad) }
        })
        await guardarProductos.mutateAsync(prodsActualizados)
      }

      if (otSeleccionada) {
        const ordenActualizada = {
          ...otSeleccionada,
          status: 'Entregado' as const,
          venta_id: venta.id,
          numero_boleta: numero,
          deliveredAt: today(),
        }
        await guardarOrden.mutateAsync(
          (ordenes ?? []).map(o => o.id === otSeleccionada.id ? ordenActualizada : o)
        )
        setOtSeleccionada(null)
      }
      setItems([])
      setCliente('')
      setClienteRut('')
      setClienteTel('')
      setClienteEmail('')
      setBusqueda('')
    } finally {
      setGuardando(false)
    }
  }

  // Gate: no caja open for this branch
  if (!sesionAbierta) {
    const fechaLarga = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
    return (
      <div className="flex flex-col h-[calc(100vh-8rem)]">
        {/* Header de página */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0">
            {/* ti-cash-register */}
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <rect x="5" y="4" width="14" height="5" rx="1" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h16v10a2 2 0 01-2 2H6a2 2 0 01-2-2V9z" />
              <circle cx="9" cy="14" r="1" />
              <circle cx="15" cy="14" r="1" />
              <path strokeLinecap="round" d="M8 18h8" />
              <path strokeLinecap="round" d="M12 4v5" />
            </svg>
          </div>
          <div>
            <p className="text-base font-semibold text-gray-900">Punto de venta</p>
            <p className="text-xs text-gray-400 capitalize">{fechaLarga}</p>
          </div>
        </div>

        {cajasActivas.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center max-w-lg">
            <p className="text-sm text-gray-400">No hay cajas configuradas para esta sucursal.</p>
            <p className="text-xs text-gray-400 mt-1">Configura cajas en Configuración › Ventas.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden max-w-lg">
            {/* Estado del día */}
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wide font-medium">Estado del día</p>
                <p className="text-sm font-semibold text-gray-700 mt-0.5">Sin sesión activa</p>
              </div>
              <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-full">
                {/* ti-lock */}
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="5" y="11" width="14" height="10" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 018 0v4" /></svg>
                Caja cerrada
              </span>
            </div>

            <div className="px-6 py-5 space-y-5">
              {/* Selector de caja */}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-2">Selecciona la caja</label>
                <div className="flex gap-2 flex-wrap">
                  {cajasActivas.map(c => (
                    <button key={c.id} onClick={() => setCajaSelId(c.id)}
                      className={['flex items-center gap-2 px-4 py-2 rounded-xl border-2 text-sm font-medium transition',
                        (cajaParaAbrir?.id === c.id)
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300'].join(' ')}>
                      {/* ti-building-store */}
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M3 21h18M4 21V10.5M20 21V10.5M4.5 10.5h15L18 4H6L4.5 10.5zM9 21v-5h6v5M9 10.5V7m3 3.5V7m3 3.5V7" /></svg>
                      {c.nombre}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fondo + Responsable */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-2">Fondo inicial</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                    <input type="number" value={fondo} onChange={e => setFondo(e.target.value)}
                      placeholder="0"
                      className="w-full pl-6 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500 block mb-2">Responsable</label>
                  <select value={responsable} onChange={e => setResponsable(e.target.value)}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm bg-gray-50 focus:outline-none focus:border-blue-400 transition">
                    {usuariosPos.length === 0 && (
                      <option value={nombreUsuario || ''}>{nombreUsuario || '—'}</option>
                    )}
                    {usuariosPos.map(u => (
                      <option key={u.id} value={u.nombre}>{u.nombre}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Info sucursal */}
              {cajaParaAbrir && (
                <div className="flex items-center gap-2 text-xs text-gray-400 border-t border-gray-100 pt-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
                  Sucursal <span className="font-medium text-gray-500 ml-1">{cajaParaAbrir.nombre}</span>
                  <span className="ml-auto">Sin ventas registradas hoy</span>
                </div>
              )}
            </div>

            {/* Botón */}
            <div className="px-6 pb-6">
              <button onClick={abrirCaja} disabled={guardandoCaja || !cajaParaAbrir}
                className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-semibold py-3 rounded-xl hover:bg-blue-700 disabled:opacity-60 transition text-sm">
                {/* ti-lock-open */}
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><rect x="5" y="11" width="14" height="10" rx="2" /><path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 018 0" /></svg>
                {guardandoCaja ? 'Abriendo…' : 'Abrir caja'}
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Closing modal overlay
  if (cerrando) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-8rem)]">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm w-full max-w-md overflow-hidden">
          <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-gray-900">Cerrar caja</h2>
              <p className="text-xs text-gray-400 mt-0.5">{cajaAbierta?.nombre} · {today()}</p>
            </div>
            <button onClick={() => setCerrando(false)} className="text-gray-400 hover:text-gray-600 p-1">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-6 py-5 space-y-4">
            <div className="space-y-2">
              {[
                { label: 'Sistema espera (efectivo + fondo)', value: esperadoEfect },
                ...(totalesHoy.debito > 0 ? [{ label: 'Débito', value: totalesHoy.debito }] : []),
                ...(totalesHoy.credito > 0 ? [{ label: 'Crédito', value: totalesHoy.credito }] : []),
                ...(totalesHoy.transferencia > 0 ? [{ label: 'Transferencia', value: totalesHoy.transferencia }] : []),
              ].map((row, i) => (
                <div key={i} className="flex justify-between items-center bg-gray-50 rounded-lg px-4 py-2 text-sm">
                  <span className="text-gray-500">{row.label}</span>
                  <span className="text-gray-700">{fmt(row.value)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center bg-blue-50 rounded-lg px-4 py-2.5 text-sm">
                <span className="font-semibold text-blue-700">Total ventas ({totalesHoy._count})</span>
                <span className="font-bold text-blue-700">{fmt(totalesHoy._total)}</span>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Efectivo contado</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">$</span>
                <input type="number" value={conteoEfect} onChange={e => setConteoEfect(e.target.value)}
                  autoFocus placeholder="0"
                  className="w-full pl-6 pr-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              {conteoEfect && (
                <p className={['text-sm font-semibold mt-1.5',
                  diferencia === 0 ? 'text-gray-400' : diferencia > 0 ? 'text-green-600' : 'text-red-600'].join(' ')}>
                  {diferencia === 0 ? 'Cuadrado exacto'
                    : diferencia > 0 ? `Sobrante ${fmt(diferencia)}`
                    : `Faltante ${fmt(Math.abs(diferencia))}`}
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 block mb-1">Observaciones</label>
              <textarea value={obsCierre} onChange={e => setObsCierre(e.target.value)}
                rows={2} placeholder="Ej: faltante de $5.000..."
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setCerrando(false)}
                className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-100 transition">
                Cancelar
              </button>
              <button onClick={cerrarCaja} disabled={guardandoCaja}
                className="flex-1 bg-gray-900 text-white font-semibold py-2.5 rounded-xl hover:bg-gray-800 disabled:opacity-60 transition">
                {guardandoCaja ? 'Cerrando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-[calc(100vh-8rem)]">
      {/* Panel izquierdo: buscador + carrito */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {/* Buscador OT */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {otSeleccionada ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <span className="flex items-center gap-2 flex-1 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5 min-w-0">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z"/>
                </svg>
                <span className="truncate">OT #{otSeleccionada.num} — {otSeleccionada.nombre}</span>
              </span>
              <button onClick={deseleccionarOT} className="text-gray-400 hover:text-red-500 transition-colors p-1 flex-shrink-0">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="p-4">
              <button
                onClick={() => setOtPanelOpen(o => !o)}
                className="flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 transition-colors w-full text-left"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.7-3.7a6 6 0 0 1-7.9 7.9l-6.9 6.9a2.1 2.1 0 0 1-3-3l6.9-6.9a6 6 0 0 1 7.9-7.9l-3.7 3.7z"/>
                </svg>
                <span className="font-medium">Vincular OT</span>
                {otsListas.length > 0 && (
                  <span className="ml-1 text-xs bg-amber-100 text-amber-700 font-semibold rounded-full px-2 py-0.5">{otsListas.length} lista{otsListas.length !== 1 ? 's' : ''}</span>
                )}
                <svg className={`w-4 h-4 ml-auto transition-transform ${otPanelOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {otPanelOpen && (
                <div className="mt-3">
                  <div className="relative mb-2">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={busquedaOT}
                      onChange={e => setBusquedaOT(e.target.value)}
                      placeholder="Buscar por N°, cliente o equipo…"
                      className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400"
                    />
                  </div>
                  {otsListas.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-3">No hay OTs en estado "Listo"</p>
                  ) : (
                    <ul className="border border-gray-100 rounded-lg overflow-hidden shadow-sm">
                      {otResultados.map(ot => (
                        <li key={ot.id}>
                          <button
                            onClick={() => seleccionarOT(ot)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-gray-800">#{ot.num} — {ot.nombre} {ot.apellido ?? ''}</div>
                              <div className="text-xs text-gray-400 truncate">{ot.modelo ?? ot.trabajo ?? ''}</div>
                            </div>
                            {ot.presup && <span className="text-xs font-semibold text-blue-700 flex-shrink-0">{fmt(+ot.presup)}</span>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

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

      {/* Panel derecho */}
      <div className="w-72 flex flex-col flex-shrink-0 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

          {/* Cliente */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Cliente</label>
            <input
              value={cliente}
              onChange={e => setCliente(e.target.value)}
              placeholder="Cliente genérico"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:border-blue-400"
            />
            {cliente.trim() && (
              <div className="mt-2 flex flex-col gap-1.5">
                <input
                  value={clienteRut}
                  onChange={e => setClienteRut(e.target.value)}
                  placeholder="RUT (ej: 12.345.678-9)"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400"
                />
                <input
                  value={clienteTel}
                  onChange={e => setClienteTel(e.target.value)}
                  placeholder="Teléfono"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400"
                />
                <input
                  value={clienteEmail}
                  onChange={e => setClienteEmail(e.target.value)}
                  placeholder="Email"
                  className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:border-blue-400"
                />
              </div>
            )}
          </div>

          {/* Método de pago */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Método de pago</label>
            <div className="flex flex-col gap-1.5">
              {(metodos ?? []).map(m => {
                const active = metodoActual === m.id
                return (
                  <button
                    key={m.id}
                    onClick={() => setMetodoSel(m.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '10px 12px', borderRadius: 10, width: '100%',
                      textAlign: 'left', cursor: 'pointer', transition: 'all .15s',
                      border: active ? '2px solid #3b82f6' : '1.5px solid #e5e7eb',
                      background: active ? '#eff6ff' : '#fff',
                    }}
                  >
                    <span style={{ color: active ? '#2563eb' : '#6b7280', flexShrink: 0 }}>
                      <IconoMetodo id={m.id} />
                    </span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: 'block', fontWeight: 600, fontSize: 13, color: active ? '#1d4ed8' : '#111827' }}>{m.label}</span>
                      {m.desc && <span style={{ display: 'block', fontSize: 11, color: '#9ca3af' }}>{m.desc}</span>}
                    </span>
                    {active && (
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2.5} style={{ flexShrink: 0 }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tipo de documento */}
          <div>
            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1.5">Documento</label>
            <div className="flex gap-1 bg-gray-200 p-1 rounded-lg">
              {([['boleta', 'Boleta'], ['factura', 'Factura'], ['ticket', 'Sin doc.']] as const).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setTipoDoc(val)}
                  className={['flex-1 py-1.5 text-xs font-semibold rounded-md transition',
                    tipoDoc === val ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'].join(' ')}
                >{lbl}</button>
              ))}
            </div>
          </div>

          {/* Totales */}
          <div className="border-t border-gray-200 pt-3">
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal neto</span>
                <span>{fmt(totalNeto)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>IVA 19%</span>
                <span>{fmt(totalIva - totalNeto)}</span>
              </div>
              <div className="flex justify-between font-bold text-base text-gray-900 pt-1.5 border-t border-gray-200 mt-1.5">
                <span>Total</span>
                <span className="text-blue-700">{fmt(totalIva)}</span>
              </div>
            </div>
            <div className="mt-3 text-xs text-gray-400 bg-green-50 rounded-lg px-3 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              {cajaAbierta?.nombre ?? 'Caja abierta'} · {sesionAbierta.apertura.hora}
            </div>
          </div>
        </div>

        {/* Footer acciones */}
        <div className="p-4 border-t border-gray-200 bg-white flex flex-col gap-2">
          <button
            onClick={confirmarVenta}
            disabled={!items.length || guardando}
            className="w-full bg-gray-900 text-white font-bold py-3.5 rounded-xl text-base hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {guardando ? 'Registrando…' : `Cobrar ${items.length > 0 ? fmt(totalIva) : ''}`}
          </button>
          <button
            onClick={limpiarCarrito}
            disabled={!items.length && !cliente}
            className="w-full text-xs text-gray-400 hover:text-gray-600 py-1 transition disabled:opacity-30"
          >
            Limpiar carrito
          </button>
          <button
            onClick={() => setCerrando(true)}
            className="w-full text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg py-1.5 transition"
          >
            Cerrar caja →
          </button>
        </div>
      </div>
    </div>
  )
}
