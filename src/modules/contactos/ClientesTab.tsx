import { useState, useMemo } from 'react'
import { useClientes, useGuardarClientes } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { Cliente } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
function initials(nombre: string) {
  return nombre.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

const COLORS = ['bg-blue-100 text-blue-700', 'bg-purple-100 text-purple-700',
  'bg-green-100 text-green-700', 'bg-orange-100 text-orange-700', 'bg-pink-100 text-pink-700']

export function ClientesTab() {
  const { data: clientes, isLoading } = useClientes()
  const guardar = useGuardarClientes()
  const { esAdmin } = useAuth()

  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Cliente | null | 'nuevo'>('nuevo' as unknown as null)
  const [modalOpen, setModalOpen] = useState(false)

  const lista = useMemo(() => {
    if (!busqueda.trim()) return clientes ?? []
    const q = busqueda.toLowerCase()
    return (clientes ?? []).filter(c =>
      `${c.nombre} ${c.apellido ?? ''}`.toLowerCase().includes(q) ||
      (c.rut ?? '').includes(q) || (c.email ?? '').toLowerCase().includes(q) ||
      (c.tel ?? '').includes(q)
    )
  }, [clientes, busqueda])

  function abrirNuevo() { setEditando(null); setModalOpen(true) }
  function abrirEditar(c: Cliente) { setEditando(c); setModalOpen(true) }

  async function eliminar(c: Cliente) {
    if (!esAdmin) return
    if (!confirm(`¿Eliminar a "${c.nombre} ${c.apellido ?? ''}"?`)) return
    await guardar.mutateAsync((clientes ?? []).filter(x => x.id !== c.id))
  }

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-4 flex gap-3 items-center">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input value={busqueda} onChange={e => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre, RUT, email, teléfono..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={abrirNuevo}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo cliente
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-2 px-1">{lista.length} clientes</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">
            {busqueda ? 'Sin resultados' : 'No hay clientes todavía'}
          </p>
        ) : (
          <ul className="divide-y divide-gray-50">
            {lista.map((c, i) => {
              const nombre = `${c.nombre} ${c.apellido ?? ''}`.trim()
              const color = COLORS[i % COLORS.length]
              return (
                <li key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${color}`}>
                    {initials(nombre)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-800 truncate">{nombre}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {[c.rut, c.email, c.tel].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                    </p>
                  </div>
                  {c.tel && (
                    <a href={`https://wa.me/${c.tel.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                      className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center hover:bg-green-100 transition flex-shrink-0"
                      title="WhatsApp">
                      <svg className="w-3.5 h-3.5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
                      </svg>
                    </a>
                  )}
                  <div className="flex gap-2">
                    <button onClick={() => abrirEditar(c)} className="text-xs text-blue-600 hover:underline font-medium">Editar</button>
                    {esAdmin && <button onClick={() => eliminar(c)} className="text-xs text-red-500 hover:underline font-medium">Eliminar</button>}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {modalOpen && (
        <ContactoModal
          titulo="cliente"
          campos={CAMPOS_CLIENTE}
          datos={editando as unknown as Record<string, string> | null}
          onClose={() => setModalOpen(false)}
          onGuardar={async (datos) => {
            const lista2 = clientes ?? []
            if (datos.id) {
              await guardar.mutateAsync(lista2.map(x => x.id === datos.id ? { ...x, ...datos } as Cliente : x))
            } else {
              await guardar.mutateAsync([...lista2, { id: uid(), fecha_creacion: new Date().toISOString(), ...datos } as unknown as Cliente])
            }
          }}
        />
      )}
    </div>
  )
}

const CAMPOS_CLIENTE = [
  { key: 'nombre',   label: 'Nombre *',      placeholder: 'Juan',          required: true },
  { key: 'apellido', label: 'Apellido',       placeholder: 'Pérez' },
  { key: 'rut',      label: 'RUT',            placeholder: '12.345.678-9' },
  { key: 'tel',      label: 'Teléfono',       placeholder: '+56 9 XXXX XXXX' },
  { key: 'email',    label: 'Email',          placeholder: 'correo@ejemplo.com', type: 'email' },
]

// ── Modal genérico reutilizable ───────────────────────────────

interface Campo { key: string; label: string; placeholder?: string; type?: string; required?: boolean }

function ContactoModal({ titulo, campos, datos, onClose, onGuardar }: {
  titulo: string
  campos: Campo[]
  datos: Record<string, string> | null
  onClose: () => void
  onGuardar: (d: Record<string, string>) => Promise<void>
}) {
  const [form, setForm] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    campos.forEach(c => { init[c.key] = (datos as Record<string, string> | null)?.[c.key] ?? '' })
    if (datos && 'id' in datos) init.id = (datos as Record<string, string>).id
    return init
  })
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)

  async function handleGuardar() {
    const req = campos.find(c => c.required && !form[c.key]?.trim())
    if (req) { setError(`${req.label.replace(' *', '')} es obligatorio`); return }
    setError(''); setGuardando(true)
    await onGuardar(form)
    setGuardando(false); onClose()
  }

  const isEditing = !!datos

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900 capitalize">
            {isEditing ? `Editar ${titulo}` : `Nuevo ${titulo}`}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-6 py-4 grid grid-cols-2 gap-3">
          {campos.map(c => (
            <div key={c.key} className={campos.length % 2 !== 0 && campos.indexOf(c) === campos.length - 1 ? 'col-span-2' : ''}>
              <label className="text-xs font-medium text-gray-600 mb-1 block">{c.label}</label>
              <input type={c.type ?? 'text'} value={form[c.key]} onChange={e => setForm(f => ({ ...f, [c.key]: e.target.value }))}
                placeholder={c.placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
            </div>
          ))}
          {error && <p className="col-span-2 text-sm text-red-600 font-medium">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">Cancelar</button>
          <button onClick={handleGuardar} disabled={guardando}
            className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {guardando ? 'Guardando…' : isEditing ? 'Guardar cambios' : `Crear ${titulo}`}
          </button>
        </div>
      </div>
    </div>
  )
}

export { ContactoModal }
