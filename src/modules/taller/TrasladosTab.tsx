import { useState, useMemo } from 'react'
import { useTraslados, useGuardarTraslados, useTecnicosExternos, useGuardarTecnicosExternos, useOrdenes, useGuardarOrden, useGastos, useGuardarGastos, usePlanCuentas, useCatCuentaMap, useAsientos, useGuardarAsientos } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { asientoDeGasto, nextNumeroAsiento } from '@/lib/contabilidad'
import { Spinner } from '@/components/shared/Spinner'
import type { Traslado, EstadoTraslado, TecnicoExterno, EstadoOrden } from '@/types'

const PIPELINE_ORDEN: EstadoOrden[] = ['Chequeo', 'Reparación', 'Listo', 'Entregado']
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

const ESTADO_LABEL: Record<EstadoTraslado, string> = {
  'enviado':      'Enviado',
  'en-revision':  'En revisión',
  'listo':        'Listo para retirar',
  'con-problema': 'Con problema',
  'retornado':    'Retornado',
}

const ESTADO_COLORS: Record<EstadoTraslado, string> = {
  'enviado':      'bg-amber-100 text-amber-800',
  'en-revision':  'bg-purple-100 text-purple-800',
  'listo':        'bg-green-100 text-green-800',
  'con-problema': 'bg-red-100 text-red-800',
  'retornado':    'bg-gray-100 text-gray-600',
}

function diasDesde(fechaStr?: string): string {
  if (!fechaStr) return '—'
  const diff = Math.floor((Date.now() - new Date(fechaStr).getTime()) / (1000 * 60 * 60 * 24))
  if (diff === 0) return 'Hoy'
  if (diff === 1) return '1 día'
  return `${diff} días`
}

function fmtFecha(str?: string) {
  if (!str) return '—'
  try {
    return new Date(str).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit' })
  } catch { return str }
}

function nextNumero(traslados: Traslado[]): number {
  if (!traslados.length) return 1
  return Math.max(...traslados.map((t) => t.numero || 0)) + 1
}

interface ModalForm {
  equipo: string
  cliente: string
  order_id: string
  tecnico: string
  tecnico_tel: string
  condicion: string
  precio_acordado: string
  estado: EstadoTraslado
  fecha_envio: string
  fecha_retorno_est: string
  fecha_retorno_real: string
  motivo: string
  notas: string
}

const EMPTY_FORM: ModalForm = {
  equipo: '', cliente: '', order_id: '', tecnico: '', tecnico_tel: '',
  condicion: 'enciende', precio_acordado: '', estado: 'enviado',
  fecha_envio: new Date().toISOString().split('T')[0],
  fecha_retorno_est: '', fecha_retorno_real: '', motivo: '', notas: '',
}

