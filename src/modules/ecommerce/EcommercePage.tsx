import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { Spinner } from '@/components/shared/Spinner'
import { extraerMensajeError } from '@/lib/edgeError'

type EstadoGestion = 'nuevo' | 'preparando' | 'listo' | 'despachado' | 'entregado' | 'cancelado'
type Periodo = 'mes' | 'hoy' | 'rango' | 'todo'
type PlataformaEcommerce = 'woocommerce' | 'shopify' | 'jumpseller' | 'mercadolibre'

const PLATAFORMAS: {
  id: PlataformaEcommerce
  nombre: string
  logo: string
  disponible: boolean
  logoClassName: string
}[] = [
  {
    id: 'woocommerce',
    nombre: 'WooCommerce',
    logo: 'https://woocommerce.com/wp-content/uploads/2025/01/Logo-Primary.png',
    disponible: true,
    logoClassName: 'max-h-9 max-w-[112px]',
  },
  {
    id: 'shopify',
    nombre: 'Shopify',
    logo: 'https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-primary-logo-456baa801ee66a0a435671082365958316831c9960c480451dd0330bcdae304f.svg',
    disponible: false,
    logoClassName: 'max-h-10 max-w-[112px]',
  },
  {
    id: 'jumpseller',
    nombre: 'Jumpseller',
    logo: 'https://es.jumpseller.com/images/brand/jumpseller-logo-26.svg',
    disponible: false,
    logoClassName: 'max-h-8 max-w-[118px]',
  },
  {
    id: 'mercadolibre',
    nombre: 'Mercado Libre',
    logo: 'https://http2.mlstatic.com/frontend-assets/ml-web-navigation/ui-navigation/6.6.133/mercadolibre/logo__large_plus.png',
    disponible: false,
    logoClassName: 'max-h-8 max-w-[112px]',
  },
]

interface ItemPedido {
  id?: number
  nombre?: string
  sku?: string
  cantidad?: number
  precio?: number
  total?: number
  imagen?: string | null
}

interface PedidoEcommerce {
  id: string
  pedido_externo_id: string
  numero: string
  estado_origen: string
  estado_gestion: EstadoGestion
  moneda: string
  total: number
  subtotal_productos: number
  costo_envio: number
  metodo_pago_titulo: string | null
  cliente_nombre: string | null
  cliente_email: string | null
  cliente_telefono: string | null
  facturacion: Record<string, unknown>
  envio: Record<string, unknown>
  items: ItemPedido[]
  nota_cliente: string | null
  pagado_en: string | null
  creado_en_origen: string | null
  recibido_en: string
  stock_resultado: { ignorados?: { sku?: string; nombre?: string; motivo?: string }[] } | null
}

const ESTADOS: { id: EstadoGestion; label: string }[] = [
  { id: 'nuevo', label: 'Nuevo' },
  { id: 'preparando', label: 'Preparando' },
  { id: 'listo', label: 'Listo' },
  { id: 'despachado', label: 'Despachado' },
  { id: 'entregado', label: 'Entregado' },
  { id: 'cancelado', label: 'Cancelado' },
]

const WOO_ESTADOS: Record<string, string> = {
  pending: 'Pendiente de pago', processing: 'Pagado', 'on-hold': 'En espera',
  completed: 'Completado', cancelled: 'Cancelado', refunded: 'Reembolsado', failed: 'Fallido',
}

function dinero(valor: number, moneda = 'CLP') {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: moneda || 'CLP', maximumFractionDigits: 0 }).format(valor || 0)
}

function fecha(valor: string | null) {
  if (!valor) return '—'
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(valor))
}

function fechaInput(valor: Date) {
  const year = valor.getFullYear()
  const month = String(valor.getMonth() + 1).padStart(2, '0')
  const day = String(valor.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function limitesPeriodo(periodo: Periodo, desde: string, hasta: string) {
  if (periodo === 'todo') return { inicio: null, fin: null }
  const ahora = new Date()
  let inicio: Date
  let fin: Date

  if (periodo === 'hoy') {
    inicio = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate())
    fin = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1)
  } else if (periodo === 'mes') {
    inicio = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    fin = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1)
  } else {
    inicio = new Date(`${desde}T00:00:00`)
    const ultimoDia = new Date(`${hasta}T00:00:00`)
    fin = new Date(ultimoDia.getFullYear(), ultimoDia.getMonth(), ultimoDia.getDate() + 1)
  }
  return { inicio: inicio.toISOString(), fin: fin.toISOString() }
}

