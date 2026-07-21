import { useState } from 'react'
import { useSmtpConfig, useGuardarSmtpConfig } from '@/lib/queries'
import { Spinner } from '@/components/shared/Spinner'
import type { SmtpConfig } from '@/types'

export function SmtpTab() {
  const { data: cfg, isLoading } = useSmtpConfig()
  const guardar = useGuardarSmtpConfig()

  const [form, setForm] = useState<SmtpConfig>({})
  const [showPw, setShowPw] = useState(false)
  const [guardado, setGuardado] = useState(false)

  // Ajuste de estado durante el render en vez de useEffect.
  const [cfgSynced, setCfgSynced] = useState(false)
  if (!cfgSynced && cfg) {
    setCfgSynced(true)
    setForm(cfg)
  }

  function set(k: keyof SmtpConfig, v: string | number | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleGuardar() {
    await guardar.mutateAsync(form)
    setGuardado(true)
    setTimeout(() => setGuardado(false), 2500)
  }

  const isConnected = !!(form.host && form.user && form.password)

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">Servidor SMTP</h3>
          <span className={[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
            isConnected ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700',
          ].join(' ')}>
            <span className={['w-1.5 h-1.5 rounded-full', isConnected ? 'bg-green-500' : 'bg-yellow-500'].join(' ')} />
            {isConnected ? 'Conectado' : 'Sin configurar'}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="text-xs font-medium text-gray-600 block mb-1">Servidor (host)</label>
            <input type="text" value={form.host ?? ''} onChange={e => set('host', e.target.value)}
              placeholder="smtp.gmail.com"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm font-mono bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Puerto</label>
            <input type="number" value={form.port ?? ''} onChange={e => set('port', +e.target.value)}
              placeholder="587"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm font-mono bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2">
              <input type="checkbox" checked={form.secure ?? false} onChange={e => set('secure', e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-blue-600" />
              SSL/TLS (puerto 465)
            </label>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Usuario / Email</label>
            <input type="email" value={form.user ?? ''} onChange={e => set('user', e.target.value)}
              placeholder="tu@gmail.com" autoComplete="off" name="smtp-user-no-autofill"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm font-mono bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Contraseña / App password</label>
            <div className="relative">
              <input type={showPw ? 'text' : 'password'} value={form.password ?? ''} onChange={e => set('password', e.target.value)}
                placeholder="••••••••" autoComplete="new-password" name="smtp-password-no-autofill"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 pr-9 text-base md:text-sm font-mono bg-gray-50 focus:outline-none focus:border-blue-400" />
              <button type="button" onClick={() => setShowPw(p => !p)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                  {showPw
                    ? <><path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></>
                    : <><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>
                  }
                </svg>
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Nombre del remitente</label>
            <input type="text" value={form.from_name ?? ''} onChange={e => set('from_name', e.target.value)}
              placeholder="Mi Taller"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">Email remitente</label>
            <input type="email" value={form.from_email ?? ''} onChange={e => set('from_email', e.target.value)}
              placeholder="contacto@taller.cl"
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base md:text-sm bg-gray-50 focus:outline-none focus:border-blue-400" />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <button onClick={handleGuardar} disabled={guardar.isPending}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition">
            {guardar.isPending ? 'Guardando…' : 'Guardar SMTP'}
          </button>
          {guardado && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
        </div>
      </div>
    </div>
  )
}
