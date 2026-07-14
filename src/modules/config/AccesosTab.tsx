import { useState } from 'react'
import {
  useUserProfiles, useToggleUsuarioActivo, useUserCargoMap, useGuardarUserConfig,
  usePendingInvites, useCrearInvitacion, useCancelarInvitacion, useCargos, useBodegas,
  useActualizarNombreUsuario, useFichaUsuario, useGuardarFichaUsuario,
} from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { Spinner } from '@/components/shared/Spinner'
import { diasHabilesEnRango, diasAcumulados } from '@/lib/vacaciones'
import type { UserConfig, FichaUsuario, RegistroVacaciones, RegistroInasistencia } from '@/types'

const ROLES_LABEL: Record<string, string> = {
  admin: 'Super-admin', encargado: 'Encargado', tecnico: 'Técnico', vendedor: 'Vendedor',
}
const APP_BASE_URL = 'https://estebanromeroduarte91-pixel.github.io/modulo-compras/index.html'

function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36) }

function initiales(nombre: string): string {
  const p = nombre.trim().split(' ').filter(Boolean)
  return p.length >= 2 ? (p[0][0] + p[p.length - 1][0]).toUpperCase() : nombre.slice(0, 2).toUpperCase()
}

function fmtFecha(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}

type FichaTab = 'perfil' | 'vacaciones' | 'inasistencias'

