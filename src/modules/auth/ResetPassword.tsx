import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

export function ResetPassword() {
  const { clearRecovery } = useAuth()
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [ver, setVer] = useState(false)
  const [error, setError] = useState('')
  const [ok, setOk] = useState(false)
  const [guardando, setGuardando] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (nueva.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    if (nueva !== confirmar) { setError('Las contraseñas no coinciden'); return }
    setGuardando(true)
    const { error: updErr } = await supabase.auth.updateUser({ password: nueva })
    setGuardando(false)
    if (updErr) { setError(updErr.message); return }
    setOk(true)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-[#1a2f6e] to-[#3656e6] p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        {ok ? (
          <div className="text-center flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-xl font-extrabold text-gray-900">Contraseña actualizada</h1>
            <p className="text-sm text-gray-500">Ya puedes usar tu nueva contraseña.</p>
            <button
              onClick={clearRecovery}
              className="mt-2 w-full rounded-lg bg-[#3656e6] py-2.5 text-sm font-semibold text-white transition hover:brightness-105"
            >
              Ir al ERP
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6 text-center">
              <div className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center">
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h1 className="text-2xl font-extrabold text-gray-900">Nueva contraseña</h1>
              <p className="mt-1 text-sm text-gray-400">Crea una contraseña nueva para tu cuenta</p>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Nueva contraseña</label>
                <input
                  type={ver ? 'text' : 'password'}
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Confirmar contraseña</label>
                <input
                  type={ver ? 'text' : 'password'}
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                  placeholder="Repite la contraseña"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-gray-500 select-none cursor-pointer">
                <input type="checkbox" checked={ver} onChange={(e) => setVer(e.target.checked)} />
                Mostrar contraseña
              </label>

              {error && <p className="text-sm font-medium text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={guardando}
                className="w-full rounded-lg bg-[#3656e6] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
              >
                {guardando ? 'Guardando…' : 'Guardar contraseña'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  )
}
