import { useState, useEffect, useRef } from 'react'
import { useGuardarOrden, useClientes, useGuardarClientes, useProductos, useChecklist } from '@/lib/queries'
import { Money } from '@/components/shared/Money'
import { EquipoSelector } from './EquipoSelector'
import { PatternLockModal } from './PatternLockModal'
import { QrFotosModal } from './QrFotosModal'
import type { Orden, EstadoOrden, Repuesto, Producto, CheckItem } from '@/types'

const ESTADOS_OT: EstadoOrden[] = ['Chequeo', 'Reparación', 'Listo', 'Entregado', 'No reparable']

interface Props {
  orden: Orden | null
  ordenes: Orden[]
  onClose: () => void
}

function nextNum(ordenes: Orden[]): string {
  if (!ordenes.length) return '0001'
  const max = Math.max(...ordenes.map((o) => parseInt(o.num) || 0))
  return String(max + 1).padStart(4, '0')
}

interface FormData {
  nombre: string; apellido: string; tel: string; email: string; rut: string
  modelo: string; serie: string; color: string; pin: string; pinType: 'text' | 'pattern'
  estadoFisico: string; trabajo: string; tecnico: string
  presup: string; costo: string; status: EstadoOrden; fechaEstimada: string
}

const EMPTY: FormData = {
  nombre: '', apellido: '', tel: '', email: '', rut: '', modelo: '', serie: '',
  color: '', pin: '', pinType: 'text', estadoFisico: '', trabajo: '', tecnico: '',
  presup: '', costo: '', status: 'Chequeo', fechaEstimada: '',
}

