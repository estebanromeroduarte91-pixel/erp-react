import { useState } from 'react'
import { useBodegas, useGuardarBodegas } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { Bodega } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

const ALL_DIAS = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom']
const LBL_DIAS: Record<string, string> = { lun: 'Lun', mar: 'Mar', mie: 'Mié', jue: 'Jue', vie: 'Vie', sab: 'Sáb', dom: 'Dom' }

function fmtBloque(b: { dias?: string[]; desde?: string; hasta?: string }): string {
  const dias = (b.dias ?? []).filter(d => ALL_DIAS.includes(d))
  const idx = dias.map(d => ALL_DIAS.indexOf(d)).sort((a, z) => a - z)
  let dStr = ''
  if (idx.length) {
    const consec = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1)
    dStr = consec && idx.length > 2
      ? `${LBL_DIAS[ALL_DIAS[idx[0]]]}–${LBL_DIAS[ALL_DIAS[idx[idx.length - 1]]]}`
      : idx.map(i => LBL_DIAS[ALL_DIAS[i]]).join(', ')
  }
  const tStr = b.desde && b.hasta ? `${b.desde}–${b.hasta}` : b.desde || b.hasta || ''
  return [dStr, tStr].filter(Boolean).join(' ')
}

function formatHorario(h: unknown): string {
  if (!h) return ''
  if (typeof h === 'string') return h
  const obj = h as { bloques?: Array<{ dias?: string[]; desde?: string; hasta?: string }> }
  if (Array.isArray(obj.bloques)) return obj.bloques.map(fmtBloque).filter(Boolean).join(' / ')
  return fmtBloque(obj as { dias?: string[]; desde?: string; hasta?: string })
}

const EMPTY_FORM = { nombre: '', direccion: '', tel: '', email: '', horario: '' }

export function BodegasTab() {
  const { data: bodegas, isLoading } = useBodegas()
  const guardar = useGuardarBodegas()

  const [modal, setModal] = useState<{ open: boolean; id: string | null; form: typeof EMPTY_FORM }>({
    open: false, id: null, form: EMPTY_FORM,
  })
  const [guardando, setGuardando] = useState(false)

  function abrirNueva() {
    setModal({ open: true, id: null, form: EMPTY_FORM })
  }

  function abrirEditar(b: Bodega) {
    setModal({
      open: true,
      id: b.id,
      form: {
        nombre: b.nombre ?? b.name ?? '',
        direccion: b.direccion ?? '',
        tel: b.tel ?? '',
        email: b.email ?? '',
        horario: formatHorario(b.horario),
      },
    })
  }

  function set(k: keyof typeof EMPTY_FORM, v: string) {
    setModal(m => ({ ...m, form: { ...m.form, [k]: v } }))
  }

  async function guardarModal() {
    if (!modal.form.nombre.trim()) return
    setGuardando(true)
    const datos = {
      nombre: modal.form.nombre.trim(),
      name: modal.form.nombre.trim(),
      direccion: modal.form.direccion.trim(),
      tel: modal.form.tel.trim(),
      email: modal.form.email.trim(),
      horario: modal.form.horario.trim(),
    }
    if (modal.id) {
      await guardar.mutateAsync((bodegas ?? []).map(b => b.id === modal.id ? { ...b, ...datos } : b))
    } else {
      const nueva: Bodega = { id: uid(), ...datos }
      await guardar.mutateAsync([...(bodegas ?? []), nueva])
    }
    setGuardando(false)
    setModal({ open: false, id: null, form: EMPTY_FORM })
  }

  async function eliminar(id: string) {
    const b = (bodegas ?? []).find(x => x.id === id)
    if (!confirm(`¿Eliminar "${b?.nombre ?? b?.name}"? Esta acción no se puede deshacer.`)) return
    await guardar.mutateAsync((bodegas ?? []).filter(x => x.id !== id))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          Cada sucursal tiene su dirección, horario y contacto — se usan automáticamente en los correos de órdenes.
        </p>
        <button onClick={abrirNueva}
          className="ml-4 flex-shrink-0 px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition">
          + Nueva sucursal
        </button>
      </div>

      {/* Lista de sucursales */}
      {(bodegas ?? []).length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          No hay sucursales todavía. Agrega la primera.
        </div>
      ) : (
        <div className="space-y-3">
          {(bodegas ?? []).map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{b.nombre ?? b.name}</p>
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
                    {b.direccion && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                        {b.direccion}
                      </span>
                    )}
                    {b.tel && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        {b.tel}
                      </span>
                    )}
                    {b.email && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {b.email}
                      </span>
                    )}
                    {formatHorario(b.horario) && (
                      <span className="text-xs text-gray-500 flex items-center gap-1">
                        <svg className="w-3 h-3 text-gray-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        {formatHorario(b.horario)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <button onClick={() => abrirEditar(b)} className="text-xs text-blue-600 hover:underline font-medium">Editar</button>
                  <button onClick={() => eliminar(b.id)} className="text-xs text-red-500 hover:underline font-medium">Eliminar</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">
                  {modal.id ? 'Editar sucursal' : 'Nueva sucursal'}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {modal.id ? 'Los cambios se aplican en todas las órdenes' : 'Datos de la nueva ubicación'}
                </p>
              </div>
              <button onClick={() => setModal(m => ({ ...m, open: false }))}
                className="text-gray-400 hover:text-gray-600 transition text-lg leading-none">✕</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Nombre de la sucursal *</label>
                <input autoFocus value={modal.form.nombre} onChange={e => set('nombre', e.target.value)}
                  placeholder="Ej: La Dehesa, Providencia, Centro…"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Dirección</label>
                <input value={modal.form.direccion} onChange={e => set('direccion', e.target.value)}
                  placeholder="Ej: Av. San Martín 1240, piso 2"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Teléfono / WhatsApp</label>
                  <input value={modal.form.tel} onChange={e => set('tel', e.target.value)}
                    placeholder="+56 9 XXXX XXXX"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Email de contacto</label>
                  <input type="email" value={modal.form.email} onChange={e => set('email', e.target.value)}
                    placeholder="sucursal@taller.cl"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 block mb-1">Horario de atención</label>
                <input value={modal.form.horario} onChange={e => set('horario', e.target.value)}
                  placeholder="Ej: Lun–Vie 10:00–19:00, Sáb 10:00–14:00"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
                <p className="text-[11px] text-gray-400 mt-1">Este horario aparece en los correos de órdenes listas para retirar.</p>
              </div>

              {modal.id && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-2">Zona de peligro</p>
                  <button onClick={() => { setModal(m => ({ ...m, open: false })); eliminar(modal.id!) }}
                    className="w-full text-sm font-semibold text-red-600 border border-red-200 rounded-lg py-2 hover:bg-red-50 transition">
                    Eliminar esta sucursal
                  </button>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
              <button onClick={() => setModal(m => ({ ...m, open: false }))}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                Cancelar
              </button>
              <button onClick={guardarModal} disabled={guardando || !modal.form.nombre.trim()}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                {guardando ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
