import { useState, useEffect, useRef } from 'react'
import { useGuardarOrden, useClientes, useGuardarClientes, useProductos, useChecklist } from '@/lib/queries'
import { Money } from '@/components/shared/Money'
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
  nombre: string; tel: string; email: string; rut: string
  modelo: string; serie: string; color: string; pin: string
  estadoFisico: string; trabajo: string; tecnico: string
  presup: string; costo: string; status: EstadoOrden; fechaEstimada: string
}

const EMPTY: FormData = {
  nombre: '', tel: '', email: '', rut: '', modelo: '', serie: '',
  color: '', pin: '', estadoFisico: '', trabajo: '', tecnico: '',
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
      nombre: orden.nombre ?? '', tel: orden.tel ?? '', email: orden.email ?? '',
      rut: orden.rut ?? '', modelo: orden.modelo ?? '', serie: orden.serie ?? '',
      color: orden.color ?? '', pin: orden.pin ?? '', estadoFisico: orden.estadoFisico ?? '',
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

  // Autocomplete cliente
  const [acClientes, setAcClientes] = useState<typeof clientes>([])
  const acRef = useRef<HTMLDivElement>(null)

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

  function onNombreChange(val: string) {
    set('nombre', val)
    if (!val.trim()) { setAcClientes([]); return }
    const q = val.toLowerCase()
    setAcClientes(
      (clientes ?? [])
        .filter((c) => `${c.nombre} ${c.apellido ?? ''}`.toLowerCase().includes(q) || c.tel?.includes(q))
        .slice(0, 6)
    )
  }

  function selectCliente(c: NonNullable<typeof clientes>[number]) {
    setForm((f) => ({
      ...f,
      nombre: `${c.nombre} ${c.apellido ?? ''}`.trim(),
      tel: c.tel ?? f.tel,
      email: c.email ?? f.email,
      rut: c.rut ?? f.rut,
    }))
    setAcClientes([])
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
      if (acRef.current && !acRef.current.contains(e.target as Node)) setAcClientes([])
      if (repRef.current && !repRef.current.contains(e.target as Node)) setRepOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  async function handleGuardar() {
    if (!form.nombre.trim()) { setError('El nombre del cliente es requerido'); return }
    if (!form.modelo.trim()) { setError('El equipo / modelo es requerido'); return }
    setError('')
    setGuardando(true)

    const ahora = new Date().toISOString()
    let nuevasOrdenes: Orden[]

    // Adjunta flags especiales al array del checklist (igual que el ERP original)
    const checkFinal = [...checkIngreso] as CheckItem[] & { _apagado?: boolean; _mojado?: boolean }
    checkFinal._apagado = checkApagado
    checkFinal._mojado = checkMojado

    if (isEditing) {
      nuevasOrdenes = ordenes.map((o) =>
        o.id === orden!.id
          ? { ...o, ...form, repuestos, checkIngreso: checkFinal, photosIngreso: fotos }
          : o
      )
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

      const lista = clientes ?? []
      const yaExiste = lista.find(
        (c) => (form.rut && c.rut === form.rut) ||
          `${c.nombre} ${c.apellido ?? ''}`.trim().toLowerCase() === form.nombre.toLowerCase()
      )
      if (!yaExiste) {
        const partes = form.nombre.split(' ')
        await guardarClientes.mutateAsync([...lista, {
          id: `cli-tp-${Date.now()}`, nombre: partes[0],
          apellido: partes.slice(1).join(' '), rut: form.rut,
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
            <div className="grid grid-cols-2 gap-3">
              <div className="relative col-span-2" ref={acRef}>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre completo *</label>
                <input
                  value={form.nombre}
                  onChange={(e) => onNombreChange(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
                />
                {acClientes && acClientes.length > 0 && (
                  <div className="absolute top-full left-0 right-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 overflow-hidden">
                    {acClientes.map((c) => (
                      <button key={c.id} onMouseDown={() => selectCliente(c)}
                        className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors">
                        <span className="font-medium text-gray-800">{c.nombre} {c.apellido}</span>
                        {c.tel && <span className="text-gray-400 ml-2 text-xs">{c.tel}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <Field label="Teléfono" value={form.tel} onChange={(v) => set('tel', v)} placeholder="+56 9 XXXX XXXX" />
              <Field label="Correo electrónico" type="email" value={form.email} onChange={(v) => set('email', v)} placeholder="correo@ejemplo.com" />
              <Field label="RUT" value={form.rut} onChange={(v) => set('rut', v)} placeholder="12.345.678-9" />
            </div>
          </section>

          {/* ── Equipo ── */}
          <section>
            <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Datos del equipo</h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Field label="Modelo / Equipo *" value={form.modelo} onChange={(v) => set('modelo', v)} placeholder="Ej: iPhone 14 Pro Max" />
              </div>
              <Field label="N° Serie / IMEI" value={form.serie} onChange={(v) => set('serie', v)} placeholder="C8QH2XXXXXX" />
              <Field label="Color" value={form.color} onChange={(v) => set('color', v)} placeholder="Negro, Blanco..." />
              <Field label="Contraseña / PIN" value={form.pin} onChange={(v) => set('pin', v)} placeholder="Ej: 1234" />
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
              <Field label="Costo real ($)" type="number" value={form.costo} onChange={(v) => set('costo', v)} placeholder="0" />
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
              {fotos.length < 6 && (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-blue-600 border border-blue-200 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition"
                >
                  + Agregar fotos
                </button>
              )}
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
