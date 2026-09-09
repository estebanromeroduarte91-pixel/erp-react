const CANALES = [
  { id: 'whatsapp', nombre: 'WhatsApp', detalle: 'Mensajes de WhatsApp Business', color: 'bg-green-500', letra: 'W' },
  { id: 'instagram', nombre: 'Instagram', detalle: 'Mensajes directos de Instagram', color: 'bg-gradient-to-br from-violet-600 via-pink-500 to-amber-400', letra: 'I' },
  { id: 'messenger', nombre: 'Messenger', detalle: 'Mensajes de Facebook', color: 'bg-blue-600', letra: 'M' },
]

export function ConversacionesPage() {
  return <div className="flex h-[calc(100vh-5.5rem)] min-h-[560px] flex-col px-4 py-5 md:h-[calc(100vh-4rem)] md:p-0">
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-gray-900">Conversaciones</h1>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">Sin canales conectados</span>
        </div>
        <p className="mt-1 text-sm text-gray-500">Todos los mensajes de tus clientes en una sola bandeja.</p>
      </div>
      <button type="button" className="self-start rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-blue-600/15 hover:bg-blue-700">
        + Conectar canal
      </button>
    </div>

    <section className="grid min-h-0 flex-1 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm md:grid-cols-[280px_minmax(320px,390px)_1fr]">
      <aside className="hidden border-r border-gray-100 p-4 md:block">
        <p className="px-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Canales</p>
        <button type="button" className="mt-3 flex w-full items-center justify-between rounded-xl bg-blue-50 px-3 py-2.5 text-left text-sm font-semibold text-blue-700">
          <span className="flex items-center gap-2"><span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-600 text-white"><ChatIcon /></span>Todos</span>
          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] text-gray-500">0</span>
        </button>
        <div className="mt-6 space-y-2">
          {CANALES.map(canal => <div key={canal.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 opacity-55">
            <span className={`grid h-8 w-8 place-items-center rounded-lg text-xs font-bold text-white ${canal.color}`}>{canal.letra}</span>
            <div className="min-w-0"><p className="text-sm font-semibold text-gray-700">{canal.nombre}</p><p className="truncate text-[10px] text-gray-400">No conectado</p></div>
          </div>)}
        </div>
      </aside>

      <div className="flex min-h-0 flex-col border-r border-gray-100">
        <div className="border-b border-gray-100 p-4">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input disabled placeholder="Buscar conversaciones…" className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-3 text-sm text-gray-400 outline-none" />
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto">
            <span className="whitespace-nowrap rounded-full bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white">Todas</span>
            <span className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">Sin responder</span>
            <span className="whitespace-nowrap rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-500">Asignadas</span>
          </div>
        </div>
        <div className="grid flex-1 place-items-center px-6 py-12 text-center">
          <div>
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-100 text-gray-400"><InboxIcon /></div>
            <p className="mt-4 text-sm font-bold text-gray-800">Tu bandeja está vacía</p>
            <p className="mx-auto mt-1 max-w-[260px] text-xs leading-5 text-gray-400">Cuando conectes un canal, las conversaciones nuevas aparecerán aquí.</p>
          </div>
        </div>
      </div>

      <div className="hidden min-h-0 place-items-center bg-gray-50/40 p-8 text-center lg:grid">
        <div className="max-w-md">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-blue-50 text-blue-600"><ChatIcon size={29} /></div>
          <h2 className="mt-5 text-xl font-bold text-gray-900">Centraliza la atención</h2>
          <p className="mt-2 text-sm leading-6 text-gray-500">Conecta tus canales para responder clientes, asignar conversaciones y vincularlas con contactos, cotizaciones y órdenes.</p>
          <div className="mt-6 grid grid-cols-3 gap-3">
            {CANALES.map(canal => <div key={canal.id} className="rounded-xl border border-gray-200 bg-white p-3">
              <span className={`mx-auto grid h-9 w-9 place-items-center rounded-xl text-xs font-bold text-white ${canal.color}`}>{canal.letra}</span>
              <p className="mt-2 text-xs font-semibold text-gray-700">{canal.nombre}</p>
            </div>)}
          </div>
          <button type="button" className="mt-6 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">Conectar primer canal</button>
        </div>
      </div>
    </section>
  </div>
}

function ChatIcon({ size = 18 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 10h.01M12 10h.01M16 10h.01" strokeWidth="2.5"/></svg>
}

function InboxIcon() {
  return <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><path d="M4 14h4l2 3h4l2-3h4"/></svg>
}
