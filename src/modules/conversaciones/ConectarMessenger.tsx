import { useEffect, useState } from 'react'
import { useAuth } from '@/context/AuthContext'
import { useCanalesMeta, useDesconectarCanalMeta, useMetaConectar } from '@/lib/queries/useConversaciones'

// SDK de Facebook: solo se usa para el login que entrega el token de usuario.
// El intercambio por el token de la página y su guardado ocurren en el
// servidor (meta-conectar), donde está el secreto de la app.
type FBLoginRespuesta = { authResponse?: { accessToken: string } | null; status?: string }
type FBSdk = {
  init: (o: { appId: string; version: string; xfbml?: boolean; cookie?: boolean }) => void
  login: (cb: (r: FBLoginRespuesta) => void, o: Record<string, unknown>) => void
}
declare global {
  interface Window { FB?: FBSdk; fbAsyncInit?: () => void }
}

const PERMISOS = 'pages_show_list,pages_messaging,pages_manage_metadata,business_management'

let sdkPromesa: Promise<FBSdk> | null = null
function cargarSdk(appId: string): Promise<FBSdk> {
  if (sdkPromesa) return sdkPromesa
  sdkPromesa = new Promise((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB!.init({ appId, version: 'v23.0', xfbml: false, cookie: false })
      resolve(window.FB!)
    }
    const s = document.createElement('script')
    s.src = 'https://connect.facebook.net/es_LA/sdk.js'
    s.async = true
    s.crossOrigin = 'anonymous'
    s.onerror = () => { sdkPromesa = null; reject(new Error('No se pudo cargar el inicio de sesión de Facebook. Revisa si un bloqueador de anuncios lo está impidiendo.')) }
    document.body.appendChild(s)
  })
  return sdkPromesa
}

type Paso = { tipo: 'inicio' } | { tipo: 'elegir'; token: string; paginas: { id: string; nombre: string }[] }

export function ConectarMessenger() {
  const { rol } = useAuth()
  const { data: canales = [] } = useCanalesMeta()
  const meta = useMetaConectar()
  const desconectar = useDesconectarCanalMeta()
  const [sdk, setSdk] = useState<{ fb: FBSdk; configId: string | null } | null>(null)
  const [paso, setPaso] = useState<Paso>({ tipo: 'inicio' })
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState('')

  const conectado = canales.find(c => c.canal === 'messenger')
  const esAdmin = rol === 'admin'

  // El SDK se carga al abrir la ventana y no al hacer clic: FB.login abre un
  // popup, y el navegador lo bloquea si no ocurre directo en el clic.
  useEffect(() => {
    if (conectado || !esAdmin) return
    let vigente = true
    meta.config()
      .then(async c => {
        const fb = await cargarSdk(c.app_id)
        if (vigente) setSdk({ fb, configId: c.config_id })
      })
      .catch(e => vigente && setMensaje((e as Error).message))
    return () => { vigente = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conectado?.id, esAdmin])

  function iniciarSesion() {
    if (!sdk) return
    setMensaje('')
    const opciones = sdk.configId
      ? { config_id: sdk.configId, response_type: 'token' }
      : { scope: PERMISOS, return_scopes: true }
    sdk.fb.login(r => {
      const token = r.authResponse?.accessToken
      if (!token) { setMensaje('No se completó el inicio de sesión de Facebook.'); return }
      setOcupado(true)
      meta.paginas(token)
        .then(({ paginas }) => {
          if (!paginas.length) setMensaje('Tu cuenta de Facebook no administra ninguna página con permiso para mensajes. Al iniciar sesión, asegúrate de marcar la página de tu negocio.')
          else setPaso({ tipo: 'elegir', token, paginas })
        })
        .catch(e => setMensaje((e as Error).message))
        .finally(() => setOcupado(false))
    }, opciones)
  }

  async function elegir(token: string, paginaId: string) {
    setOcupado(true)
    setMensaje('')
    try {
      const r = await meta.conectar(token, paginaId)
      setPaso({ tipo: 'inicio' })
      setMensaje(`Listo: ${r.pagina.nombre} quedó conectada. Los mensajes nuevos llegarán a Conversaciones.`)
    } catch (e) {
      setMensaje((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  return <div className="mt-3 rounded-xl border border-gray-200 p-4">
    <div className="flex items-center gap-3">
      <img src="https://upload.wikimedia.org/wikipedia/commons/b/be/Facebook_Messenger_logo_2020.svg" alt="" width={32} height={32} className="h-8 w-8" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">Messenger</p>
        <p className="truncate text-xs text-gray-500">{conectado ? conectado.cuenta_nombre : 'Mensajes de tu página de Facebook'}</p>
      </div>
      {conectado && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Conectado</span>}
    </div>

    {conectado && <div className="mt-3 space-y-2 text-xs text-gray-500">
      <p>Último mensaje recibido: {conectado.ultimo_evento ? new Date(conectado.ultimo_evento).toLocaleString('es-CL') : 'todavía ninguno'}</p>
      {conectado.ultimo_error && <p className="text-red-600">{conectado.ultimo_error}</p>}
      {esAdmin && <button type="button" onClick={() => desconectar.mutate(conectado.id)}
        className="rounded-lg px-3 py-1.5 font-semibold text-gray-500 hover:bg-gray-50">Desconectar</button>}
    </div>}

    {!conectado && !esAdmin && <p className="mt-3 text-xs font-semibold text-gray-500">Solo un administrador puede conectarlo.</p>}

    {!conectado && esAdmin && paso.tipo === 'inicio' && <>
      <p className="mt-3 text-xs leading-5 text-gray-500">
        Inicia sesión con la cuenta de Facebook que administra la página de tu negocio. Los mensajes llegan al instante y puedes responder desde aquí durante 24 horas después de cada mensaje del cliente.
      </p>
      <button type="button" onClick={iniciarSesion} disabled={!sdk || ocupado}
        className="mt-3 w-full rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166fe0] disabled:opacity-50">
        {ocupado ? 'Conectando…' : sdk ? 'Conectar con Facebook' : 'Cargando…'}
      </button>
    </>}

    {!conectado && paso.tipo === 'elegir' && <div className="mt-3">
      <p className="text-xs font-semibold text-gray-600">¿Qué página quieres conectar?</p>
      <div className="mt-2 space-y-1.5">
        {paso.paginas.map(p => <button key={p.id} type="button" disabled={ocupado} onClick={() => elegir(paso.token, p.id)}
          className="flex w-full items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50">
          <span className="font-medium text-gray-800">{p.nombre}</span>
          <span className="text-xs font-semibold text-blue-600">Conectar</span>
        </button>)}
      </div>
    </div>}

    {mensaje && <p className="mt-2 text-xs font-medium text-gray-700">{mensaje}</p>}
  </div>
}
