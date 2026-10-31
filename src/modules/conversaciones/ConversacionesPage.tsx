import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { useSmtpConfig } from '@/lib/queries'
import {
  useActivarCorreoEntrante, useActualizarConversacion, useConversaciones, useCorreoEntrante,
  useMensajesConversacion, useResponderConversacion, useSincronizarCorreo,
} from '@/lib/queries/useConversaciones'
import {
  filtrarConversaciones, horaCorta, nombreContacto, quitarCitado,
  type Canal, type Conversacion, type FiltroBandeja,
} from '@/lib/conversaciones'

const CANALES_META = [
  {
    id: 'whatsapp',
    nombre: 'WhatsApp',
    detalle: 'Mensajes de WhatsApp Business',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg',
  },
  {
    id: 'instagram',
    nombre: 'Instagram',
    detalle: 'Mensajes directos de Instagram',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/9/95/Instagram_logo_2022.svg',
  },
  {
    id: 'messenger',
    nombre: 'Messenger',
    detalle: 'Mensajes de Facebook',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/b/be/Facebook_Messenger_logo_2020.svg',
  },
] as const

const FILTROS: { id: FiltroBandeja; label: string }[] = [
  { id: 'todas', label: 'Todas' },
  { id: 'sin_responder', label: 'Sin responder' },
  { id: 'cerradas', label: 'Cerradas' },
]