function textoBusqueda(valor: string) {
  return valor.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

function colorEstado(estado: EstadoGestion) {
  if (estado === 'nuevo') return 'bg-blue-50 text-blue-700'
  if (estado === 'preparando') return 'bg-amber-50 text-amber-700'
  if (estado === 'listo') return 'bg-violet-50 text-violet-700'
  if (estado === 'despachado') return 'bg-cyan-50 text-cyan-700'
  if (estado === 'entregado') return 'bg-green-50 text-green-700'
  return 'bg-gray-100 text-gray-600'
}

function direccion(datos: Record<string, unknown>) {
  return [datos.address_1, datos.address_2, datos.city, datos.state, datos.postcode]
    .filter(Boolean).map(String).join(', ') || 'Sin dirección registrada'
}

export function EcommercePage() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const hoy = fechaInput(new Date())
  const inicioMes = fechaInput(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [buscar, setBuscar] = useState('')
  const [estado, setEstado] = useState<'todos' | EstadoGestion>('todos')
  const [periodo, setPeriodo] = useState<Periodo>('mes')
  const [desde, setDesde] = useState(inicioMes)
  const [hasta, setHasta] = useState(hoy)
  const [detalle, setDetalle] = useState<PedidoEcommerce | null>(null)
  const [plataformaSeleccionada, setPlataformaSeleccionada] = useState<PlataformaEcommerce | null>(null)
  const [mensajeConexion, setMensajeConexion] = useState<string | null>(null)
  const limites = useMemo(() => limitesPeriodo(periodo, desde, hasta), [periodo, desde, hasta])

  const pedidosQuery = useQuery({
    queryKey: ['ecommerce-pedidos', empresaId, periodo, desde, hasta],
    enabled: !!empresaId && (periodo !== 'rango' || (!!desde && !!hasta && desde <= hasta)),
    queryFn: async () => {
      let consulta = supabase.from('ecommerce_pedidos')
        .select('id,pedido_externo_id,numero,estado_origen,estado_gestion,moneda,total,subtotal_productos,costo_envio,metodo_pago_titulo,cliente_nombre,cliente_email,cliente_telefono,facturacion,envio,items,nota_cliente,pagado_en,creado_en_origen,recibido_en,stock_resultado')
        .eq('empresa_id', empresaId!)
        .not('pagado_en', 'is', null)
      if (limites.inicio) consulta = consulta.gte('creado_en_origen', limites.inicio)
      if (limites.fin) consulta = consulta.lt('creado_en_origen', limites.fin)
      const { data, error } = await consulta
        .order('creado_en_origen', { ascending: false, nullsFirst: false })
        .limit(1000)
      if (error) throw error
      return (data ?? []).map(p => ({
        ...p,
        total: Number(p.total ?? 0),
        subtotal_productos: Number(p.subtotal_productos ?? p.total ?? 0),
        costo_envio: Number(p.costo_envio ?? 0),
        items: (p.items ?? []) as unknown as ItemPedido[],
      })) as PedidoEcommerce[]
    },
    refetchInterval: 30_000,
  })

  const conexionQuery = useQuery({
    queryKey: ['woo-conexion-publica', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data } = await supabase.from('woo_conexiones').select('site_url,activa').eq('empresa_id', empresaId!).maybeSingle()
      return data as { site_url?: string | null; activa?: boolean } | null
    },
  })

  const actualizarEstado = useMutation({
    mutationFn: async ({ id, estadoGestion }: { id: string; estadoGestion: EstadoGestion }) => {
      const { error } = await supabase.from('ecommerce_pedidos')
        .update({ estado_gestion: estadoGestion, actualizado_en: new Date().toISOString() })
        .eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce-pedidos', empresaId] }),
  })

  const sincronizarPedidos = useMutation({
    mutationFn: async () => {
      // functions.invoke normalmente adjunta la sesión, pero la enviamos de
      // forma explícita para que nunca use la anon key como Authorization.
      let { data: sessionData } = await supabase.auth.getSession()
      if (!sessionData.session?.access_token) {
        const refreshed = await supabase.auth.refreshSession()
        sessionData = refreshed.data
      }
      const accessToken = sessionData.session?.access_token
      if (!accessToken) throw new Error('Tu sesión expiró. Vuelve a iniciar sesión.')

      const { data, error } = await supabase.functions.invoke('woo-orders-pull', {
        body: { empresa_id: empresaId },
        headers: { Authorization: `Bearer ${accessToken}` },
      })
      if (error) throw new Error(await extraerMensajeError(error, 'No se pudieron actualizar los pedidos'))
      if (data?.ok === false) throw new Error(data.error || 'No se pudieron actualizar los pedidos')
      return data as { importados?: number }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ecommerce-pedidos', empresaId] }),
  })

  const pedidos = useMemo(() => pedidosQuery.data ?? [], [pedidosQuery.data])
  const filtrados = useMemo(() => {
    const q = textoBusqueda(buscar)
    return pedidos.filter(p => {
      if (estado !== 'todos' && p.estado_gestion !== estado) return false
      if (!q) return true
      const productos = p.items.map(i => `${i.nombre ?? ''} ${i.sku ?? ''}`).join(' ')
      return textoBusqueda(`${p.numero} ${p.cliente_nombre ?? ''} ${p.cliente_email ?? ''} ${productos}`).includes(q)
    })
  }, [buscar, estado, pedidos])

  const activos = pedidos.filter(p => !['entregado', 'cancelado'].includes(p.estado_gestion))
  const pagados = pedidos.filter(p => ['processing', 'completed'].includes(p.estado_origen))
  const conAlerta = pedidos.filter(p => (p.stock_resultado?.ignorados?.length ?? 0) > 0)

  if (pedidosQuery.isLoading || conexionQuery.isLoading) return <div className="py-16"><Spinner /></div>

  if (!conexionQuery.data?.activa) {
    const plataforma = PLATAFORMAS.find(item => item.id === plataformaSeleccionada)
    return <BienvenidaEcommerce
      seleccionada={plataformaSeleccionada}
      mensaje={mensajeConexion}
      onSelect={id => {
        setPlataformaSeleccionada(id)
        setMensajeConexion(null)
      }}
      onConnect={() => {
        if (!plataforma) return
        setMensajeConexion(plataforma.disponible
          ? 'WooCommerce está disponible. La conexión requiere la URL y las credenciales API de la tienda.'
          : `La conexión con ${plataforma.nombre} estará disponible próximamente.`)
      }}
    />
  }

  return (
    <div className="px-4 py-5 md:p-0 max-w-[1500px] mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-gray-900">Ecommerce</h1>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${conexionQuery.data?.activa ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {conexionQuery.data?.activa ? 'WooCommerce conectado' : 'Sin conexión activa'}
            </span>
          </div>
          <p className="text-sm text-gray-500 mt-1">Pedidos online recibidos desde tu tienda.</p>
        </div>
        <button onClick={() => sincronizarPedidos.mutate()} disabled={sincronizarPedidos.isPending}
          className="self-start rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">
          {sincronizarPedidos.isPending ? 'Sincronizando…' : 'Sincronizar WooCommerce'}
        </button>
      </div>

      {sincronizarPedidos.error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{sincronizarPedidos.error.message}</div>}

      {pedidosQuery.error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los pedidos: {(pedidosQuery.error as Error).message}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 mb-5">
        <Kpi label="Por gestionar" value={String(activos.length)} detail="pedidos activos" />
        <Kpi label="Preparando" value={String(pedidos.filter(p => p.estado_gestion === 'preparando').length)} detail="en preparación" />
        <Kpi label="Ventas pagadas" value={dinero(pagados.reduce((s, p) => s + p.total, 0))} detail={`${pagados.length} pedidos`} />
        <Kpi label="Alertas de stock" value={String(conAlerta.length)} detail="SKU sin asociar" alert={conAlerta.length > 0} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <label className="min-w-[150px]">
              <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Período</span>
              <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none">
                <option value="mes">Este mes</option>
                <option value="hoy">Hoy</option>
                <option value="rango">Rango de fechas</option>
                <option value="todo">Todo el historial</option>
              </select>
            </label>
            {periodo === 'rango' && <>
              <label className="min-w-[150px] flex-1 sm:flex-none">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Desde</span>
                <input type="date" value={desde} max={hasta || undefined} onChange={e => setDesde(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none" />
              </label>
              <label className="min-w-[150px] flex-1 sm:flex-none">
                <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wide text-gray-400">Hasta</span>
                <input type="date" value={hasta} min={desde || undefined} onChange={e => setHasta(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none" />
              </label>
            </>}
          </div>
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
          <div className="relative flex-1 max-w-xl">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
            <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar pedido, cliente, producto o SKU…"
              className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-400" />
          </div>
          <select value={estado} onChange={e => setEstado(e.target.value as typeof estado)}
            className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm outline-none">
            <option value="todos">Todos los estados</option>
            {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          </div>
        </div>

        {filtrados.length === 0 ? (
          <div className="py-20 text-center text-sm text-gray-400">
            {pedidos.length === 0 ? 'Los próximos pedidos de WooCommerce aparecerán aquí.' : 'No hay pedidos para esta búsqueda.'}
          </div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
                  <tr><th className="text-left px-5 py-3">Pedido</th><th className="text-left px-4 py-3">Cliente</th><th className="text-left px-4 py-3">Compra</th><th className="text-right px-4 py-3">Productos</th><th className="text-right px-4 py-3">Envío</th><th className="text-left px-4 py-3">WooCommerce</th><th className="text-left px-4 py-3">Gestión</th><th className="text-right px-5 py-3">Total</th></tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filtrados.map(p => <FilaPedido key={p.id} pedido={p} onOpen={() => setDetalle(p)} onEstado={estadoGestion => actualizarEstado.mutate({ id: p.id, estadoGestion })} />)}
                </tbody>
              </table>
            </div>
            <div className="md:hidden divide-y divide-gray-100">
              {filtrados.map(p => <TarjetaPedido key={p.id} pedido={p} onOpen={() => setDetalle(p)} onEstado={estadoGestion => actualizarEstado.mutate({ id: p.id, estadoGestion })} />)}
            </div>
          </>
        )}
      </div>

      {detalle && <DetallePedido pedido={detalle} siteUrl={conexionQuery.data?.site_url} onClose={() => setDetalle(null)} />}
    </div>
  )
}

function BienvenidaEcommerce({
  seleccionada,
  mensaje,
  onSelect,
  onConnect,
}: {
  seleccionada: PlataformaEcommerce | null
  mensaje: string | null
  onSelect: (id: PlataformaEcommerce) => void
  onConnect: () => void
}) {
  const plataforma = PLATAFORMAS.find(item => item.id === seleccionada)
  return <div className="px-4 py-5 md:p-0 max-w-[1500px] mx-auto">
    <div className="mb-5">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-bold text-gray-900">Ecommerce</h1>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500">Sin conexión activa</span>
      </div>
      <p className="mt-1 text-sm text-gray-500">Administra tus pedidos online desde Pixit.</p>
    </div>

    <section className="mx-auto max-w-6xl rounded-2xl border border-gray-200 bg-white px-5 py-8 shadow-sm md:px-8 md:py-10">
      <div className="mx-auto max-w-2xl text-center">
        <div className="mx-auto grid h-13 w-13 place-items-center rounded-2xl bg-violet-50 text-violet-600">
          <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16"/><path d="M5 7l1-3h12l1 3"/><path d="M5 7v13h14V7"/><path d="M9 11h6v5H9z"/></svg>
        </div>
        <h2 className="mt-4 text-2xl font-bold text-gray-900">Conecta tu tienda online</h2>
        <p className="mt-2 text-sm leading-6 text-gray-500">Recibe y gestiona tus pedidos en un solo lugar. Elige la plataforma que utilizas para comenzar.</p>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {PLATAFORMAS.map(item => {
          const activa = seleccionada === item.id
          return <button
            key={item.id}
            type="button"
            aria-pressed={activa}
            onClick={() => onSelect(item.id)}
            className={`relative min-h-[190px] rounded-2xl border bg-white p-5 text-left transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-lg hover:shadow-blue-600/5 ${activa ? 'border-2 border-blue-600 p-[19px] ring-4 ring-blue-600/5' : 'border-gray-200'}`}
          >
            <span className={`absolute right-3 top-3 rounded-full px-2 py-1 text-[10px] font-semibold ${item.disponible ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
              {item.disponible ? 'Disponible' : 'Próximamente'}
            </span>
            <span className="flex h-13 items-center pr-18">
              <img src={item.logo} alt={item.nombre} className={`block h-auto w-auto object-contain object-left ${item.logoClassName}`} />
            </span>
            <span className="mt-3 block text-[15px] font-bold text-gray-900">{item.nombre}</span>
            <span className="mt-2 block text-xs leading-5 text-gray-500">Sincroniza pedidos pagados, clientes, productos y estados de venta en Pixit.</span>
          </button>
        })}
      </div>

      {mensaje && <div className={`mt-5 rounded-xl border px-4 py-3 text-sm ${plataforma?.disponible ? 'border-blue-100 bg-blue-50 text-blue-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}>{mensaje}</div>}

      <div className="mt-7 flex flex-col gap-4 border-t border-gray-100 pt-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          <span>Tu conexión es privada y puedes desconectarla cuando quieras.</span>
        </div>
        <button type="button" disabled={!seleccionada} onClick={onConnect}
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white shadow-md shadow-blue-600/15 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400 disabled:shadow-none">
          {plataforma ? `Conectar ${plataforma.nombre}` : 'Selecciona una plataforma'}
        </button>
      </div>

      <p className="mt-5 text-center text-xs text-gray-500">¿Usas otra plataforma? <button type="button" className="font-semibold text-blue-600 hover:underline">Solicitar integración</button></p>
    </section>
  </div>
}

function Kpi({ label, value, detail, alert = false }: { label: string; value: string; detail: string; alert?: boolean }) {
  return <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-5 min-w-0"><p className="text-[10px] md:text-xs font-semibold uppercase tracking-wide text-gray-400">{label}</p><p className={`mt-2 truncate text-xl md:text-2xl font-bold ${alert ? 'text-amber-600' : 'text-gray-900'}`}>{value}</p><p className="mt-1 text-[11px] text-gray-400">{detail}</p></div>
}

function SelectorEstado({ pedido, onEstado }: { pedido: PedidoEcommerce; onEstado: (estado: EstadoGestion) => void }) {
  return <select value={pedido.estado_gestion} onChange={e => onEstado(e.target.value as EstadoGestion)} onClick={e => e.stopPropagation()}
    className={`rounded-lg border-0 px-2.5 py-1.5 text-xs font-semibold outline-none ${colorEstado(pedido.estado_gestion)}`}>
    {ESTADOS.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
  </select>
}

function FilaPedido({ pedido, onOpen, onEstado }: { pedido: PedidoEcommerce; onOpen: () => void; onEstado: (estado: EstadoGestion) => void }) {
  const alerta = (pedido.stock_resultado?.ignorados?.length ?? 0) > 0
  return <tr onClick={onOpen} className="cursor-pointer hover:bg-gray-50/70">
    <td className="px-5 py-4"><p className="font-bold text-blue-600">#{pedido.numero}</p><p className="text-xs text-gray-400 mt-1">{fecha(pedido.creado_en_origen ?? pedido.recibido_en)}</p></td>
    <td className="px-4 py-4"><p className="font-semibold text-gray-800">{pedido.cliente_nombre || 'Cliente ecommerce'}</p><p className="text-xs text-gray-400 mt-1">{pedido.cliente_email || 'Sin email'}</p></td>
    <td className="px-4 py-4"><p className="text-gray-700">{pedido.items.length} {pedido.items.length === 1 ? 'producto' : 'productos'}</p>{alerta && <p className="text-xs font-semibold text-amber-600 mt-1">Revisar SKU</p>}</td>
    <td className="px-4 py-4 text-right font-medium text-gray-700 whitespace-nowrap">{dinero(pedido.subtotal_productos, pedido.moneda)}</td>
    <td className="px-4 py-4 text-right font-medium text-gray-500 whitespace-nowrap">{pedido.costo_envio > 0 ? dinero(pedido.costo_envio, pedido.moneda) : 'Sin costo'}</td>
    <td className="px-4 py-4"><span className="text-xs font-medium text-gray-600">{WOO_ESTADOS[pedido.estado_origen] ?? pedido.estado_origen}</span></td>
    <td className="px-4 py-4"><SelectorEstado pedido={pedido} onEstado={onEstado} /></td>
    <td className="px-5 py-4 text-right font-bold text-gray-900">{dinero(pedido.total, pedido.moneda)}</td>
  </tr>
}

function TarjetaPedido({ pedido, onOpen, onEstado }: { pedido: PedidoEcommerce; onOpen: () => void; onEstado: (estado: EstadoGestion) => void }) {
  const alerta = (pedido.stock_resultado?.ignorados?.length ?? 0) > 0
  return <div className="p-4" onClick={onOpen}>
    <div className="flex justify-between gap-3"><div><p className="font-bold text-blue-600">#{pedido.numero}</p><p className="text-sm font-semibold text-gray-900 mt-1">{pedido.cliente_nombre || 'Cliente ecommerce'}</p></div><p className="font-bold text-gray-900 whitespace-nowrap">{dinero(pedido.total, pedido.moneda)}</p></div>
    <div className="mt-3 flex items-center justify-between gap-3"><div><p className="text-xs text-gray-500">{pedido.items.length} {pedido.items.length === 1 ? 'producto' : 'productos'} · {WOO_ESTADOS[pedido.estado_origen] ?? pedido.estado_origen}</p><p className="mt-1 text-xs text-gray-500">Productos {dinero(pedido.subtotal_productos, pedido.moneda)} · Envío {pedido.costo_envio > 0 ? dinero(pedido.costo_envio, pedido.moneda) : '$0'}</p>{alerta && <p className="text-xs font-semibold text-amber-600 mt-1">Revisar SKU sin asociar</p>}</div><SelectorEstado pedido={pedido} onEstado={onEstado} /></div>
  </div>
}

function DetallePedido({ pedido, siteUrl, onClose }: { pedido: PedidoEcommerce; siteUrl?: string | null; onClose: () => void }) {
  const alertas = pedido.stock_resultado?.ignorados ?? []
  const urlWoo = siteUrl ? `${siteUrl.replace(/\/+$/, '')}/wp-admin/post.php?post=${encodeURIComponent(pedido.pedido_externo_id)}&action=edit` : null
  return createPortal(<div className="fixed inset-0 z-[300] bg-black/45 p-3 md:p-8 flex justify-end" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="w-full max-w-xl h-full overflow-y-auto rounded-2xl bg-white shadow-2xl">
      <div className="sticky top-0 z-10 flex items-start justify-between border-b border-gray-100 bg-white px-5 py-4"><div><h2 className="text-lg font-bold text-gray-900">Pedido #{pedido.numero}</h2><p className="text-xs text-gray-400 mt-1">Recibido {fecha(pedido.creado_en_origen ?? pedido.recibido_en)}</p></div><button onClick={onClose} className="text-xl text-gray-400">×</button></div>
      <div className="p-5 space-y-5">
        <section><h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Productos</h3><div className="rounded-xl border border-gray-200 divide-y divide-gray-100">{pedido.items.map((i, index) => <div key={i.id ?? index} className="flex gap-3 p-3"><div className="h-12 w-12 shrink-0 rounded-lg bg-gray-50 overflow-hidden">{i.imagen && <img src={i.imagen} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="text-sm font-semibold text-gray-800">{i.nombre || 'Producto'}</p><p className="text-xs text-gray-400 mt-1">SKU {i.sku || 'sin SKU'} · Cant. {i.cantidad ?? 1}</p></div><p className="text-sm font-bold text-gray-800">{dinero(Number(i.total ?? 0), pedido.moneda)}</p></div>)}</div></section>
        {alertas.length > 0 && <section className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h3 className="text-sm font-bold text-amber-800">Productos que no movieron stock</h3>{alertas.map((a, i) => <p key={i} className="text-xs text-amber-700 mt-2">{a.sku || a.nombre || 'Producto'}: {a.motivo}</p>)}</section>}
        <section className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Info title="Cliente" lines={[pedido.cliente_nombre, pedido.cliente_email, pedido.cliente_telefono]} /><Info title="Despacho" lines={[direccion(Object.keys(pedido.envio ?? {}).length ? pedido.envio : pedido.facturacion)]} /></section>
        {pedido.nota_cliente && <Info title="Nota del cliente" lines={[pedido.nota_cliente]} />}
        <section className="rounded-xl bg-gray-50 p-4 space-y-2"><div className="flex justify-between text-sm text-gray-500"><span>Método de pago</span><span>{pedido.metodo_pago_titulo || 'No informado'}</span></div><div className="flex justify-between text-sm text-gray-600"><span>Productos</span><span>{dinero(pedido.subtotal_productos, pedido.moneda)}</span></div><div className="flex justify-between text-sm text-gray-600"><span>Envío</span><span>{dinero(pedido.costo_envio, pedido.moneda)}</span></div><div className="flex justify-between border-t border-gray-200 pt-2 text-base font-bold text-gray-900"><span>Total pagado</span><span>{dinero(pedido.total, pedido.moneda)}</span></div></section>
        {urlWoo && <a href={urlWoo} target="_blank" rel="noreferrer" className="block w-full rounded-xl bg-gray-900 px-4 py-3 text-center text-sm font-semibold text-white">Abrir pedido en WooCommerce</a>}
      </div>
    </div>
  </div>, document.body)
}

function Info({ title, lines }: { title: string; lines: (string | null | undefined)[] }) {
  return <div className="rounded-xl border border-gray-200 p-4"><h3 className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">{title}</h3>{lines.filter(Boolean).map((line, i) => <p key={i} className="text-sm text-gray-700 mt-1 break-words">{line}</p>)}</div>
}