// ── Tab Perfil ────────────────────────────────────────────────
function PerfilTab({ userId, nombre, currentRole, onClose }: {
  userId: string; nombre: string; currentRole: string; onClose: () => void
}) {
  const { data: cargos = [] } = useCargos()
  const { data: bodegas = [] } = useBodegas()
  const { data: uMap = {} } = useUserCargoMap()
  const guardar = useGuardarUserConfig()
  const actualizarNombre = useActualizarNombreUsuario()

  const uCfg = uMap[userId] ?? {}
  const [nombreEdit, setNombreEdit] = useState(nombre)
  const [cargoId, setCargoId] = useState(
    currentRole === 'admin' && !uCfg.cargoId ? '__admin' : (uCfg.cargoId ?? cargos[0]?.id ?? '')
  )
  const [branchId, setBranchId] = useState(uCfg.branchId ?? '')
  const [done, setDone] = useState(false)

  const isPending = guardar.isPending || actualizarNombre.isPending

  async function handleGuardar() {
    const cfg: UserConfig = { cargoId: cargoId === '__admin' ? undefined : cargoId, branchId: branchId || undefined }
    await Promise.all([
      guardar.mutateAsync({ userId, cfg }),
      nombreEdit.trim() !== nombre ? actualizarNombre.mutateAsync({ userId, nombre: nombreEdit.trim() }) : Promise.resolve(),
    ])
    setDone(true)
    setTimeout(onClose, 800)
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">Nombre</label>
        <input value={nombreEdit} onChange={e => setNombreEdit(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
      </div>
      <div>
        <label className="text-xs font-semibold text-gray-600 block mb-1">Cargo</label>
        <select value={cargoId} onChange={e => setCargoId(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
          <option value="__admin">Super-admin (acceso total)</option>
          {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
        </select>
      </div>
      {cargoId !== '__admin' && (
        <div>
          <label className="text-xs font-semibold text-gray-600 block mb-1">Sucursal</label>
          <select value={branchId} onChange={e => setBranchId(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
            <option value="">Sin sucursal</option>
            {bodegas.map(b => <option key={b.id} value={b.id}>{b.nombre ?? b.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex justify-end pt-2">
        <button onClick={handleGuardar} disabled={isPending || done || !nombreEdit.trim()}
          className="px-5 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
          {done ? '✓ Guardado' : isPending ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </div>
  )
}

// ── Tab Vacaciones ────────────────────────────────────────────
function VacacionesTab({ ficha, onUpdate }: {
  ficha: FichaUsuario; onUpdate: (f: FichaUsuario) => void
}) {
  const vacaciones = ficha.vacaciones ?? []
  const diasAnuales = ficha.dias_anuales ?? 15

  const [fechaIngreso, setFechaIngreso] = useState(ficha.fecha_ingreso ?? '')
  const [diasAnualesEdit, setDiasAnualesEdit] = useState(String(diasAnuales))
  const [cfgGuardado, setCfgGuardado] = useState(false)

  const [fInicio, setFInicio] = useState('')
  const [fFin, setFFin] = useState('')
  const [estado, setEstado] = useState<'aprobado' | 'pendiente'>('aprobado')
  const [nota, setNota] = useState('')

  const diasPreview = fInicio && fFin ? diasHabilesEnRango(fInicio, fFin) : null
  const acumulados = fechaIngreso ? diasAcumulados(fechaIngreso, Number(diasAnualesEdit) || 15) : null
  const tomados = vacaciones.reduce((s, v) => s + v.dias_habiles, 0)
  const saldo = acumulados != null ? Math.round((acumulados - tomados) * 10) / 10 : null

  function guardarConfig() {
    onUpdate({ ...ficha, fecha_ingreso: fechaIngreso || undefined, dias_anuales: Number(diasAnualesEdit) || 15 })
    setCfgGuardado(true)
    setTimeout(() => setCfgGuardado(false), 2000)
  }

  function agregarVacacion() {
    if (!fInicio || !fFin || diasPreview === null || diasPreview <= 0) return
    const nueva: RegistroVacaciones = { id: uid(), fecha_inicio: fInicio, fecha_fin: fFin, dias_habiles: diasPreview, estado, nota: nota.trim() || undefined }
    onUpdate({ ...ficha, vacaciones: [...vacaciones, nueva].sort((a, b) => a.fecha_inicio.localeCompare(b.fecha_inicio)) })
    setFInicio(''); setFFin(''); setNota('')
  }

  function eliminar(id: string) {
    onUpdate({ ...ficha, vacaciones: vacaciones.filter(v => v.id !== id) })
  }

  return (
    <div className="space-y-5">
      {/* Config */}
      <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Contrato</p>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="text-xs font-medium text-gray-600 block mb-1">Fecha de ingreso</label>
            <input type="date" value={fechaIngreso} onChange={e => setFechaIngreso(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-white focus:outline-none focus:border-blue-400" />
          </div>
          <div className="w-36">
            <label className="text-xs font-medium text-gray-600 block mb-1">Días anuales</label>
            <select value={diasAnualesEdit} onChange={e => setDiasAnualesEdit(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-white focus:outline-none focus:border-blue-400">
              <option value="15">15 días (legal)</option>
              <option value="20">20 días (+10 años)</option>
              <option value="25">25 días</option>
              <option value="30">30 días</option>
            </select>
          </div>
          <button onClick={guardarConfig}
            className="px-4 py-2 text-sm font-semibold border border-gray-200 rounded-lg bg-white hover:bg-gray-100 transition whitespace-nowrap">
            {cfgGuardado ? '✓ Guardado' : 'Guardar'}
          </button>
        </div>
      </div>

      {/* Métricas */}
      {acumulados !== null && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Acumulados', value: acumulados, sub: `de ${diasAnualesEdit} días/año`, color: 'text-blue-700' },
            { label: 'Tomados', value: tomados, sub: 'días hábiles', color: 'text-gray-800' },
            { label: 'Saldo', value: saldo ?? 0, sub: 'días disponibles', color: (saldo ?? 0) >= 0 ? 'text-green-700' : 'text-red-600' },
          ].map(m => (
            <div key={m.label} className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-center">
              <p className="text-[11px] text-gray-500 mb-1">{m.label}</p>
              <p className={`text-2xl font-medium ${m.color}`}>{m.value}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">{m.sub}</p>
            </div>
          ))}
        </div>
      )}

      {/* Agregar */}
      <div className="border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Agregar período</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Desde</label>
            <input type="date" value={fInicio} onChange={e => setFInicio(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">Hasta</label>
            <input type="date" value={fFin} min={fInicio} onChange={e => setFFin(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          {diasPreview !== null && (
            <div className="px-3 py-2 bg-blue-50 text-blue-700 text-sm font-semibold rounded-lg border border-blue-200">
              {diasPreview} día{diasPreview !== 1 ? 's' : ''} hábil{diasPreview !== 1 ? 'es' : ''}
            </div>
          )}
          <div className="flex-1 min-w-[120px]">
            <label className="text-xs text-gray-500 block mb-1">Estado</label>
            <select value={estado} onChange={e => setEstado(e.target.value as 'aprobado' | 'pendiente')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              <option value="aprobado">Aprobado</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-gray-500 block mb-1">Nota</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Opcional…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <button onClick={agregarVacacion} disabled={!fInicio || !fFin || !diasPreview || diasPreview <= 0}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            Agregar
          </button>
        </div>
        {diasPreview === 0 && fInicio && fFin && (
          <p className="text-xs text-amber-600 mt-2">El rango no incluye días hábiles (puede ser fin de semana o feriados).</p>
        )}
      </div>

      {/* Lista */}
      {vacaciones.length === 0
        ? <p className="text-sm text-gray-400 text-center py-4">Sin registros de vacaciones.</p>
        : (
          <div className="space-y-2">
            {[...vacaciones].reverse().map(v => (
              <div key={v.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-gray-800">{fmtFecha(v.fecha_inicio)} – {fmtFecha(v.fecha_fin)}</span>
                  {v.nota && <span className="text-gray-400 ml-2">· {v.nota}</span>}
                </div>
                <span className="text-gray-500 text-xs flex-shrink-0">{v.dias_habiles} días hábiles</span>
                <span className={[
                  'text-[11px] px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0',
                  v.estado === 'aprobado' ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700',
                ].join(' ')}>
                  {v.estado === 'aprobado' ? 'Aprobado' : 'Pendiente'}
                </span>
                <button onClick={() => eliminar(v.id)} className="text-gray-300 hover:text-red-500 transition flex-shrink-0" aria-label="Eliminar">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ── Tab Inasistencias ─────────────────────────────────────────
function InasistenciasTab({ ficha, onUpdate }: { ficha: FichaUsuario; onUpdate: (f: FichaUsuario) => void }) {
  const inasistencias = ficha.inasistencias ?? []
  const [fecha, setFecha] = useState('')
  const [tipo, setTipo] = useState<'sin_aviso' | 'justificada'>('sin_aviso')
  const [nota, setNota] = useState('')

  function agregar() {
    if (!fecha) return
    const nueva: RegistroInasistencia = { id: uid(), fecha, tipo, nota: nota.trim() || undefined }
    onUpdate({ ...ficha, inasistencias: [...inasistencias, nueva].sort((a, b) => a.fecha.localeCompare(b.fecha)) })
    setFecha(''); setNota('')
  }

  function eliminar(id: string) {
    onUpdate({ ...ficha, inasistencias: inasistencias.filter(i => i.id !== id) })
  }

  const sinAviso = inasistencias.filter(i => i.tipo === 'sin_aviso').length
  const justificadas = inasistencias.filter(i => i.tipo === 'justificada').length

  return (
    <div className="space-y-5">
      {/* Métricas */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Total', value: inasistencias.length, color: 'text-gray-800' },
          { label: 'Sin aviso', value: sinAviso, color: sinAviso > 0 ? 'text-red-600' : 'text-gray-800' },
          { label: 'Justificadas', value: justificadas, color: 'text-blue-700' },
        ].map(m => (
          <div key={m.label} className="bg-gray-50 rounded-xl p-3 border border-gray-200 text-center">
            <p className="text-[11px] text-gray-500 mb-1">{m.label}</p>
            <p className={`text-2xl font-medium ${m.color}`}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Agregar */}
      <div className="border border-gray-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Registrar inasistencia</p>
        <div className="flex gap-2 items-end flex-wrap">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Fecha</label>
            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex-1 min-w-[140px]">
            <label className="text-xs text-gray-500 block mb-1">Tipo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value as 'sin_aviso' | 'justificada')}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              <option value="sin_aviso">Sin aviso</option>
              <option value="justificada">Justificada</option>
            </select>
          </div>
          <div className="flex-1 min-w-[160px]">
            <label className="text-xs text-gray-500 block mb-1">Nota</label>
            <input value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej: certificado médico…"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <button onClick={agregar} disabled={!fecha}
            className="px-4 py-2 text-sm font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition">
            Registrar
          </button>
        </div>
      </div>

      {/* Lista */}
      {inasistencias.length === 0
        ? <p className="text-sm text-gray-400 text-center py-4">Sin inasistencias registradas.</p>
        : (
          <div className="space-y-2">
            {[...inasistencias].reverse().map(i => (
              <div key={i.id} className="flex items-center gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm">
                <span className="font-medium text-gray-800 min-w-[110px]">{fmtFecha(i.fecha)}</span>
                {i.nota && <span className="text-gray-400 flex-1 min-w-0 truncate">· {i.nota}</span>}
                <span className="flex-1" />
                <span className={[
                  'text-[11px] px-2.5 py-0.5 rounded-full font-semibold flex-shrink-0',
                  i.tipo === 'sin_aviso' ? 'bg-red-50 text-red-700' : 'bg-blue-50 text-blue-700',
                ].join(' ')}>
                  {i.tipo === 'sin_aviso' ? 'Sin aviso' : 'Justificada'}
                </span>
                <button onClick={() => eliminar(i.id)} className="text-gray-300 hover:text-red-500 transition flex-shrink-0" aria-label="Eliminar">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
    </div>
  )
}

// ── Modal principal de ficha ──────────────────────────────────
function FichaModal({ userId, nombre, currentRole, initialTab = 'perfil', onClose }: {
  userId: string; nombre: string; currentRole: string; initialTab?: FichaTab; onClose: () => void
}) {
  const [tab, setTab] = useState<FichaTab>(initialTab)
  const { data: ficha = {}, isLoading } = useFichaUsuario(userId)
  const guardarFicha = useGuardarFichaUsuario()

  function handleUpdate(f: FichaUsuario) {
    guardarFicha.mutate({ userId, ficha: f })
  }

  const tabs: { key: FichaTab; label: string }[] = [
    { key: 'perfil', label: 'Perfil' },
    { key: 'vacaciones', label: 'Vacaciones' },
    { key: 'inasistencias', label: 'Inasistencias' },
  ]

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-sm font-semibold text-blue-600 flex-shrink-0">
              {initiales(nombre)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{nombre}</p>
              <p className="text-xs text-gray-400">{ROLES_LABEL[currentRole] ?? currentRole}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition text-xl leading-none">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-6">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={[
                'px-4 py-3 text-sm font-medium border-b-2 -mb-px transition',
                tab === t.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700',
              ].join(' ')}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading
            ? <div className="flex justify-center py-12"><Spinner className="w-7 h-7" /></div>
            : tab === 'perfil'
              ? <PerfilTab userId={userId} nombre={nombre} currentRole={currentRole} onClose={onClose} />
              : tab === 'vacaciones'
                ? <VacacionesTab ficha={ficha} onUpdate={handleUpdate} />
                : <InasistenciasTab ficha={ficha} onUpdate={handleUpdate} />
          }
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
    const ROLE_MAP: Record<string, string> = { tecnico: 'tecnico', vendedor: 'vendedor', encargado: 'encargado' }
    const role = isSuperAdmin ? 'admin' : (ROLE_MAP[cargoId] ?? cargos.find(c => c.id === cargoId)?.rol ?? 'tecnico')
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
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="juan@empresa.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Cargo</label>
            <select value={cargoId} onChange={e => setCargoId(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
              <option value="__superadmin">Super-admin (acceso total)</option>
              {cargos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
          </div>
          {cargoId !== '__superadmin' && (
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Sucursal</label>
              <select value={branchId} onChange={e => setBranchId(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400">
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

  const [editUser, setEditUser] = useState<{ userId: string; nombre: string; currentRole: string; initialTab: FichaTab } | null>(null)
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
                <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition cursor-pointer"
                  onClick={() => setEditUser({ userId: p.id, nombre: p.nombre, currentRole: p.role, initialTab: 'vacaciones' })}>
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-xs font-semibold text-blue-600 flex-shrink-0">
                      {initiales(p.nombre)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{p.nombre}</p>
                      <p className="text-xs text-gray-400">{rolLabel} · {branchLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <span className={[
                      'text-[11px] font-semibold px-2.5 py-0.5 rounded-full',
                      p.activo ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700',
                    ].join(' ')}>
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </span>
                    {!isMe ? (
                      <>
                        <button onClick={() => toggleActivo.mutate({ userId: p.id, activo: !p.activo })}
                          className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition">
                          {p.activo ? 'Desactivar' : 'Activar'}
                        </button>
                        <button onClick={() => setEditUser({ userId: p.id, nombre: p.nombre, currentRole: p.role, initialTab: 'perfil' })}
                          className="px-3 py-1 text-xs border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-100 transition">
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

      {editUser && <FichaModal {...editUser} onClose={() => setEditUser(null)} />}
      {showInvite && <InviteModal onClose={() => setShowInvite(false)} />}
    </div>
  )
}