export function ConversacionesPage() {
  const { data: correo } = useCorreoEntrante()
  const { data: conversaciones = [], isLoading } = useConversaciones()
  const [canal, setCanal] = useState<Canal | 'todos'>('todos')
  const [filtro, setFiltro] = useState<FiltroBandeja>('todas')
  const [busqueda, setBusqueda] = useState('')
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [conectar, setConectar] = useState(false)

  const correoActivo = !!correo?.activo
  const visibles = useMemo(
    () => filtrarConversaciones(conversaciones, { canal, filtro, busqueda }),
    [conversaciones, canal, filtro, busqueda],
  )
  const actual = conversaciones.find(c => c.id === seleccion) ?? null
  const noLeidas = conversaciones.filter(c => c.estado === 'abierta' && c.no_leidos > 0).length

  return <div className="flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col px-4 py-5 md:h-[calc(100vh-4rem)] md:p-0">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">Conversaciones</h1>
          {correoActivo
            ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Correo conectado</span>
            : <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">Sin canales conectados</span>}
        </div>
        <p className="mt-1 text-sm text-gray-500">Todos los mensajes de tus clientes en una sola bandeja.</p>
      </div>
      <button type="button" onClick={() => setConectar(true)}
        className="self-start rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/15 hover:bg-blue-700">
        + Conectar canal
      </button>
    </div>

    <section className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:grid-cols-[240px_minmax(300px,380px)_1fr]">
      <aside className="hidden border-r border-gray-100 p-4 md:block">
        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Canales</p>
        <button type="button" onClick={() => setCanal('todos')}
          className={`mt-3 flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${canal === 'todos' ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-50'}`}>
          <span className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white"><ChatIcon /></span>Todos</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-gray-500">{noLeidas}</span>
        </button>
        <div className="mt-6 space-y-2">
          <button type="button" onClick={() => correoActivo ? setCanal('email') : setConectar(true)}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${canal === 'email' ? 'bg-blue-50' : 'hover:bg-gray-50'} ${correoActivo ? '' : 'opacity-55'}`}>
            <MailLogo size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-gray-700">Correo</p>
              <p className={`truncate text-[10px] ${correo?.ultimo_error ? 'text-red-600' : 'text-gray-400'}`}>
                {!correoActivo ? 'No conectado' : correo?.ultimo_error ? 'Error al revisar' : 'Conectado'}
              </p>
            </div>
          </button>
          {CANALES_META.map(c => <div key={c.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 opacity-55">
            <ChannelLogo canal={c} size="sm" />
            <div className="min-w-0"><p className="text-sm font-semibold text-gray-700">{c.nombre}</p><p className="truncate text-[10px] text-gray-400">Próximamente</p></div>
          </div>)}
        </div>
      </aside>

      <div className={`min-h-0 flex-col border-r border-gray-100 ${actual ? 'hidden md:flex' : 'flex'}`}>
        <div className="border-b border-gray-100 p-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input value={busqueda} onChange={e => setBusqueda(e.target.value)} placeholder="Buscar conversaciones…"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-base text-gray-800 outline-none focus:border-blue-400 md:text-sm" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            {FILTROS.map(f => <button key={f.id} type="button" onClick={() => setFiltro(f.id)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${filtro === f.id ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
              {f.label}
            </button>)}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibles.length > 0
            ? visibles.map(c => <FilaConversacion key={c.id} c={c} activa={c.id === seleccion} onClick={() => setSeleccion(c.id)} />)
            : <BandejaVacia cargando={isLoading} conectado={correoActivo} hayConversaciones={conversaciones.length > 0} />}
        </div>
      </div>

      <div className={`min-h-0 flex-col bg-gray-50/40 ${actual ? 'flex' : 'hidden lg:flex'}`}>
        {actual
          ? <Hilo key={actual.id} c={actual} onVolver={() => setSeleccion(null)} />
          : correoActivo
            ? <div className="grid flex-1 place-items-center p-8 text-center text-sm text-gray-400">Elige una conversación para leerla y responder.</div>
            : <Bienvenida onConectar={() => setConectar(true)} />}
      </div>
    </section>

    {conectar && <ConectarCanal onCerrar={() => setConectar(false)} />}
  </div>
}

function FilaConversacion({ c, activa, onClick }: { c: Conversacion; activa: boolean; onClick: () => void }) {
  const nombre = nombreContacto(c)
  const noLeida = c.no_leidos > 0 && c.estado === 'abierta'
  return <button type="button" onClick={onClick}
    className={`flex w-full gap-3 border-b border-gray-50 px-4 py-3 text-left ${activa ? 'bg-blue-50/70' : 'hover:bg-gray-50'}`}>
    <Avatar nombre={nombre} />
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <p className={`truncate text-sm ${noLeida ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{nombre}</p>
        <span className="shrink-0 text-[11px] text-gray-400">{horaCorta(c.ultimo_mensaje_en)}</span>
      </div>
      {c.asunto && <p className="truncate text-xs font-medium text-gray-600">{c.asunto}</p>}
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs text-gray-400">{c.ultima_direccion === 'saliente' ? 'Tú: ' : ''}{c.ultimo_extracto}</p>
        {noLeida && <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-blue-600 px-1.5 text-[10px] font-bold text-white">{c.no_leidos}</span>}
      </div>
    </div>
  </button>
}

function Hilo({ c, onVolver }: { c: Conversacion; onVolver: () => void }) {
  const { data: mensajes = [], isLoading } = useMensajesConversacion(c.id)
  const actualizar = useActualizarConversacion()
  const responder = useResponderConversacion()
  const [texto, setTexto] = useState('')
  const [aviso, setAviso] = useState('')
  const finRef = useRef<HTMLDivElement>(null)

  // Abrirla la marca como leída (una vez por apertura, no en cada refresco).
  const { mutate: marcar } = actualizar
  useEffect(() => {
    if (c.no_leidos > 0) marcar({ id: c.id, cambios: { no_leidos: 0 } })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.id])

  useEffect(() => { finRef.current?.scrollIntoView({ block: 'end' }) }, [mensajes.length])

  async function enviar() {
    const limpio = texto.trim()
    if (!limpio || responder.isPending) return
    setAviso('')
    try {
      const r = await responder.mutateAsync({ conversacionId: c.id, texto: limpio })
      setTexto('')
      if (r.aviso) setAviso(r.aviso)
    } catch (e) {
      setAviso((e as Error).message)
    }
  }

  const nombre = nombreContacto(c)
  return <>
    <header className="flex items-center gap-3 border-b border-gray-100 bg-white px-4 py-3">
      <button type="button" onClick={onVolver} aria-label="Volver a la lista" className="rounded-lg p-1 text-gray-500 hover:bg-gray-100 md:hidden">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>
      </button>
      <Avatar nombre={nombre} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-bold text-gray-900">{nombre}</p>
        <p className="truncate text-xs text-gray-400">{c.contacto_externo}</p>
      </div>
      <button type="button"
        onClick={() => actualizar.mutate({ id: c.id, cambios: { estado: c.estado === 'abierta' ? 'cerrada' : 'abierta' } })}
        className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-50">
        {c.estado === 'abierta' ? 'Cerrar' : 'Reabrir'}
      </button>
    </header>

    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
      {isLoading && <p className="text-center text-xs text-gray-400">Cargando…</p>}
      {mensajes.map((m, i) => {
        const propio = m.direccion === 'saliente'
        const cambioAsunto = m.asunto && m.asunto.replace(/^(re|rv|fwd?)\s*:\s*/i, '') !== (mensajes[i - 1]?.asunto ?? '').replace(/^(re|rv|fwd?)\s*:\s*/i, '')
        return <div key={m.id} className={`flex ${propio ? 'justify-end' : 'justify-start'}`}>
          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${propio ? 'rounded-br-md bg-blue-600 text-white' : 'rounded-bl-md border border-gray-100 bg-white text-gray-800'}`}>
            {cambioAsunto && <p className={`mb-1 text-[11px] font-semibold ${propio ? 'text-blue-100' : 'text-gray-500'}`}>{m.asunto}</p>}
            <p className="whitespace-pre-wrap break-words">{quitarCitado(m.texto ?? '')}</p>
            {m.adjuntos?.length > 0 && <div className="mt-2 space-y-1">
              {m.adjuntos.map((a, j) => <p key={j} className={`truncate text-[11px] ${propio ? 'text-blue-100' : 'text-gray-500'}`}>📎 {a.filename || 'Adjunto'}</p>)}
              {!propio && <p className="text-[10px] text-gray-400">Los adjuntos se abren desde la casilla de correo.</p>}
            </div>}
            <p className={`mt-1 text-right text-[10px] ${propio ? 'text-blue-100' : 'text-gray-400'}`}>{horaCorta(m.enviado_en)}</p>
          </div>
        </div>
      })}
      <div ref={finRef} />
    </div>

    <div className="border-t border-gray-100 bg-white p-3">
      {aviso && <p role="alert" className="mb-2 text-xs text-red-600">{aviso}</p>}
      <div className="flex items-end gap-2">
        <textarea value={texto} onChange={e => setTexto(e.target.value)} rows={2}
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); enviar() } }}
          placeholder={`Responder a ${nombre}…`}
          className="min-h-[44px] flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-base outline-none focus:border-blue-400 md:text-sm" />
        <button type="button" onClick={enviar} disabled={!texto.trim() || responder.isPending}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
          {responder.isPending ? 'Enviando…' : 'Enviar'}
        </button>
      </div>
      <p className="mt-1 text-[10px] text-gray-400">Sale desde tu casilla, en el mismo hilo del correo del cliente. Ctrl + Enter para enviar.</p>
    </div>
  </>
}

function ConectarCanal({ onCerrar }: { onCerrar: () => void }) {
  const { rol } = useAuth()
  const { data: smtp } = useSmtpConfig()
  const { data: correo } = useCorreoEntrante()
  const activar = useActivarCorreoEntrante()
  const sincronizar = useSincronizarCorreo()
  const [mensaje, setMensaje] = useState('')

  const casilla = smtp?.from_email || smtp?.user
  const listo = smtp?.mode === 'smtp' && !!smtp?.host && !!casilla && !!smtp?.hasPassword
  const activo = !!correo?.activo

  async function conectar() {
    setMensaje('')
    try {
      await activar.mutateAsync(true)
      const r = await sincronizar.mutateAsync()
      setMensaje(r.ok ? `Listo: entraron ${r.nuevos ?? 0} correos recientes.` : (r.error || 'Se activó, pero la primera revisión falló.'))
    } catch (e) {
      setMensaje((e as Error).message)
    }
  }

  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCerrar}>
    <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-900">Conectar canal</h2>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">✕</button>
      </div>

      <div className="mt-4 rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <MailLogo size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-800">Correo</p>
            <p className="truncate text-xs text-gray-500">{casilla || 'Sin casilla configurada'}</p>
          </div>
          {activo && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">Conectado</span>}
        </div>

        {!listo && <p className="mt-3 text-xs leading-5 text-gray-500">
          Primero configura tu casilla con SMTP propio en{' '}
          <Link to="/config?tab=smtp" className="font-semibold text-blue-600 hover:underline">Configuración → Correo</Link>.
          Pixit usa esa misma casilla para leer lo que te escriben.
        </p>}

        {listo && !activo && <>
          <p className="mt-3 text-xs leading-5 text-gray-500">
            Pixit revisará <b>{casilla}</b> cada 2 minutos. Al conectar entran los últimos 10 correos y, desde ahí, los nuevos.
            Los boletines y respuestas automáticas quedan fuera. Los correos siguen también en tu casilla.
          </p>
          {rol === 'admin'
            ? <button type="button" onClick={conectar} disabled={activar.isPending || sincronizar.isPending}
                className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {activar.isPending || sincronizar.isPending ? 'Conectando…' : 'Conectar correo'}
              </button>
            : <p className="mt-3 text-xs font-semibold text-gray-500">Solo un administrador puede conectarlo.</p>}
        </>}

        {activo && <div className="mt-3 space-y-2 text-xs text-gray-500">
          <p>Última revisión: {correo?.ultima_revision ? new Date(correo.ultima_revision).toLocaleString('es-CL') : 'todavía no'}</p>
          {correo?.ultimo_error && <p className="text-red-600">{correo.ultimo_error}</p>}
          <div className="flex gap-2">
            <button type="button" onClick={async () => {
              setMensaje('')
              try {
                const r = await sincronizar.mutateAsync()
                setMensaje(r.ok ? (r.nuevos ? `Entraron ${r.nuevos} correos nuevos.` : 'No hay correos nuevos.') : (r.error || 'No se pudo revisar.'))
              } catch (e) { setMensaje((e as Error).message) }
            }} disabled={sincronizar.isPending}
              className="rounded-lg border border-gray-200 px-3 py-1.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {sincronizar.isPending ? 'Revisando…' : 'Revisar ahora'}
            </button>
            {rol === 'admin' && <button type="button" onClick={() => activar.mutate(false)}
              className="rounded-lg px-3 py-1.5 font-semibold text-gray-500 hover:bg-gray-50">Desconectar</button>}
          </div>
        </div>}

        {mensaje && <p className="mt-2 text-xs font-medium text-gray-700">{mensaje}</p>}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {CANALES_META.map(c => <div key={c.id} className="rounded-xl border border-gray-100 p-3 text-center opacity-60">
          <ChannelLogo canal={c} />
          <p className="mt-2 text-xs font-semibold text-gray-700">{c.nombre}</p>
          <p className="text-[10px] text-gray-400">Próximamente</p>
        </div>)}
      </div>
    </div>
  </div>
}

function BandejaVacia({ cargando, conectado, hayConversaciones }: { cargando: boolean; conectado: boolean; hayConversaciones: boolean }) {
  if (cargando) return <p className="p-6 text-center text-xs text-gray-400">Cargando…</p>
  return <div className="grid h-full place-items-center px-6 py-12 text-center">
    <div>
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-400"><InboxIcon /></div>
      <p className="mt-4 text-sm font-bold text-gray-800">{hayConversaciones ? 'Nada por aquí' : 'Tu bandeja está vacía'}</p>
      <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-gray-400">
        {hayConversaciones
          ? 'Ninguna conversación coincide con este filtro.'
          : conectado
            ? 'Cuando un cliente te escriba, su correo aparecerá aquí.'
            : 'Cuando conectes un canal, las conversaciones nuevas aparecerán aquí.'}
      </p>
    </div>
  </div>
}

function Bienvenida({ onConectar }: { onConectar: () => void }) {
  return <div className="grid flex-1 place-items-center p-8 text-center">
    <div className="max-w-md">
      <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600"><ChatIcon size={29} /></div>
      <h2 className="mt-5 text-xl font-bold text-gray-900">Centraliza la atención</h2>
      <p className="mt-2 text-sm leading-6 text-gray-500">Conecta tus canales para responder clientes desde un solo lugar. Parte por tu correo: es el único disponible por ahora.</p>
      <div className="mt-6 grid grid-cols-4 gap-3">
        <div className="rounded-xl border-2 border-blue-200 bg-white p-3">
          <MailLogo />
          <p className="mt-2 text-xs font-semibold text-gray-700">Correo</p>
        </div>
        {CANALES_META.map(canal => <div key={canal.id} className="rounded-xl border border-gray-200 bg-white p-3 opacity-60">
          <ChannelLogo canal={canal} />
          <p className="mt-2 text-xs font-semibold text-gray-700">{canal.nombre}</p>
        </div>)}
      </div>
      <button type="button" onClick={onConectar} className="mt-6 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Conectar correo</button>
    </div>
  </div>
}

function Avatar({ nombre }: { nombre: string }) {
  return <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
    {nombre.trim().charAt(0).toUpperCase() || '?'}
  </span>
}

function ChannelLogo({ canal, size = 'md' }: { canal: (typeof CANALES_META)[number], size?: 'sm' | 'md' }) {
  const dimensions = size === 'sm' ? 'h-8 w-8' : 'mx-auto h-10 w-10'

  return <img
    src={canal.logo}
    alt={`Logo de ${canal.nombre}`}
    width={size === 'sm' ? 32 : 40}
    height={size === 'sm' ? 32 : 40}
    loading="lazy"
    decoding="async"
    className={`${dimensions} shrink-0 object-contain`}
  />
}

function MailLogo({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const box = size === 'sm' ? 'h-8 w-8' : 'mx-auto h-10 w-10'
  return <span className={`${box} grid shrink-0 place-items-center rounded-lg bg-blue-600 text-white`} aria-hidden="true">
    <svg width={size === 'sm' ? 17 : 21} height={size === 'sm' ? 17 : 21} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
  </span>
}

function ChatIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01" strokeWidth="2.5"/></svg>
}

function InboxIcon() {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></svg>
}
