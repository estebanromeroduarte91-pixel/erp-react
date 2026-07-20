import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { dbGet, dbSet } from '@/lib/db'

const INVITE_TOKEN = new URLSearchParams(window.location.search).get('invite')

interface Invite {
  empresa_id: string
  email: string
  nombre: string
  role: string
  token: string
}

export function Login() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [cargando, setCargando] = useState(false)

  const [modo, setModo] = useState<'login' | 'recover' | 'registro' | 'invitado'>(INVITE_TOKEN ? 'invitado' : 'login')
  const [recoverSent, setRecoverSent] = useState(false)
  const [confirmarEmail, setConfirmarEmail] = useState(false)

  // Registro (dueño nuevo)
  const [empresaNombre, setEmpresaNombre] = useState('')

  // Invitado (staff que acepta una invitación)
  const [nombreInvitado, setNombreInvitado] = useState('')
  const [invite, setInvite] = useState<Invite | null>(null)
  const [inviteError, setInviteError] = useState('')
  const [cargandoInvite, setCargandoInvite] = useState(!!INVITE_TOKEN)

  useEffect(() => {
    if (!INVITE_TOKEN) return
    supabase
      .from('pending_invites')
      .select('empresa_id,email,nombre,role,token')
      .eq('token', INVITE_TOKEN)
      .eq('used', false)
      .maybeSingle()
      .then(({ data, error: err }) => {
        setCargandoInvite(false)
        if (err || !data) { setInviteError('Invitación inválida o ya utilizada.'); return }
        setInvite(data as Invite)
        setEmail(data.email)
      })
  }, [])

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) {
      setError('Completa todos los campos')
      return
    }
    setError('')
    setCargando(true)
    const err = await login(email, password)
    setCargando(false)
    if (err) setError(err)
    else navigate('/dashboard', { replace: true })
  }

  async function onRegistro(e: React.FormEvent) {
    e.preventDefault()
    if (!empresaNombre.trim() || !email || !password) { setError('Completa todos los campos'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setError('')
    setCargando(true)
    const { data, error: err } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password })
    if (err) { setCargando(false); setError(_tradError(err.message)); return }
    if (!data.session) { setCargando(false); setConfirmarEmail(true); return }
    const trialTermina = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const { error: empErr } = await supabase.from('empresas').insert({
      nombre: empresaNombre.trim(), owner_id: data.user!.id, plan_estado: 'trial', trial_termina: trialTermina,
    })
    if (empErr) { setCargando(false); setError('Error: ' + empErr.message); return }
    // Fuerza que el AuthProvider vuelva a arrancar y encuentre la empresa recién creada
    // (evita una carrera con el listener de auth, que puede disparar antes de este insert).
    window.location.reload()
  }

  async function onInvitado(e: React.FormEvent) {
    e.preventDefault()
    if (!invite) return
    if (!nombreInvitado.trim() || !password) { setError('Completa todos los campos'); return }
    if (password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setError('')
    setCargando(true)
    const { data, error: err } = await supabase.auth.signUp({ email: invite.email, password })
    if (err) { setCargando(false); setError(_tradError(err.message)); return }
    if (!data.session) { setCargando(false); setConfirmarEmail(true); return }

    const { error: perfilErr } = await supabase.from('user_profiles').insert({
      id: data.user!.id, empresa_id: invite.empresa_id, role: invite.role, nombre: nombreInvitado.trim(), activo: true,
    })
    if (perfilErr) { setCargando(false); setError('Error: ' + perfilErr.message); return }
    await supabase.from('pending_invites').update({ used: true }).eq('token', invite.token)

    // Aplica el cargo/sucursal que quedaron guardados al crear la invitación
    const pendingCargoStr = await dbGet<string>(invite.empresa_id, `pending_cargo_${invite.token}`)
    if (pendingCargoStr) {
      try {
        const cfg = JSON.parse(pendingCargoStr)
        await dbSet(invite.empresa_id, `ucfg_${data.user!.id}`, cfg)
      } catch { /* config pendiente corrupta, se ignora */ }
    }
    window.location.reload()
  }

  async function onRecover(e: React.FormEvent) {
    e.preventDefault()
    if (!email) { setError('Ingresa tu email'); return }
    setError('')
    setCargando(true)
    const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: window.location.origin,
    })
    setCargando(false)
    if (err) { setError(err.message); return }
    setRecoverSent(true)
  }

  function volverALogin() {
    setModo('login'); setRecoverSent(false); setConfirmarEmail(false); setError(''); setPassword('')
  }

  return (
    <div
      className="flex items-center justify-center p-4"
      style={{
        minHeight: '100dvh',
        paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
        backgroundColor: '#fff',
        backgroundImage:
          'radial-gradient(480px 420px at 50% 50%, rgba(255,255,255,.92) 0%, rgba(255,255,255,.6) 42%, rgba(255,255,255,0) 68%), url(/login-pattern.webp)',
        backgroundRepeat: 'no-repeat, repeat',
        backgroundSize: 'auto, 560px 315px',
        backgroundPosition: 'center, center',
      }}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-8"
        style={{
          border: '1px solid rgba(20,20,20,0.09)',
          boxShadow: '0 1px 2px rgba(20,20,20,.04), 0 2px 6px rgba(20,20,20,.05), 0 24px 48px -16px rgba(20,20,20,.16)',
        }}
      >
        <div className="mb-6 text-center">
          <img src="/logo-pixit.png" alt="Pixit" className="mx-auto h-16 w-auto object-contain" />
          {(modo === 'invitado' || modo === 'registro') && (
            <p className="mt-2 text-sm text-gray-400">
              {modo === 'invitado' ? 'Completa tu registro' : 'Crea tu cuenta'}
            </p>
          )}
        </div>

        {confirmarEmail ? (
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
            </div>
            <p className="font-semibold text-gray-900">Revisa tu correo</p>
            <p className="text-sm text-gray-500">Te enviamos un enlace a <span className="font-medium text-gray-700">{email}</span> para confirmar tu cuenta.</p>
            <button onClick={volverALogin} className="text-sm font-semibold text-[#3656e6] hover:underline">Volver al inicio de sesión</button>
          </div>
        ) : modo === 'recover' ? (
          recoverSent ? (
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
              </div>
              <p className="font-semibold text-gray-900">Revisa tu correo</p>
              <p className="text-sm text-gray-500">Te enviamos un enlace a <span className="font-medium text-gray-700">{email}</span> para crear una nueva contraseña. Ábrelo en este mismo dispositivo.</p>
              <button onClick={volverALogin} className="text-sm font-semibold text-[#3656e6] hover:underline">Volver al inicio de sesión</button>
            </div>
          ) : (
            <form onSubmit={onRecover} className="space-y-4">
              <p className="text-sm text-gray-500">Ingresa tu email y te enviaremos un enlace para restablecer tu contraseña.</p>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                  placeholder="tucorreo@ejemplo.com"
                />
              </div>

              {error && <p className="text-sm font-medium text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={cargando}
                className="w-full rounded-lg bg-[#3656e6] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
              >
                {cargando ? 'Enviando…' : 'Enviar enlace'}
              </button>
              <button type="button" onClick={volverALogin} className="w-full text-sm font-medium text-gray-500 hover:text-gray-700">
                Volver al inicio de sesión
              </button>
            </form>
          )
        ) : modo === 'invitado' ? (
          cargandoInvite ? (
            <p className="text-center text-sm text-gray-400">Verificando invitación…</p>
          ) : inviteError ? (
            <div className="text-center space-y-3">
              <p className="text-sm font-medium text-red-600">{inviteError}</p>
              <button onClick={() => { setModo('login'); setInviteError('') }} className="text-sm font-semibold text-[#3656e6] hover:underline">Ir a iniciar sesión</button>
            </div>
          ) : (
            <form onSubmit={onInvitado} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Nombre completo</label>
                <input
                  type="text"
                  value={nombreInvitado}
                  onChange={(e) => setNombreInvitado(e.target.value)}
                  autoFocus
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                  placeholder="Tu nombre"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Email</label>
                <input type="email" value={invite?.email ?? ''} disabled
                  className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 text-base md:text-sm text-gray-500" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-600">Contraseña</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                  placeholder="Mínimo 6 caracteres"
                />
              </div>

              {error && <p className="text-sm font-medium text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={cargando}
                className="w-full rounded-lg bg-[#3656e6] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
              >
                {cargando ? 'Creando cuenta…' : 'Unirme'}
              </button>
            </form>
          )
        ) : modo === 'registro' ? (
          <form onSubmit={onRegistro} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Nombre de la empresa</label>
              <input
                type="text"
                value={empresaNombre}
                onChange={(e) => setEmpresaNombre(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                placeholder="Mi taller"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                placeholder="tucorreo@ejemplo.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                placeholder="Mínimo 6 caracteres"
              />
            </div>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-lg bg-[#3656e6] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {cargando ? 'Creando cuenta…' : 'Crear cuenta'}
            </button>
            <button
              type="button"
              onClick={() => { setModo('login'); setError('') }}
              className="w-full text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </form>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                placeholder="tucorreo@ejemplo.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-600">Contraseña</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2.5 text-base md:text-sm outline-none focus:border-[#3656e6]"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="text-sm font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={cargando}
              className="w-full rounded-lg bg-[#3656e6] py-2.5 text-sm font-semibold text-white transition hover:brightness-105 disabled:opacity-60"
            >
              {cargando ? 'Ingresando…' : 'Ingresar'}
            </button>

            <button
              type="button"
              onClick={() => { setModo('recover'); setError('') }}
              className="w-full text-sm font-medium text-[#3656e6] hover:underline"
            >
              ¿Olvidaste tu contraseña?
            </button>
            <button
              type="button"
              onClick={() => { setModo('registro'); setError('') }}
              className="w-full text-sm font-medium text-gray-500 hover:text-gray-700"
            >
              ¿No tienes cuenta? Regístrate
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function _tradError(msg: string): string {
  if (msg.includes('already registered') || msg.includes('already exists')) return 'Ese email ya tiene una cuenta.'
  if (msg.includes('Invalid login')) return 'Email o contraseña incorrectos'
  return msg
}
