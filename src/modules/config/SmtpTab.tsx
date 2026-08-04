import { useState, useMemo } from 'react'
import { useSmtpConfig, useGuardarSmtpConfig, useEmailLog } from '@/lib/queries'
import { useAuth } from '@/context/AuthContext'
import { sendEmail } from '@/lib/email'
import { diagnosticarRemitente } from '@/lib/correoDiagnostico'
import { Spinner } from '@/components/shared/Spinner'
import type { SmtpConfig } from '@/types'

export function SmtpTab() {
  const { data: cfg, isLoading } = useSmtpConfig()
  const guardar = useGuardarSmtpConfig()
  const { empresaId, session, empresaNombre } = useAuth()

  const [form, setForm] = useState<SmtpConfig>({})
  const [showPw, setShowPw] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [probando, setProbando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: boolean; msg: string } | null>(null)

  const { data: correos } = useEmailLog(20)
  // Se calcula sobre `form` y no sobre lo guardado: así el aviso aparece
  // mientras se escribe, antes de guardar una configuración que no va a andar.
  const problemas = useMemo(() => diagnosticarRemitente(form), [form])

  // Ajuste de estado durante el render en vez de useEffect.
  // La contraseña guardada nunca se carga al campo (evita mostrarla en
  // texto plano a cualquiera que abra esta pestaña): el campo arranca
  // vacío y solo se envía si el usuario escribe una nueva.
  const [cfgSynced, setCfgSynced] = useState(false)
  if (!cfgSynced && cfg) {
    setCfgSynced(true)
    setForm({ ...cfg, password: '' })
  }

  function set(k: keyof SmtpConfig, v: string | number | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleGuardar() {
    // guardar_smtp_config conserva la contraseña existente si mandamos vacío
    // (form.password queda '' salvo que el usuario haya escrito una nueva).
    await guardar.mutateAsync(form)
    setGuardado(true)
    setResultado(null)   // la config cambió: la prueba anterior ya no vale
    setTimeout(() => setGuardado(false), 2500)
  }

  // Única forma real de saber si el correo funciona: mandar uno. Antes esta
  // pantalla solo decía "Conectado" porque los campos estaban llenos, sin haber
  // hablado nunca con el servidor — así que un usuario/contraseña equivocados se
  // descubrían recién cuando a un cliente no le llegaba su orden.
  async function handleProbar() {
    const destino = session?.user?.email
    if (!empresaId || !destino) return
    setProbando(true)
    setResultado(null)
    try {
      const r = await sendEmail(
        empresaId,
        destino,
        `Prueba de correo — ${empresaNombre || 'Pixit'}`,
        `<p>Si estás leyendo esto, la configuración de correo de <strong>${empresaNombre || 'tu taller'}</strong> funciona.</p>
         <p style="color:#6b7280;font-size:13px">Correo de prueba enviado desde Configuración › SMTP.</p>`,
      )
      setResultado(r.ok
        ? { ok: true, msg: `Enviado a ${destino}. Revisa tu bandeja (y la carpeta de spam).` }
        : { ok: false, msg: r.error || 'No se pudo enviar. Revisa host, puerto, usuario y contraseña.' })
    } catch (e) {
      setResultado({ ok: false, msg: (e as Error).message })
    } finally {
      setProbando(false)
    }
  }

  const hasStoredPw = !!cfg?.hasPassword
  // "Configurado", no "Conectado": que los campos estén llenos no prueba que el
  // servidor acepte esas credenciales. Eso lo dice el botón de prueba.
  const estaConfigurado = !!(form.host && form.user && (hasStoredPw || form.password))

  if (isLoading) return <div className="flex justify-center py-16"><Spinner className="w-8 h-8" /></div>

  return (
    <div className="max-w-2xl space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-gray-700">Servidor SMTP</h3>
          <span className={[
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
            estaConfigurado ? 'bg-blue-100 text-blue-700' : 'bg-yellow-100 text-yellow-700',
          ].join(' ')}>
            <span className={['w-1.5 h-1.5 rounded-full', estaConfigurado ? 'bg-blue-500' : 'bg-yellow-500'].join(' ')} />
            {estaConfigurado ? 'Configurado' : 'Sin configurar'}
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
                placeholder={hasStoredPw ? '•••••••• (sin cambios)' : '••••••••'} autoComplete="new-password" name="smtp-password-no-autofill"
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

        {problemas.length > 0 && (
          <div className="mt-5 space-y-2">
            {problemas.map((p, i) => (
              <div key={i} className={[
                'px-4 py-3 rounded-xl text-sm border',
                p.severidad === 'error'
                  ? 'bg-red-50 text-red-700 border-red-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200',
              ].join(' ')}>
                <p className="font-semibold">
                  {p.severidad === 'error' ? '⚠ ' : ''}{p.titulo}
                </p>
                <p className="mt-0.5 leading-relaxed">{p.detalle}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <button onClick={handleGuardar} disabled={guardar.isPending}
            className="px-5 py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-60 transition">
            {guardar.isPending ? 'Guardando…' : 'Guardar SMTP'}
          </button>
          <button onClick={handleProbar} disabled={probando || !estaConfigurado}
            title={estaConfigurado ? 'Envía un correo real a tu casilla' : 'Completa y guarda la configuración primero'}
            className="px-5 py-2.5 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 disabled:opacity-50 transition">
            {probando ? 'Enviando…' : 'Enviar correo de prueba'}
          </button>
          {guardado && <span className="text-sm text-green-600 font-medium">✓ Guardado</span>}
        </div>

        {resultado && (
          <div className={[
            'mt-4 px-4 py-3 rounded-xl text-sm border',
            resultado.ok
              ? 'bg-green-50 text-green-700 border-green-200'
              : 'bg-red-50 text-red-700 border-red-200',
          ].join(' ')}>
            <p className="font-semibold">{resultado.ok ? '✓ Correo enviado' : 'No se pudo enviar'}</p>
            <p className="mt-0.5 break-words">{resultado.msg}</p>
          </div>
        )}

        <p className="mt-4 text-xs text-gray-400 leading-relaxed">
          Guardar solo almacena los datos: no comprueba que el servidor los acepte. Usa
          <strong> Enviar correo de prueba</strong> para confirmarlo de verdad — llega a tu
          propia casilla ({session?.user?.email ?? 'tu correo'}).
        </p>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-1">¿Los correos llegan a spam?</h3>
        <p className="text-xs text-gray-500 leading-relaxed">
          Con SMTP propio, que tus correos no caigan en spam depende de los registros
          <strong> SPF, DKIM y DMARC</strong> del dominio desde el que envías — eso se
          configura en el DNS de tu dominio, con tu proveedor de correo, no acá. Si no
          querés lidiar con eso, la pestaña <strong>Dominio</strong> hace ese trabajo por
          vos: verifica tu dominio en Resend y te entrega los registros DNS listos para
          copiar, DKIM incluido.
        </p>
      </div>

      {/* Historial: el dato existía desde siempre en email_log, pero no había
          dónde mirarlo. Un correo que no llegaba se descubría cuando el cliente
          reclamaba — y sin saber por qué había fallado. */}
      {!!correos?.length && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-gray-700">Últimos correos enviados</h3>
            {(() => {
              const fallidos = correos.filter(c => !c.ok).length
              return fallidos > 0
                ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                    {fallidos} {fallidos === 1 ? 'falló' : 'fallaron'}
                  </span>
                : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Todos entregados
                  </span>
            })()}
          </div>
          <div className="divide-y divide-gray-100">
            {correos.map(c => (
              <div key={c.id} className="px-5 py-3 flex items-start gap-3">
                <span className={[
                  'mt-1 w-2 h-2 rounded-full flex-shrink-0',
                  c.ok ? 'bg-green-500' : 'bg-red-500',
                ].join(' ')} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-gray-800 truncate">{c.asunto}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.destinatario} · {new Date(c.creado_en).toLocaleString('es-CL')}
                    {c.canal ? ` · ${c.canal}` : ''}
                  </p>
                  {/* El error viene tal cual lo devolvió el servidor: es lo que
                      permite distinguir una contraseña mala de un buzón lleno. */}
                  {!c.ok && c.error && (
                    <p className="text-xs text-red-600 mt-1 break-words">{c.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