export function OrdenModal({ orden, ordenes, onClose }: Props) {
  const guardar = useGuardarOrden()
  const { data: clientes } = useClientes()
  const guardarClientes = useGuardarClientes()
  const { data: productos } = useProductos()
  const { data: checklistLabels } = useChecklist()

  const [form, setForm] = useState<FormData>(() =>
    orden ? {
      nombre: orden.nombre ?? '', apellido: orden.apellido ?? '',
      tel: orden.tel ?? '', email: orden.email ?? '',
      rut: orden.rut ?? '', modelo: orden.modelo ?? '', serie: orden.serie ?? '',
      color: orden.color ?? '', pin: orden.pin ?? '', pinType: orden.pinType ?? 'text',
      estadoFisico: orden.estadoFisico ?? '',
      trabajo: orden.trabajo ?? '', tecnico: orden.tecnico ?? '',
      presup: String(orden.presup ?? ''), costo: String(orden.costo ?? ''),
      status: orden.status ?? 'Chequeo', fechaEstimada: orden.fechaEstimada ?? '',
    } : EMPTY,
  )
  const [repuestos, setRepuestos] = useState<Repuesto[]>(orden?.repuestos ?? [])
  const [checkIngreso, setCheckIngreso] = useState<CheckItem[]>(orden?.checkIngreso ?? [])
  const [checkApagado, setCheckApagado] = useState(
    (orden?.checkIngreso as (CheckItem[] & { _apagado?: boolean }) | undefined)?._apagado ?? false
  )
  const [checkMojado, setCheckMojado] = useState(
    (orden?.checkIngreso as (CheckItem[] & { _mojado?: boolean }) | undefined)?._mojado ?? false
  )
  const [fotos, setFotos] = useState<string[]>(orden?.photosIngreso ?? [])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [showPattern, setShowPattern] = useState(false)
  const [showQr, setShowQr] = useState(false)
  // ID efectivo de la orden en la BD. En edición = orden.id. En "nueva", se genera
  // un borrador la primera vez que se pide el QR para que las fotos tengan dónde llegar.
  const [draftId, setDraftId] = useState<string | null>(orden?.id ?? null)
  const [creandoBorrador, setCreandoBorrador] = useState(false)

  // Orden fresca desde la lista (se actualiza por realtime cuando llegan fotos del iPhone)
  const ordenLive = draftId ? ordenes.find((o) => o.id === draftId) : null
  const livePhotosLen = ordenLive?.photosIngreso?.length ?? 0
  useEffect(() => {
    const live = ordenLive?.photosIngreso
    if (live && live.length !== fotos.length) setFotos(live)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePhotosLen])

  // Crea (una sola vez) un borrador en la BD para que el QR de fotos pueda enlazarlas
  // de inmediato mientras se completa la orden. Devuelve el id del borrador.
  async function asegurarBorrador(): Promise<string | null> {
    if (draftId) return draftId
    setCreandoBorrador(true)
    const id = Date.now().toString()
    const draft: Orden = {
      id,
      num: nextNum(ordenes),
      fecha: new Date().toISOString(),
      ...form,
      repuestos,
      checkIngreso,
      photosIngreso: fotos,
      _draft: true,
    }
    await guardar.mutateAsync([draft, ...ordenes])
    setDraftId(id)
    setCreandoBorrador(false)
    return id
  }

  async function abrirQr() {
    const id = await asegurarBorrador()
    if (id) setShowQr(true)
  }

  // Buscador de cliente
  const [busquedaCliente, setBusquedaCliente] = useState('')
  const [clienteAbierto, setClienteAbierto] = useState(false)
  const [showNuevoCliente, setShowNuevoCliente] = useState(false)
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', apellido: '', tel: '', email: '', rut: '' })
  const clienteRef = useRef<HTMLDivElement>(null)

  const clienteSeleccionado = form.nombre.trim() || form.apellido.trim()

  const clientesFiltrados = busquedaCliente.trim()
    ? (clientes ?? []).filter((c) => {
        const q = busquedaCliente.toLowerCase()
        return (
          c.nombre.toLowerCase().includes(q) ||
          (c.apellido ?? '').toLowerCase().includes(q) ||
          (c.rut ?? '').toLowerCase().includes(q) ||
          (c.tel ?? '').includes(q)
        )
      }).slice(0, 6)
    : (clientes ?? []).slice(0, 6)

  // Inicializa checklist cuando cargan los labels del servidor
  useEffect(() => {
    if (!checklistLabels?.length) return
    if (checkIngreso.length > 0) return  // ya tiene datos (edición)
    setCheckIngreso(checklistLabels.map((label) => ({ label, checked: false })))
  }, [checklistLabels])  // eslint-disable-line react-hooks/exhaustive-deps

  // Fotos: lee archivos como base64
  function handleFotos(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, 6 - fotos.length)
    files.forEach((f) => {
      const reader = new FileReader()
      reader.onload = (ev) => {
        setFotos((prev) => [...prev, ev.target?.result as string])
      }
      reader.readAsDataURL(f)
    })
    e.target.value = ''
  }

  function toggleCheck(idx: number) {
    setCheckIngreso((list) => list.map((item, i) =>
      i === idx ? { ...item, checked: !item.checked } : item
    ))
  }

  // Buscador de repuestos
  const [repBusqueda, setRepBusqueda] = useState('')
  const [repOpen, setRepOpen] = useState(false)
  const repRef = useRef<HTMLDivElement>(null)

  const isEditing = !!orden

  function handleBackdrop(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  function set(field: keyof FormData, val: string) {
    setForm((f) => ({ ...f, [field]: val }))
  }

  function set2<K extends keyof FormData>(field: K, val: FormData[K]) {
    setForm((f) => ({ ...f, [field]: val }))
  }

  function selectCliente(c: NonNullable<typeof clientes>[number]) {
    setForm((f) => ({
      ...f,
      nombre: c.nombre,
      apellido: c.apellido ?? '',
      tel: c.tel ?? f.tel,
      email: c.email ?? f.email,
      rut: c.rut ?? f.rut,
    }))
    setBusquedaCliente('')
    setClienteAbierto(false)
  }

  function limpiarCliente() {
    setForm((f) => ({ ...f, nombre: '', apellido: '', tel: '', email: '', rut: '' }))
    setBusquedaCliente('')
  }

  const [errorNuevoCliente, setErrorNuevoCliente] = useState('')
  const [clienteDuplicado, setClienteDuplicado] = useState<NonNullable<typeof clientes>[number] | null>(null)

  async function handleCrearCliente() {
    if (!nuevoCliente.nombre.trim()) return
    setErrorNuevoCliente('')
    setClienteDuplicado(null)

    if (nuevoCliente.rut.trim()) {
      const rutNorm = nuevoCliente.rut.trim().toLowerCase().replace(/\s/g, '')
      const existe = (clientes ?? []).find(
        (c) => c.rut && c.rut.toLowerCase().replace(/\s/g, '') === rutNorm
      )
      if (existe) {
        setClienteDuplicado(existe)
        setErrorNuevoCliente(`El RUT ya está registrado a nombre de ${existe.nombre} ${existe.apellido ?? ''}.`)
        return
      }
    }

    const ahora = new Date().toISOString()
    const nuevo = {
      id: `cli-tp-${Date.now()}`,
      nombre: nuevoCliente.nombre.trim(),
      apellido: nuevoCliente.apellido.trim(),
      rut: nuevoCliente.rut.trim(),
      tel: nuevoCliente.tel.trim(),
      email: nuevoCliente.email.trim(),
      fecha_creacion: ahora,
    }
    await guardarClientes.mutateAsync([...(clientes ?? []), nuevo])
    setForm((f) => ({
      ...f,
      nombre: nuevo.nombre,
      apellido: nuevo.apellido,
      tel: nuevo.tel,
      email: nuevo.email,
      rut: nuevo.rut,
    }))
    setNuevoCliente({ nombre: '', apellido: '', tel: '', email: '', rut: '' })
    setShowNuevoCliente(false)
  }

  function usarClienteExistente() {
    if (!clienteDuplicado) return
    selectCliente(clienteDuplicado)
    setNuevoCliente({ nombre: '', apellido: '', tel: '', email: '', rut: '' })
    setErrorNuevoCliente('')
    setClienteDuplicado(null)
    setShowNuevoCliente(false)
  }

  // ── Repuestos ──────────────────────────────────────────────
  const productosFiltrados = repBusqueda.trim()
    ? (productos ?? []).filter((p) =>
        p.nombre.toLowerCase().includes(repBusqueda.toLowerCase()) ||
        p.sku?.toLowerCase().includes(repBusqueda.toLowerCase())
      ).slice(0, 8)
    : []

  function agregarRepuesto(p: Producto) {
    const existe = repuestos.findIndex((r) => r.productId === p.id)
    if (existe >= 0) {
      setRepuestos((rs) => rs.map((r, i) => i === existe ? { ...r, qty: r.qty + 1 } : r))
    } else {
      setRepuestos((rs) => [...rs, { productId: p.id, name: p.nombre, qty: 1, precio: p.precio_venta ?? 0 }])
    }
    setRepBusqueda('')
    setRepOpen(false)
  }

  function editarRepuesto(idx: number, field: 'qty' | 'precio', val: string) {
    setRepuestos((rs) => rs.map((r, i) =>
      i === idx ? { ...r, [field]: field === 'qty' ? Math.max(1, parseInt(val) || 1) : parseFloat(val) || 0 } : r
    ))
  }

  function quitarRepuesto(idx: number) {
    setRepuestos((rs) => rs.filter((_, i) => i !== idx))
  }

  const totalRepuestos = repuestos.reduce((s, r) => s + r.precio * (r.qty ?? 1), 0)

  // Cierra dropdowns al clicar afuera
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (clienteRef.current && !clienteRef.current.contains(e.target as Node)) setClienteAbierto(false)
      if (repRef.current && !repRef.current.contains(e.target as Node)) setRepOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleGuardar() {
    if (!clienteSeleccionado) { setError('Selecciona o crea un cliente'); return }
    if (!form.modelo.trim()) { setError('El equipo / modelo es requerido'); return }
    setError('')
    setGuardando(true)

    const ahora = new Date().toISOString()
    let nuevasOrdenes: Orden[]

    // Adjunta flags especiales al array del checklist (igual que el ERP original)
    const checkFinal = [...checkIngreso] as CheckItem[] & { _apagado?: boolean; _mojado?: boolean }
    checkFinal._apagado = checkApagado
    checkFinal._mojado = checkMojado

    if (draftId) {
      // Edición, o finalización de un borrador creado para el QR. Quita el flag _draft.
      const existe = ordenes.some((o) => o.id === draftId)
      const actualizada = (base: Orden): Orden => ({
        ...base, ...form, repuestos, checkIngreso: checkFinal, photosIngreso: fotos, _draft: false,
      })
      nuevasOrdenes = existe
        ? ordenes.map((o) => (o.id === draftId ? actualizada(o) : o))
        : [actualizada({ id: draftId, num: nextNum(ordenes), fecha: ahora } as Orden), ...ordenes]
    } else {
      const nuevaOrden: Orden = {
        id: Date.now().toString(),
        num: nextNum(ordenes),
        fecha: ahora,
        ...form,
        repuestos,
        checkIngreso: checkFinal,
        photosIngreso: fotos,
      }
      nuevasOrdenes = [nuevaOrden, ...ordenes]
    }

    // Crea el cliente si es la primera vez que se guarda de verdad (no en re-edición)
    if (!isEditing) {
      const lista = clientes ?? []
      const yaExiste = lista.find(
        (c) => (form.rut && c.rut === form.rut) ||
          (c.nombre.toLowerCase() === form.nombre.toLowerCase() &&
           (c.apellido ?? '').toLowerCase() === form.apellido.toLowerCase())
      )
      if (!yaExiste) {
        await guardarClientes.mutateAsync([...lista, {
          id: `cli-tp-${Date.now()}`, nombre: form.nombre.trim(),
          apellido: form.apellido.trim(), rut: form.rut,
          email: form.email, tel: form.tel, fecha_creacion: ahora,
        }])
      }
    }

    await guardar.mutateAsync(nuevasOrdenes)
    setGuardando(false)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={handleBackdrop}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">
              {isEditing ? `Editar orden #${orden!.num}` : 'Nueva orden de trabajo'}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {isEditing ? 'Modifica los datos y guarda' : 'Completa los datos del cliente y equipo'}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-6 py-4 space-y-5">

          {/* ── Cliente ── */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Datos del cliente</h4>
            <div className="relative" ref={clienteRef}>
              {clienteSeleccionado ? (
                /* Cliente seleccionado: muestra chip con nombre y botón para limpiar */
                <div className="flex items-center gap-2 border border-blue-200 bg-blue-50 rounded-lg px-3 py-2">
                  <svg className="w-4 h-4 text-blue-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-blue-800">
                      {[form.nombre, form.apellido].filter(Boolean).join(' ')}
                    </span>
                    {(form.rut || form.tel) && (
                      <span className="text-xs text-blue-500 ml-2">
                        {[form.rut, form.tel].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </div>
                  <button type="button" onClick={limpiarCliente}
                    className="text-blue-400 hover:text-blue-700 p-0.5 flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                /* Sin cliente: buscador + botón + */
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
                      fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      value={busquedaCliente}
                      onChange={(e) => { setBusquedaCliente(e.target.value); setClienteAbierto(true) }}
                      onFocus={() => setClienteAbierto(true)}
                      placeholder="Buscar por nombre, apellido o RUT…"
                      className="w-full border border-gray-200 rounded-lg pl-9 pr-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
                    />
                    {clienteAbierto && (
                      <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                        {clientesFiltrados.length === 0 ? (
                          <p className="text-xs text-gray-400 text-center py-4">Sin resultados</p>
                        ) : (
                          clientesFiltrados.map((c) => (
                            <button key={c.id} onMouseDown={() => selectCliente(c)}
                              className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between">
                              <span className="font-medium text-gray-800">{c.nombre} {c.apellido}</span>
                              <span className="text-gray-400 text-xs">{c.rut ?? c.tel}</span>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button" onClick={() => setShowNuevoCliente(true)}
                    className="w-9 h-9 rounded-lg bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center flex-shrink-0 transition">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* ── Equipo ── */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Datos del equipo</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Modelo / Equipo *</label>
                <EquipoSelector value={form.modelo} onChange={(v) => set('modelo', v)} />
              </div>
              <Field label="N° Serie / IMEI" value={form.serie} onChange={(v) => set('serie', v)} placeholder="C8QH2XXXXXX" />
              <Field label="Color" value={form.color} onChange={(v) => set('color', v)} placeholder="Negro, Blanco..." />
              {/* Contraseña / Patrón */}
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Contraseña / Patrón</label>
                <div className="flex gap-1 mb-1.5">
                  <button type="button" onClick={() => set2('pinType', 'text')}
                    className={['flex-1 text-xs font-medium py-1.5 rounded-lg border transition',
                      form.pinType === 'text' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-500'].join(' ')}>
                    Clave / PIN
                  </button>
                  <button type="button" onClick={() => set2('pinType', 'pattern')}
                    className={['flex-1 text-xs font-medium py-1.5 rounded-lg border transition',
                      form.pinType === 'pattern' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-500'].join(' ')}>
                    Patrón
                  </button>
                </div>
                {form.pinType === 'text' ? (
                  <input value={form.pin} onChange={(e) => set('pin', e.target.value)} placeholder="Ej: 1234 (solo si aplica)"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                ) : (
                  <button type="button" onClick={() => setShowPattern(true)}
                    className="w-full flex items-center justify-between border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 hover:border-blue-400 transition">
                    <span className={form.pin.startsWith('Patrón:') ? 'text-gray-800' : 'text-gray-400'}>
                      {form.pin.startsWith('Patrón:') ? form.pin : 'Sin patrón definido'}
                    </span>
                    <span className="text-xs text-blue-600 font-medium">Dibujar</span>
                  </button>
                )}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Estado</label>
                <select value={form.status} onChange={(e) => set('status', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                  {ESTADOS_OT.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Estado físico del equipo</label>
                <textarea value={form.estadoFisico} onChange={(e) => set('estadoFisico', e.target.value)}
                  placeholder="Rayones, grietas, daños visibles..." rows={2}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
              </div>
              <Field label="Fecha estimada de entrega" type="date" value={form.fechaEstimada} onChange={(v) => set('fechaEstimada', v)} />
            </div>
          </section>

          {/* ── Trabajo ── */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Trabajo a realizar</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="text-xs font-medium text-gray-600 mb-1 block">Descripción del trabajo</label>
                <textarea value={form.trabajo} onChange={(e) => set('trabajo', e.target.value)}
                  placeholder="Ej: Cambio de pantalla, reparación de conector de carga..." rows={3}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
              </div>
              <Field label="Técnico asignado" value={form.tecnico} onChange={(v) => set('tecnico', v)} placeholder="Nombre del técnico" />
              <Field label="Presupuesto estimado ($)" type="number" value={form.presup} onChange={(v) => set('presup', v)} placeholder="0" />
            </div>
          </section>

          {/* ── Repuestos ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Repuestos utilizados</h4>
              <div className="relative" ref={repRef}>
                <button
                  type="button"
                  onClick={() => setRepOpen((o) => !o)}
                  className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition"
                >
                  + Agregar repuesto
                </button>
                {repOpen && (
                  <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-20">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        autoFocus
                        value={repBusqueda}
                        onChange={(e) => setRepBusqueda(e.target.value)}
                        placeholder="Buscar producto..."
                        className="w-full text-sm px-3 py-1.5 border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                      {productosFiltrados.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">
                          {repBusqueda ? 'Sin resultados' : 'Escribe para buscar'}
                        </p>
                      ) : (
                        productosFiltrados.map((p) => (
                          <button
                            key={p.id}
                            onMouseDown={() => agregarRepuesto(p)}
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition flex items-center justify-between"
                          >
                            <span className="font-medium text-gray-800 truncate">{p.nombre}</span>
                            <Money value={p.precio_venta} className="text-xs text-gray-500 ml-2 flex-shrink-0" />
                          </button>
                        ))
                      )}
                    </div>
                    {/* Agregar repuesto manual (sin producto en inventario) */}
                    {repBusqueda.trim() && productosFiltrados.length === 0 && (
                      <div className="p-2 border-t border-gray-100">
                        <button
                          onMouseDown={() => {
                            setRepuestos((rs) => [...rs, { name: repBusqueda.trim(), qty: 1, precio: 0 }])
                            setRepBusqueda('')
                            setRepOpen(false)
                          }}
                          className="w-full text-left px-3 py-2 text-xs text-blue-600 font-medium hover:bg-blue-50 rounded-lg"
                        >
                          Agregar "{repBusqueda.trim()}" manualmente
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {repuestos.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-xl">
                Sin repuestos agregados
              </p>
            ) : (
              <div className="border border-gray-100 rounded-xl overflow-hidden">
                {repuestos.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
                    <span className="flex-1 text-sm text-gray-700 truncate">{r.name}</span>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">Cant.</span>
                      <input
                        type="number" min="1" value={r.qty}
                        onChange={(e) => editarRepuesto(i, 'qty', e.target.value)}
                        className="w-14 text-center text-sm border border-gray-200 rounded-lg px-1 py-0.5 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-gray-400">$</span>
                      <input
                        type="number" min="0" value={r.precio}
                        onChange={(e) => editarRepuesto(i, 'precio', e.target.value)}
                        className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-0.5 focus:outline-none focus:border-blue-400"
                      />
                    </div>
                    <button onClick={() => quitarRepuesto(i)} className="text-red-400 hover:text-red-600 p-1">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 text-sm font-semibold">
                  <span className="text-gray-600">Total repuestos</span>
                  <Money value={totalRepuestos} />
                </div>
              </div>
            )}
          </section>

          {/* ── Checklist de ingreso ── */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Checklist de ingreso</h4>
            <div className="bg-gray-50 rounded-xl p-3 space-y-0.5">
              {/* Ítems configurables */}
              {checkIngreso.map((item, i) => (
                <label key={i} className="flex items-center gap-2.5 py-1.5 cursor-pointer hover:bg-white rounded-lg px-2 transition">
                  <input
                    type="checkbox"
                    checked={item.checked}
                    onChange={() => toggleCheck(i)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                  <span className="text-sm text-gray-700">{item.label}</span>
                </label>
              ))}
              {/* Separador + especiales */}
              {checkIngreso.length > 0 && (
                <div className="border-t border-gray-200 mt-2 pt-2 space-y-0.5">
                  <label className="flex items-center gap-2.5 py-1.5 cursor-pointer hover:bg-white rounded-lg px-2 transition">
                    <input type="checkbox" checked={checkApagado} onChange={(e) => setCheckApagado(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-red-500 focus:ring-red-400" />
                    <span className="text-sm font-medium text-red-600">⚠ Llega apagado</span>
                  </label>
                  <label className="flex items-center gap-2.5 py-1.5 cursor-pointer hover:bg-white rounded-lg px-2 transition">
                    <input type="checkbox" checked={checkMojado} onChange={(e) => setCheckMojado(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-500 focus:ring-blue-400" />
                    <span className="text-sm font-medium text-blue-600">💧 Llega mojado</span>
                  </label>
                </div>
              )}
            </div>
          </section>

          {/* ── Fotos de ingreso ── */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider">
                Fotos de ingreso ({fotos.length}/6)
              </h4>
              <div className="flex items-center gap-2">
                {/* QR para subir fotos desde iPhone — crea un borrador al vuelo si la orden es nueva */}
                <button type="button" onClick={abrirQr} disabled={creandoBorrador}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-600 bg-blue-50 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-100 disabled:opacity-60 transition">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
                    <rect x="3" y="14" width="7" height="7" rx="1" /><path d="M14 14h3v3h-3zM17 17v3M14 17h.01" />
                  </svg>
                  {creandoBorrador ? 'Preparando…' : 'QR iPhone'}
                </button>
                {fotos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition"
                  >
                    + Agregar fotos
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFotos}
              />
            </div>
            {fotos.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-8 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm hover:border-blue-300 hover:text-blue-500 transition"
              >
                Haz clic para agregar fotos del equipo
              </button>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {fotos.map((src, i) => (
                  <div key={i} className="relative aspect-square rounded-xl overflow-hidden border border-gray-200 group">
                    <img src={src} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => setFotos((f) => f.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 w-6 h-6 bg-black/60 text-white rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                {fotos.length < 6 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-blue-300 hover:text-blue-500 transition"
                  >
                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                  </button>
                )}
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
            {guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Crear orden'}
          </button>
        </div>
      </div>

      {/* Modal nuevo cliente */}
      {showNuevoCliente && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setShowNuevoCliente(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-base font-bold text-gray-900">Nuevo cliente</h3>
                <p className="text-xs text-gray-400 mt-0.5">Los datos quedan en el directorio de clientes</p>
              </div>
              <button onClick={() => setShowNuevoCliente(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre *</label>
                  <input value={nuevoCliente.nombre} onChange={(e) => setNuevoCliente((n) => ({ ...n, nombre: e.target.value }))}
                    placeholder="Juan" autoFocus
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Apellido</label>
                  <input value={nuevoCliente.apellido} onChange={(e) => setNuevoCliente((n) => ({ ...n, apellido: e.target.value }))}
                    placeholder="Pérez"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">RUT</label>
                  <input value={nuevoCliente.rut} onChange={(e) => setNuevoCliente((n) => ({ ...n, rut: e.target.value }))}
                    placeholder="12.345.678-9"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Teléfono</label>
                  <input value={nuevoCliente.tel} onChange={(e) => setNuevoCliente((n) => ({ ...n, tel: e.target.value }))}
                    placeholder="+56 9 XXXX XXXX"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Correo electrónico</label>
                <input type="email" value={nuevoCliente.email} onChange={(e) => setNuevoCliente((n) => ({ ...n, email: e.target.value }))}
                  placeholder="correo@ejemplo.com"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
            {errorNuevoCliente && (
              <div className="mx-5 mb-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-xs font-medium text-amber-800">{errorNuevoCliente}</p>
                {clienteDuplicado && (
                  <button onClick={usarClienteExistente}
                    className="mt-1.5 text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-900">
                    Usar este cliente para la orden
                  </button>
                )}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
              <button onClick={() => { setShowNuevoCliente(false); setErrorNuevoCliente(''); setClienteDuplicado(null) }}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                Cancelar
              </button>
              <button onClick={handleCrearCliente} disabled={!nuevoCliente.nombre.trim()}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                Crear cliente
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal patrón de desbloqueo */}
      {showPattern && (
        <PatternLockModal
          initial={form.pin.startsWith('Patrón:')
            ? form.pin.replace('Patrón:', '').trim().split('-').map(Number).filter((n) => !isNaN(n))
            : []}
          onSave={(seq) => { set('pin', `Patrón: ${seq.join('-')}`); setShowPattern(false) }}
          onClose={() => setShowPattern(false)}
        />
      )}

      {/* Modal QR fotos iPhone */}
      {showQr && draftId && (
        <QrFotosModal ordenId={draftId} tipo="ingreso" onClose={() => setShowQr(false)} />
      )}
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
