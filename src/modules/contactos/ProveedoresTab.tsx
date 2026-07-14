import { useState, useMemo } from 'react'
import { useProveedores, useGuardarProveedores } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import { ContactoModal } from './ClientesTab'
import type { Proveedor } from '@/types'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

const CAMPOS_PROVEEDOR = [
  { key: 'nombre',    label: 'Nombre *',       placeholder: 'Proveedor S.A.',    required: true },
  { key: 'rut',       label: 'RUT',            placeholder: '12.345.678-9' },
  { key: 'contacto',  label: 'Persona de contacto', placeholder: 'Juan Pérez' },
  { key: 'telefono',  label: 'Teléfono',       placeholder: '+56 9 XXXX XXXX' },
  { key: 'email',     label: 'Email',          placeholder: 'proveedor@email.com', type: 'email' },
  { key: 'direccion', label: 'Dirección',      placeholder: 'Av. Principal 123' },
  { key: 'notas',     label: 'Notas',          placeholder: 'Observaciones...' },
]

export function ProveedoresTab() {
  const { data: proveedores, isLoading } = useProveedores()
  const guardar = useGuardarProveedores()
  const { esAdmin } = useAuth()

  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<Proveedor | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const lista = useMemo(() => {
    if (!busqueda.trim()) return proveedores ?? []
    const q = busqueda.toLowerCase()
    return (proveedores ?? []).filter(p =>
      p.nombre.toLowerCase().includes(q) ||
      (p.rut ?? '').includes(q) ||
      (p.email ?? '').toLowerCase().includes(q) ||
      (p.contacto ?? '').toLowerCase().includes(q)
    )
  }, [proveedores, busqueda])

  function abrirNuevo() { setEditando(null); setModalOpen(true) }
  function abrirEditar(p: Proveedor) { setEditando(p); setModalOpen(true) }

  async function eliminar(p: Proveedor) {
    if (!esAdmin) return
    if (!confirm(`¿Eliminar a "${p.nombre}"?`)) return
    await guardar.mutateAsync((proveedores ?? []).filter(x => x.id !== p.id))
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
            placeholder="Buscar proveedor..."
            className="w-full pl-9 pr-3 py-2 text-base md:text-sm border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-blue-400" />
        </div>
        <button onClick={abrirNuevo}
          className="flex items-center gap-2 bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo proveedor
        </button>
      </div>

      <p className="text-xs text-gray-400 mb-2 px-1">{lista.length} proveedores</p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {lista.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-16">
            {busqueda ? 'Sin resultados' : 'No hay proveedores todavía'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nombre</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">RUT</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Teléfono</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Email</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {lista.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-800">{p.nombre}</p>
                      {p.notas && <p className="text-xs text-gray-400 truncate max-w-48">{p.notas}</p>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{p.rut || '—'}</td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{p.telefono || '—'}</td>
                    <td className="px-4 py-3">
                      {p.email
                        ? <a href={`mailto:${p.email}`} className="text-xs text-blue-600 hover:underline">{p.email}</a>
                        : <span className="text-xs text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => abrirEditar(p)} className="text-xs text-blue-600 hover:underline font-medium">Editar</button>
                        {esAdmin && <button onClick={() => eliminar(p)} className="text-xs text-red-500 hover:underline font-medium">Eliminar</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <ContactoModal
          titulo="proveedor"
          campos={CAMPOS_PROVEEDOR}
          datos={editando as Record<string, string> | null}
          onClose={() => setModalOpen(false)}
          onGuardar={async (datos) => {
            const lista2 = proveedores ?? []
            if (datos.id) {
              await guardar.mutateAsync(lista2.map(x => x.id === datos.id ? { ...x, ...datos } : x) as Proveedor[])
            } else {
              await guardar.mutateAsync([...lista2, { id: uid(), fecha_creacion: new Date().toISOString(), ...datos } as Proveedor])
            }
          }}
        />
      )}
    </div>
  )
}
