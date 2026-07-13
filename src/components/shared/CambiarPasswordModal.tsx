import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export function CambiarPasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth()
  const email = session?.user?.email ?? ''

  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [guardando, setGuardando] = useState(false)

  if (!open) return null

  function cerrar() {
    setActual(''); setNueva(''); setConfirmar(''); setError(''); setOk(false)
    onClose()
  }

  async function handleGuardar() {
    setError('')
    if (!actual) { setError('Ingresa tu contraseña actual'); return }
    if (nueva.length < 6) { setError('La nueva contraseña debe tener al menos 6 caracteres'); return }
    if (nueva !== confirmar) { setError('Las contraseñas no coinciden'); return }
    if (nueva === actual) { setError('La nueva contraseña debe ser distinta a la actual'); return }

    setGuardando(true)
    // 1. Verificar la contraseña actual re-autenticando (evita que alguien con la sesión
    //    abierta la cambie sin conocer la clave vigente).
    const { error: authErr } = await supabase.auth.signInWithPassword({ email, password: actual })
    if (authErr) {
      setGuardando(false)
      setError('La contraseña actual es incorrecta')
      return
    }
    // 2. Actualizar a la nueva.
    const { error: updErr } = await supabase.auth.updateUser({ password: nueva })
    setGuardando(false)
    if (updErr) { setError(updErr.message); return }
    setOk(true)
    setActual(''); setNueva(''); setConfirmar('')
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center bg-black/40 md:p-4">
      <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-2xl w-full md:max-w-md flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-base font-bold text-gray-900">Cambiar contraseña</h3>
            <p className="text-xs text-gray-400 mt-0.5">{email}</p>
          </div>
          <button onClick={cerrar} className="text-gray-400 hover:text-gray-600 p-1">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {ok ? (
          <div className="px-6 py-8 text-center flex flex-col items-center gap-3" style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}>
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="font-semibold text-gray-900">Contraseña actualizada</p>
            <p className="text-sm text-gray-500">Tu nueva contraseña ya está activa.</p>
            <button onClick={cerrar}
              className="mt-2 px-6 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition">
              Listo
            </button>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto px-6 py-4 space-y-4">
              <PwField label="Contraseña actual" value={actual} onChange={setActual} autoFocus />
              <PwField label="Nueva contraseña" value={nueva} onChange={setNueva} />
              <PwField label="Confirmar nueva contraseña" value={confirmar} onChange={setConfirmar} />
              {error && <p className="text-sm text-red-600 font-medium">{error}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-none md:rounded-b-2xl"
              style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
              <button onClick={cerrar}
                className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-100 transition">
                Cancelar
              </button>
              <button onClick={handleGuardar} disabled={guardando}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition">
                {guardando ? 'Guardando…' : 'Cambiar contraseña'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function PwField({ label, value, onChange, autoFocus }: {
  label: string; value: string; onChange: (v: string) => void; autoFocus?: boolean
}) {
  const [ver, setVer] = useState(false)
  return (
    <div>
      <label className="text-xs font-medium text-gray-600 mb-1 block">{label}</label>
      <div className="relative">
        <input
          type={ver ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus}
          autoComplete="off"
          className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-10 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400"
        />
        <button type="button" onClick={() => setVer(v => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1"
          title={ver ? 'Ocultar' : 'Mostrar'}>
          {ver ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
          )}
        </button>
      </div>
    </div>
  )
}