export function TrasladosTab() {
  const { esAdmin } = useAuth()
  const { data: traslados, isLoading } = useTraslados()
  const guardar = useGuardarTraslados()
  const { data: tecnicos } = useTecnicosExternos()
  const guardarTecnicos = useGuardarTecnicosExternos()
  const { data: ordenes } = useOrdenes()
  const guardarOrden = useGuardarOrden()
  const { data: gastos } = useGastos()
  const guardarGastos = useGuardarGastos()
  const { data: planCuentas } = usePlanCuentas()
  const { data: catCuentaMap } = useCatCuentaMap()
  const { data: asientos } = useAsientos()
  const guardarAsientos = useGuardarAsientos()

  // Diálogo "Confirmar retorno"
  const [retorno, setRetorno] = useState<Traslado | null>(null)
  const [retEstadoOrden, setRetEstadoOrden] = useState(true)
  const [retNuevoEstado, setRetNuevoEstado] = useState<EstadoOrden>('Reparación')
  const [retRegistrarPago, setRetRegistrarPago] = useState(true)
  const [retMonto, setRetMonto] = useState('')
  const [retMetodo, setRetMetodo] = useState('Efectivo')
  const [retGuardando, setRetGuardando] = useState(false)

  function abrirRetorno(t: Traslado) {
    setRetorno(t)
    setRetEstadoOrden(!!t.order_id)
    setRetNuevoEstado('Reparación')
    setRetRegistrarPago(!!t.precio_acordado)
    setRetMonto(t.precio_acordado ? String(t.precio_acordado) : '')
    setRetMetodo('Efectivo')
  }

  async function confirmarRetorno() {
    if (!retorno) return
    setRetGuardando(true)
    const hoy = new Date().toISOString().split('T')[0]
    // 1. Marca el traslado como retornado con su fecha real
    await guardar.mutateAsync(all.map((t) =>
      t.id === retorno.id ? { ...t, estado: 'retornado' as EstadoTraslado, fecha_retorno_real: hoy } : t,
    ))
    // 2. Reactiva la orden asociada en el estado elegido
    if (retEstadoOrden && retorno.order_id) {
      await guardarOrden.mutateAsync((ordenes ?? []).map((o) =>
        o.id === retorno.order_id ? { ...o, status: retNuevoEstado } : o,
      ))
    }
    // 3. Registra el pago al técnico como gasto + asiento contable de partida doble
    if (retRegistrarPago && Number(retMonto) > 0) {
      const ordNum = ordenes?.find((o) => o.id === retorno.order_id)?.num
      const gasto = {
        id: uid(),
        fecha: hoy,
        descripcion: `Técnico externo — ${retorno.tecnico}${ordNum ? ` (Orden #${ordNum})` : ''}`,
        monto: Number(retMonto),
        categoria: 'Servicios Tercerizados',
        metodo: retMetodo,
      }
      await guardarGastos.mutateAsync([...(gastos ?? []), gasto])
      const asiento = asientoDeGasto(gasto, planCuentas ?? [], catCuentaMap ?? {}, nextNumeroAsiento(asientos ?? []))
      await guardarAsientos.mutateAsync([...(asientos ?? []), asiento])
    }
    setRetGuardando(false)
    setRetorno(null)
  }

  const [busqueda, setBusqueda] = useState('')
  const [showHistorial, setShowHistorial] = useState(false)
  const [modal, setModal] = useState<{ editId: string | null } | null>(null)
  const [form, setForm] = useState<ModalForm>(EMPTY_FORM)
  const [showTecnicos, setShowTecnicos] = useState(false)
  const [nuevoTecnico, setNuevoTecnico] = useState({ nombre: '', telefono: '' })
  const [guardando, setGuardando] = useState(false)

  const all = traslados ?? []
  const activos = useMemo(
    () => all.filter((t) => t.estado !== 'retornado'),
    [all],
  )
  const retornados = useMemo(
    () => all.filter((t) => t.estado === 'retornado'),
    [all],
  )

  const activosFiltrados = useMemo(() => {
    if (!busqueda.trim()) return activos
    const q = busqueda.toLowerCase()
    return activos.filter(
      (t) =>
        t.equipo.toLowerCase().includes(q) ||
        t.tecnico.toLowerCase().includes(q) ||
        (t.cliente ?? '').toLowerCase().includes(q),
    )
  }, [activos, busqueda])

  // Stats
  const stats = useMemo(() => ({
    enviados:    activos.filter((t) => t.estado === 'enviado').length,
    enRevision:  activos.filter((t) => t.estado === 'en-revision').length,
    listos:      activos.filter((t) => t.estado === 'listo').length,
    conProblema: activos.filter((t) => t.estado === 'con-problema').length,
    retornados:  retornados.length,
  }), [activos, retornados])

  function abrirNuevo() {
    setForm(EMPTY_FORM)
    setModal({ editId: null })
  }

  function abrirEditar(t: Traslado) {
    setForm({
      equipo: t.equipo ?? '',
      cliente: t.cliente ?? '',
      order_id: t.order_id ?? '',
      tecnico: t.tecnico ?? '',
      tecnico_tel: t.tecnico_tel ?? '',
      condicion: t.condicion ?? 'enciende',
      precio_acordado: String(t.precio_acordado ?? ''),
      estado: t.estado,
      fecha_envio: t.fecha_envio ?? '',
      fecha_retorno_est: t.fecha_retorno_est ?? '',
      fecha_retorno_real: t.fecha_retorno_real ?? '',
      motivo: t.motivo ?? '',
      notas: t.notas ?? '',
    })
    setModal({ editId: t.id })
  }

  async function handleGuardar() {
    if (!form.equipo.trim()) return
    if (!form.tecnico.trim()) return
    setGuardando(true)
    const lista = all
    if (modal?.editId) {
      const updated = lista.map((t) =>
        t.id === modal.editId
          ? {
              ...t,
              equipo: form.equipo, cliente: form.cliente, order_id: form.order_id,
              tecnico: form.tecnico, tecnico_tel: form.tecnico_tel,
              condicion: form.condicion, precio_acordado: form.precio_acordado ? Number(form.precio_acordado) : undefined,
              estado: form.estado, fecha_envio: form.fecha_envio,
              fecha_retorno_est: form.fecha_retorno_est, fecha_retorno_real: form.fecha_retorno_real,
              motivo: form.motivo, notas: form.notas,
            }
          : t,
      )
      await guardar.mutateAsync(updated)
    } else {
      const nuevo: Traslado = {
        id: Date.now().toString(),
        numero: nextNumero(lista),
        equipo: form.equipo, cliente: form.cliente, order_id: form.order_id,
        tecnico: form.tecnico, tecnico_tel: form.tecnico_tel,
        condicion: form.condicion, precio_acordado: form.precio_acordado ? Number(form.precio_acordado) : undefined,
        estado: form.estado, fecha_envio: form.fecha_envio,
        fecha_retorno_est: form.fecha_retorno_est, fecha_retorno_real: form.fecha_retorno_real,
        motivo: form.motivo, notas: form.notas,
      }
      await guardar.mutateAsync([...lista, nuevo])
    }
    setGuardando(false)
    setModal(null)
  }

  async function cambiarEstado(id: string, estado: EstadoTraslado) {
    const updated = all.map((t) =>
      t.id === id
        ? { ...t, estado, ...(estado === 'retornado' ? { fecha_retorno_real: new Date().toISOString().split('T')[0] } : {}) }
        : t,
    )
    await guardar.mutateAsync(updated)
  }

  async function eliminar(id: string) {
    if (!esAdmin) return
    if (!confirm('¿Eliminar este traslado?')) return
    await guardar.mutateAsync(all.filter((t) => t.id !== id))
  }

  async function agregarTecnico() {
    if (!nuevoTecnico.nombre.trim()) return
    const lista = tecnicos ?? []
    await guardarTecnicos.mutateAsync([
      ...lista,
      { id: Date.now().toString(), nombre: nuevoTecnico.nombre.trim(), telefono: nuevoTecnico.telefono.trim() },
    ])
    setNuevoTecnico({ nombre: '', telefono: '' })
  }

  async function eliminarTecnico(id: string) {
    if (!esAdmin) return
    if (!confirm('¿Eliminar técnico?')) return
    await guardarTecnicos.mutateAsync((tecnicos ?? []).filter((t) => t.id !== id))
  }

  function seleccionarTecnico(t: TecnicoExterno) {
    setForm((f) => ({ ...f, tecnico: t.nombre, tecnico_tel: t.telefono ?? '' }))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-5">
        {[
          { label: 'Enviados', value: stats.enviados, color: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
          { label: 'En revisión', value: stats.enRevision, color: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
          { label: 'Listos para retirar', value: stats.listos, color: 'text-green-700', bg: 'bg-green-50 border-green-200' },
          { label: 'Con problema', value: stats.conProblema, color: 'text-red-700', bg: 'bg-red-50 border-red-200' },
          { label: 'Retornados', value: stats.retornados, color: 'text-gray-500', bg: 'bg-gray-50 border-gray-200' },
        ].map((s) => (
          <div key={s.label} className={`rounded-xl border p-4 ${s.bg}`}>
            <div className={`text-2xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Barra de herramientas */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input type="text" value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar equipo, técnico, cliente…"
            className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={() => setShowTecnicos(true)}
          className="text-sm border border-gray-200 rounded-lg px-3 py-2 bg-white hover:bg-gray-50 transition text-gray-600 font-medium">
          Técnicos externos
        </button>
        <button onClick={abrirNuevo}
          className="inline-flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Derivar OT
        </button>
      </div>

      {/* Tabla activos */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-4">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-700">Traslados activos</span>
          <span className="text-xs text-gray-400">({activosFiltrados.length})</span>
        </div>
        {activosFiltrados.length === 0 ? (
          <div className="py-14 text-center text-gray-400 text-sm">
            <svg className="w-10 h-10 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h5M20 20v-5h-5M4 9a8 8 0 0114-3M20 15a8 8 0 01-14 3" />
            </svg>
            <p>{busqueda ? 'Sin resultados' : 'No hay traslados activos'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">OT</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Cliente / Equipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Técnico externo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Envío</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Días fuera</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {activosFiltrados.map((t) => {
                  const ordenVinculada = ordenes?.find((o) => o.id === t.order_id)
                  return (
                  <tr key={t.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      {ordenVinculada ? (
                        <span className="font-mono font-bold text-blue-600 text-sm">#{ordenVinculada.num}</span>
                      ) : (
                        <span className="text-xs text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">
                        {ordenVinculada ? [ordenVinculada.nombre, ordenVinculada.apellido].filter(Boolean).join(' ') : t.cliente || t.equipo}
                      </p>
                      <p className="text-xs text-gray-400">
                        {ordenVinculada ? (ordenVinculada.modelo ?? t.equipo) : t.equipo}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-700">{t.tecnico}</p>
                      {t.tecnico_tel && <p className="text-xs text-gray-400">{t.tecnico_tel}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">{fmtFecha(t.fecha_envio)}</td>
                    <td className="px-4 py-3 font-semibold text-blue-700 text-sm">{diasDesde(t.fecha_envio)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={t.estado}
                        onChange={(e) => {
                          const nuevo = e.target.value as EstadoTraslado
                          if (nuevo === 'retornado') abrirRetorno(t)
                          else cambiarEstado(t.id, nuevo)
                        }}
                        onClick={(e) => e.stopPropagation()}
                        className={`text-base md:text-xs font-semibold border rounded-lg px-2 py-1 cursor-pointer ${ESTADO_COLORS[t.estado] ?? ''}`}
                      >
                        {(Object.keys(ESTADO_LABEL) as EstadoTraslado[]).map((k) => (
                          <option key={k} value={k}>{ESTADO_LABEL[k]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => abrirEditar(t)} className="text-xs text-blue-600 hover:underline font-medium">Editar</button>
                        {esAdmin && <button onClick={() => eliminar(t.id)} className="text-xs text-red-500 hover:underline font-medium">Eliminar</button>}
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

      {/* Historial retornados */}
      {retornados.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <button
            onClick={() => setShowHistorial((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 border-b border-gray-100 text-left hover:bg-gray-50 transition"
          >
            <span className="text-sm font-semibold text-gray-500">Historial — Retornados ({retornados.length})</span>
            <svg className={`w-4 h-4 text-gray-400 transition-transform ${showHistorial ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showHistorial && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">N°</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Equipo</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Técnico</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Retorno</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {retornados.map((t) => (
                    <tr key={t.id} className="hover:bg-gray-50 transition-colors text-gray-500">
                      <td className="px-4 py-3 font-mono text-xs">{String(t.numero || '—').padStart(4, '0')}</td>
                      <td className="px-4 py-3">
                        <p className="text-gray-700">{t.equipo}</p>
                        {t.cliente && <p className="text-xs text-gray-400">{t.cliente}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm">{t.tecnico}</td>
                      <td className="px-4 py-3 text-xs">{fmtFecha(t.fecha_retorno_real)}</td>
                      <td className="px-4 py-3 text-right">
                        {esAdmin && <button onClick={() => eliminar(t.id)} className="text-xs text-red-400 hover:underline">Eliminar</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal traslado */}
      {modal !== null && (
        <TrasladoModal
          form={form}
          setForm={setForm}
          tecnicos={tecnicos ?? []}
          ordenes={ordenes ?? []}
          editId={modal.editId}
          guardando={guardando}
          onSeleccionarTecnico={seleccionarTecnico}
          onGuardar={handleGuardar}
          onClose={() => setModal(null)}
        />
      )}

      {/* Modal técnicos */}
      {showTecnicos && (
        <TecnicosModal
          tecnicos={tecnicos ?? []}
          nuevoTecnico={nuevoTecnico}
          setNuevoTecnico={setNuevoTecnico}
          onAgregar={agregarTecnico}
          onEliminar={eliminarTecnico}
          puedeEliminar={esAdmin}
          onClose={() => setShowTecnicos(false)}
        />
      )}

      {/* Confirmar retorno: reactiva la orden y registra el pago al técnico en contabilidad */}
      {retorno && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget && !retGuardando) setRetorno(null) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7l9 6 9-6M3 7v10a2 2 0 002 2h14a2 2 0 002-2V7M3 7l9-4 9 4" />
                </svg>
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">Confirmar retorno</h3>
                <p className="text-xs text-gray-400 mt-0.5">{retorno.equipo} · Técnico: {retorno.tecnico || '—'}</p>
              </div>
            </div>

            <div className="px-5 py-4 space-y-4 overflow-y-auto">
              {/* Actualizar estado de la orden */}
              {retorno.order_id && (
                <div className="border border-gray-200 rounded-xl p-3.5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input type="checkbox" checked={retEstadoOrden} onChange={(e) => setRetEstadoOrden(e.target.checked)}
                      className="mt-0.5 w-4 h-4 accent-blue-600" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-800">Actualizar estado de la orden
                        {ordenes?.find(o => o.id === retorno.order_id)?.num && (
                          <span className="text-blue-600"> #{ordenes.find(o => o.id === retorno.order_id)!.num}</span>
                        )}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">La reactiva en el taller</p>
                    </div>
                  </label>
                  {retEstadoOrden && (
                    <select value={retNuevoEstado} onChange={(e) => setRetNuevoEstado(e.target.value as EstadoOrden)}
                      className="mt-2.5 w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                      {PIPELINE_ORDEN.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  )}
                </div>
              )}

              {/* Registrar pago al técnico */}
              <div className="border border-gray-200 rounded-xl p-3.5">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={retRegistrarPago} onChange={(e) => setRetRegistrarPago(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-blue-600" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">Registrar pago al técnico</p>
                    <p className="text-xs text-gray-400 mt-0.5">Crea el gasto y su asiento contable</p>
                  </div>
                </label>
                {retRegistrarPago && (
                  <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Monto</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                        <input type="number" value={retMonto} onChange={(e) => setRetMonto(e.target.value)} placeholder="0"
                          className="w-full border border-gray-200 rounded-lg pl-7 pr-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-gray-500 mb-1 block">Forma de pago</label>
                      <select value={retMetodo} onChange={(e) => setRetMetodo(e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-2 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                        {['Efectivo', 'Transferencia', 'Tarjeta', 'Crédito', 'Cheque'].map((m) => <option key={m}>{m}</option>)}
                      </select>
                    </div>
                    <p className="col-span-2 text-[11px] text-gray-400">
                      Se registra como gasto «Servicios Tercerizados» a {retMetodo === 'Crédito' ? 'Cuentas por Pagar' : retMetodo === 'Efectivo' ? 'Caja' : 'Banco'}.
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
              <button onClick={() => setRetorno(null)} disabled={retGuardando}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition disabled:opacity-60">
                Cancelar
              </button>
              <button onClick={confirmarRetorno} disabled={retGuardando}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-60">
                {retGuardando ? 'Guardando…' : 'Confirmar retorno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-componentes ───────────────────────────────────────────

function TrasladoModal({
  form, setForm, tecnicos, ordenes, editId, guardando,
  onSeleccionarTecnico, onGuardar, onClose,
}: {
  form: ModalForm
  setForm: React.Dispatch<React.SetStateAction<ModalForm>>
  tecnicos: TecnicoExterno[]
  ordenes: import('@/types').Orden[]
  editId: string | null
  guardando: boolean
  onSeleccionarTecnico: (t: TecnicoExterno) => void
  onGuardar: () => void
  onClose: () => void
}) {
  const set = (field: keyof ModalForm, val: string) =>
    setForm((f) => ({ ...f, [field]: val }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">
            {editId ? 'Editar traslado' : 'Nuevo traslado'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Orden de trabajo a derivar *</label>
              <select value={form.order_id} onChange={(e) => {
                const ot = ordenes.find(o => o.id === e.target.value)
                setForm(f => ({
                  ...f,
                  order_id: e.target.value,
                  cliente: ot ? [ot.nombre, ot.apellido].filter(Boolean).join(' ') : f.cliente,
                  equipo: ot ? (ot.modelo ?? f.equipo) : f.equipo,
                }))
              }}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                <option value="">Seleccionar OT…</option>
                {ordenes.filter((o) => o.status !== 'Entregado').map((o) => (
                  <option key={o.id} value={o.id}>#{o.num} — {o.nombre} {o.apellido ?? ''} · {o.modelo ?? ''}</option>
                ))}
              </select>
              {form.order_id && (() => {
                const ot = ordenes.find(o => o.id === form.order_id)
                return ot ? (
                  <div className="mt-2 bg-blue-50 rounded-lg px-3 py-2 text-xs text-blue-700">
                    <span className="font-semibold">{[ot.nombre, ot.apellido].filter(Boolean).join(' ')}</span>
                    {ot.modelo && <span className="text-blue-500 ml-2">· {ot.modelo}</span>}
                    {ot.trabajo && <span className="block text-blue-400 mt-0.5 truncate">{ot.trabajo}</span>}
                  </div>
                ) : null
              })()}
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Equipo / descripción</label>
              <input value={form.equipo} onChange={(e) => set('equipo', e.target.value)}
                placeholder="Ej: iPhone 14 Pro Max negro"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Técnico externo *</p>
            {tecnicos.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {tecnicos.map((t) => (
                  <button key={t.id} onClick={() => onSeleccionarTecnico(t)}
                    className={`text-xs px-3 py-1.5 rounded-lg border transition ${form.tecnico === t.nombre ? 'border-blue-400 bg-blue-50 text-blue-700 font-semibold' : 'border-gray-200 bg-gray-50 hover:bg-gray-100'}`}>
                    {t.nombre}
                    {t.telefono && <span className="text-gray-400 ml-1">{t.telefono}</span>}
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Nombre del técnico</label>
                <input value={form.tecnico} onChange={(e) => set('tecnico', e.target.value)}
                  placeholder="Nombre"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Teléfono</label>
                <input value={form.tecnico_tel} onChange={(e) => set('tecnico_tel', e.target.value)}
                  placeholder="+56 9 XXXX XXXX"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 pt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Condición al enviar</label>
              <select value={form.condicion} onChange={(e) => set('condicion', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                <option value="enciende">Enciende</option>
                <option value="apagado">Apagado</option>
                <option value="regular">Regular</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Precio acordado ($)</label>
              <input type="number" value={form.precio_acordado} onChange={(e) => set('precio_acordado', e.target.value)}
                placeholder="0"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Estado</label>
              <select value={form.estado} onChange={(e) => set('estado', e.target.value as EstadoTraslado)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                {(Object.entries(ESTADO_LABEL) as [EstadoTraslado, string][]).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha de envío</label>
              <input type="date" value={form.fecha_envio} onChange={(e) => set('fecha_envio', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-600 mb-1 block">Retorno estimado</label>
              <input type="date" value={form.fecha_retorno_est} onChange={(e) => set('fecha_retorno_est', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
            {form.estado === 'retornado' && (
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Fecha retorno real</label>
                <input type="date" value={form.fecha_retorno_real} onChange={(e) => set('fecha_retorno_real', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
            )}
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Motivo / trabajo a realizar</label>
              <textarea value={form.motivo} onChange={(e) => set('motivo', e.target.value)}
                placeholder="Qué debe hacer el técnico externo…" rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-gray-600 mb-1 block">Notas internas</label>
              <textarea value={form.notas} onChange={(e) => set('notas', e.target.value)}
                placeholder="Observaciones adicionales…" rows={2}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400 resize-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
            Cancelar
          </button>
          <button onClick={onGuardar} disabled={guardando || !form.equipo.trim() || !form.tecnico.trim()}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : editId ? 'Guardar cambios' : 'Crear traslado'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TecnicosModal({
  tecnicos, nuevoTecnico, setNuevoTecnico, onAgregar, onEliminar, puedeEliminar, onClose,
}: {
  tecnicos: TecnicoExterno[]
  nuevoTecnico: { nombre: string; telefono: string }
  setNuevoTecnico: (v: { nombre: string; telefono: string }) => void
  onAgregar: () => void
  onEliminar: (id: string) => void
  puedeEliminar: boolean
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900">Técnicos externos</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 space-y-4 max-h-[60vh] overflow-y-auto">
          {tecnicos.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">No hay técnicos externos registrados</p>
          ) : (
            <div className="space-y-2">
              {tecnicos.map((t) => (
                <div key={t.id} className="flex items-center justify-between py-2 border-b border-gray-50">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{t.nombre}</p>
                    {t.telefono && <p className="text-xs text-gray-400">{t.telefono}</p>}
                  </div>
                  {puedeEliminar && <button onClick={() => onEliminar(t.id)} className="text-xs text-red-400 hover:text-red-600">Eliminar</button>}
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-semibold text-gray-500 mb-3">Agregar técnico</p>
            <div className="flex gap-2">
              <input value={nuevoTecnico.nombre} onChange={(e) => setNuevoTecnico({ ...nuevoTecnico, nombre: e.target.value })}
                placeholder="Nombre"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              <input value={nuevoTecnico.telefono} onChange={(e) => setNuevoTecnico({ ...nuevoTecnico, telefono: e.target.value })}
                placeholder="Teléfono"
                className="w-32 border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              <button onClick={onAgregar} disabled={!nuevoTecnico.nombre.trim()}
                className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
