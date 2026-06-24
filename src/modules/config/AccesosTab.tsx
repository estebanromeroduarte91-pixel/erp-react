import { useState } from 'react'
import {
  useUserProfiles, useToggleUsuarioActivo, useUserCargoMap, useGuardarUserConfig,
  usePendingInvites, useCrearInvitacion, useCancelarInvitacion, useCargos, useBodegas,
} from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import type { UserConfig } from '@/types'

const ROLES_LABEL: Record<string, string> = {
  admin: 'Super-admin',
  encargado: 'Encargado',
  tecnico: 'Técnico',
  vendedor: 'Vendedor',
}

const APP_BASE_URL = 'https://estebanromeroduarte91-pixel.github.io/modulo-compras/index.html'

// ── Modal editar usuario ──────────────────────────────────────
function EditModal({ userId, nombre, currentRole, onClose }: {
  userId: string
  nombre: string
  currentRole: string
  onClose: () => void
}) {
  const { data: cargos = [] } = useCargos()
  const { data: bodegas = [] } = useBodegas()
  const { data: uMap = {} } = useUserCargoMap()
  const guardar = useGuardarUserConfig()

  const uCfg = uMap[userId] ?? {}
  const [cargoId, setCargoId] = useState(currentRole === 'admin' && !uCfg.cargoId ? '__admin' : (uCfg.cargoId ?? cargos[0]?.id ?? ''))
  const [branchId, setBranchId] = useState(uCfg.branchId ?? '')
  const [done, setDone] = useState(false)

  async function handleGuardar() {
    const cfg: UserConfig = { cargoId: cargoId === '__admin' ? undefined : cargoId, branchId: branchId || undefined }
    await guardar.mutateAsync({ userId, cfg })
    setDone(true)
    setTimeout(onClose, 800)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-96 shadow-xl">
        <h3 className="text-base font-bold text-gray-900 mb-1">Editar usuario</h3>
        <p className="text-sm text-gray-400 mb-5">{nombre}</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Cargo</label>
            <select value={cargoId} onChange={e => setCargoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              <option value="__admin">Super-admin (acceso total)</option>
              {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {cargoId !== '__admin' && (
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Sucursal</label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                <option value="">Sin sucursal</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="flex gap-2 justify-end mt-6">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Cancelar
          </button>
          <button onClick={handleGuardar} disabled={guardar.isPending || done}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
            {done ? '✓ Guardado' : guardar.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal invitar usuario ─────────────────────────────────────
function InviteModal({ onClose }: { onClose: () => void }) {
  const { data: cargos = [] } = useCargos()
  const { data: bodegas = [] } = useBodegas()
  const crear = useCrearInvitacion()

  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [cargoId, setCargoId] = useState('__superadmin')
  const [branchId, setBranchId] = useState('')
  const [link, setLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleCrear() {
    if (!nombre.trim() || !email.trim()) return
    const isSuperAdmin = cargoId === '__superadmin'
    const role = isSuperAdmin ? 'admin' : ({ tecnico: 'tecnico', vendedor: 'vendedor', encargado: 'encargado' }[cargoId] ?? 'tecnico')
    const token = await crear.mutateAsync({ nombre: nombre.trim(), email: email.trim().toLowerCase(), role, cargoId, branchId })
    setLink(`${APP_BASE_URL}?invite=${token}`)
  }

  function copiar() {
    if (!link) return
    navigator.clipboard.writeText(link).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-[440px] max-w-[96vw] shadow-xl">
        <h3 className="text-base font-bold text-gray-900 mb-1">Invitar usuario</h3>
        <p className="text-sm text-gray-400 mb-5">Se generará un link único para que el usuario cree su contraseña.</p>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Nombre completo</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan Pérez"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@empresa.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Cargo</label>
            <select value={cargoId} onChange={e => setCargoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              <option value="__superadmin">Super-admin (acceso total)</option>
              {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {cargoId !== '__superadmin' && (
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Sucursal</label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
                <option value="">Sin sucursal asignada</option>
                {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
              </select>
            </div>
          )}
        </div>

        {link && (
          <div className="mt-5 bg-blue-50 border border-blue-200 rounded-xl p-4">
            <p className="text-[11px] font-bold text-blue-800 uppercase tracking-wide mb-2">Link generado — compártelo con el usuario</p>
            <p className="text-xs text-blue-700 break-all leading-relaxed mb-3">{link}</p>
            <button onClick={copiar}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border-2 border-blue-500 text-blue-600 text-xs font-bold rounded-lg hover:bg-blue-100 transition">
              {copied ? '✓ Copiado' : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 012-2h8" />
                  </svg>
                  Copiar link
                </>
              )}
            </button>
          </div>
        )}

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            Cerrar
          </button>
          {!link && (
            <button onClick={handleCrear} disabled={crear.isPending || !nombre || !email}
              className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
              {crear.isPending ? 'Generando…' : 'Generar link'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tab principal ─────────────────────────────────────────────
export function AccesosTab() {
  const { session } = useAuth()
  const { data: perfiles = [], isLoading: loadU } = useUserProfiles()
  const { data: invites = [], isLoading: loadI } = usePendingInvites()
  const { data: cargos = [] } = useCargos()
  const { data: bodegas = [] } = useBodegas()
  const { data: uMap = {} } = useUserCargoMap()
  const toggleActivo = useToggleUsuarioActivo()
  const cancelarInvite = useCancelarInvitacion()

  const [editUser, setEditUser] = useState<{ userId: string; nombre: string; currentRole: string } | null>(null)
  const [showInvite, setShowInvite] = useState(false)

  if (loadU || loadI) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-700">Accesos al sistema</h3>
          <p className="text-xs text-gray-400 mt-0.5">Gestiona quién puede ingresar al ERP y con qué permisos</p>
        </div>
        <button onClick={() => setShowInvite(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 transition">
          + Invitar usuario
        </button>
      </div>

      {/* Usuarios activos */}
      <div className="space-y-2">
        {perfiles.length === 0
          ? <p className="text-sm text-gray-400 text-center py-6">No hay usuarios registrados aún.</p>
          : perfiles.map(p => {
              const isMe = p.id === session?.user.id
              const uCfg = uMap[p.id] ?? {}
              const cargo = cargos.find(c => c.id === uCfg.cargoId)
              const branch = bodegas.find(b => b.id === uCfg.branchId)
              const rolLabel = p.role === 'admin' ? 'Super-admin' : (cargo?.nombre ?? ROLES_LABEL[p.role] ?? p.role)
              const branchLabel = p.role === 'admin' && !branch ? 'Global' : (branch ? (branch.nombre ?? branch.name) : 'Sin sucursal')

              return (
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
                      <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                        <circle cx="12" cy="7" r="4" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{p.nombre}</p>
                      <p className="text-xs text-gray-400">{rolLabel} · {branchLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={[
                      'text-[11px] font-semibold px-2.5 py-0.5 rounded-full',
                      p.activo ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
                    ].join(' ')}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {!isMe ? (
                      <>
                        <button onClick={() => toggleActivo.mutate({ userId: p.id, activo: !p.activo })}
                          className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition">
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button onClick={() => setEditUser({ userId: p.id, nombre: p.nombre, currentRole: p.role })}
                          className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition">
                          Editar
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-gray-400 px-1">(tú)</span>
                    )}
                  </div>
                </div>
              )
            })}
      </div>

      {/* Invitaciones pendientes */}
      <div>
        <p className="text-xs font-semibold text-gray-500 mb-2">Invitaciones pendientes</p>
        {invites.length === 0
          ? <p className="text-sm text-gray-400">Sin invitaciones pendientes.</p>
          : invites.map(inv => {
              const url = `${APP_BASE_URL}?invite=${inv.token}`
              return (
                <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{inv.email}</p>
                    <p className="text-xs text-gray-400">{ROLES_LABEL[inv.role] ?? inv.role} · Pendiente de activación</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => navigator.clipboard.writeText(url)}
                      className="px-3 py-1 text-xs font-semibold border-2 border-blue-500 text-blue-600 rounded-lg hover:bg-blue-50 transition">
                      Copiar link
                    </button>
                    <button onClick={() => { if (confirm('¿Cancelar esta invitación?')) cancelarInvite.mutate(inv.id) }}
                      className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-red-500 hover:bg-red-50 transition">
                      Cancelar
                    </button>
                  </div>
                </div>
              )
            })}
      </div>

      {editUser && <EditModal {...editUser} onClose={() => setEditUser(null)} />}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
