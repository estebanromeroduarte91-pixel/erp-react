import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  useBodegas, useCajaSesiones, useGastoCategoriaConfig, useGastosEnRango, useMetodosPago, useOCs,
  useOrdenesEntregadasEnRango, useRentabilidadSucursales,
} from '@/lib/queries'
import {
  useCerrarMes, useCierreGuardado, useDtesCierre, usePedidosOnlineCierre, useReabrirMes, useStockNegativo, useVentasCierre,
  type CierreGuardado,
} from '@/lib/queries/useCierre'
import {
  cajaDelMes, cambiosDesdeCierre, comprasDelMes, flujoDeCaja, fotoCierre, gastosPorNaturaleza, ivaDelMes, mesAnterior, rangoMes, revisionCierre,
  type FotoCierre, type OrdenEntregadaCierre,
} from '@/lib/cierre'
import { cascada } from '@/lib/rentabilidad'
import { nombreMetodoPago } from '@/lib/metodoPago'
import { fechaLocal } from '@/lib/fecha'
import { Spinner } from '@/components/shared/Spinner'

const fmt = (n: number) => (n < 0 ? '−$' : '$') + Math.abs(Math.round(n)).toLocaleString('es-CL')
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

function nombreMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}

function mesSiguiente(mes: string): string {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function CierresTab() {
  // Por defecto el mes anterior: el cierre se hace cuando el mes ya terminó.
  const mesActual = fechaLocal().slice(0, 7)
  const [mes, setMes] = useState(() => mesAnterior(mesActual))
  const { desde, hasta } = rangoMes(mes)
  const previo = rangoMes(mesAnterior(mes))

  const rentabilidad = useRentabilidadSucursales({ desde, hasta })
  const rentabilidadPrevia = useRentabilidadSucursales({ desde: previo.desde, hasta: previo.hasta })
  const ventas = useVentasCierre(desde, hasta)
  const gastos = useGastosEnRango(desde, hasta)
  const { data: configNaturaleza } = useGastoCategoriaConfig()
  const ocs = useOCs()
  const { data: sesiones = [] } = useCajaSesiones()
  const { data: dtes = [] } = useDtesCierre(desde, hasta)
  const { data: pedidosOnline = [] } = usePedidosOnlineCierre(desde, hasta)
  const { data: stockNegativo = null } = useStockNegativo()
  const { data: ordenes = [] } = useOrdenesEntregadasEnRango(desde, hasta)
  const { data: metodos = [] } = useMetodosPago()
  const { data: bodegas = [] } = useBodegas()
  const { data: guardado = null } = useCierreGuardado(mes)

  const cargando = ventas.isLoading || gastos.isLoading || ocs.isLoading || rentabilidad.isLoading
  const error = ventas.error || gastos.error || ocs.error || rentabilidad.error

  const nombreBodega = useCallback((id: string) => {
    const b = bodegas.find(x => x.id === id)
    return b?.nombre || b?.name || 'Sin sucursal'
  }, [bodegas])

  const datos = useMemo(() => {
    if (!ventas.data || !gastos.data || !ocs.data) return null
    const compras = comprasDelMes(ocs.data, desde, hasta)
    const porNaturaleza = gastosPorNaturaleza(gastos.data, configNaturaleza)
    const caja = cajaDelMes(sesiones, ventas.data, desde, hasta)
    return {
      compras,
      caja,
      flujo: flujoDeCaja({ ventas: ventas.data, pedidosOnline, gastos: porNaturaleza, compras: compras.total }),
      iva: ivaDelMes({ ventas: ventas.data, gastos: gastos.data, ivaCompras: compras.ivaConFactura }),
      revision: revisionCierre({
        caja, dtes, compras, gastos: gastos.data, stockNegativo,
        ordenesEntregadas: ordenes.map((o): OrdenEntregadaCierre => ({ id: o.id, num: o.num ?? null, cliente: [o.nombre, o.apellido].filter(Boolean).join(' '), venta_id: o.venta_id ?? null, numero_boleta: o.numero_boleta, presup: o.presup })), pedidosOnline,
        nombreBodega,
      }),
    }
  }, [ventas.data, gastos.data, ocs.data, configNaturaleza, sesiones, pedidosOnline, dtes, stockNegativo, ordenes, desde, hasta, nombreBodega])

  const foto = useMemo(() => {
    if (!datos || !rentabilidad.data) return null
    const c = cascada(rentabilidad.data, null)
    return fotoCierre({ ventasNetas: c.ventasNetas, resultado: c.resultado, flujo: datos.flujo, iva: datos.iva, revision: datos.revision })
  }, [datos, rentabilidad.data])


  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Cierre de mes</h2>
        <p className="text-xs text-gray-500">Revisa que el mes esté completo, y mira cuánto ganó el negocio y cuánta plata entró y salió.</p>
      </div>
      <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white p-1">
        <button type="button" onClick={() => setMes(mesAnterior(mes))} aria-label="Mes anterior" className="rounded-lg px-2.5 py-1.5 text-gray-500 hover:bg-gray-100">‹</button>
        <span className="min-w-[140px] text-center text-sm font-semibold text-gray-800">{nombreMes(mes)}</span>
        <button type="button" onClick={() => setMes(mesSiguiente(mes))} disabled={mes >= mesActual} aria-label="Mes siguiente"
          className="rounded-lg px-2.5 py-1.5 text-gray-500 hover:bg-gray-100 disabled:opacity-30">›</button>
      </div>
    </div>

    {mes === mesActual && <p className="rounded-xl bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
      {nombreMes(mes)} todavía no termina: los números van a seguir cambiando hasta el último día.
    </p>}

    {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">No se pudo cargar el cierre: {(error as Error).message}</p>}
    {cargando && <div className="flex justify-center py-16"><Spinner className="h-8 w-8" /></div>}

    {datos && <>
      {foto && mes < mesActual && <BarraCierre mes={mes} foto={foto} guardado={guardado} />}
      <Revision puntos={datos.revision} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Tarjeta titulo="Resultado del mes" ayuda="¿Ganó plata el negocio? Resta el costo de lo vendido, no lo comprado.">
          <Resultado r={rentabilidad.data} previo={rentabilidadPrevia.data} nombreBodega={nombreBodega} />
        </Tarjeta>

        <Tarjeta titulo="Flujo de caja" ayuda="¿Cuánta plata entró y cuánta salió de verdad?">
          <Seccion titulo="Entró">
            {datos.flujo.entradas.porMetodo.map(m => <Linea key={m.metodo} etiqueta={nombreMetodoPago(m.metodo, metodos)} monto={m.monto} />)}
            {datos.flujo.entradas.tiendaOnline > 0 && <Linea etiqueta="Tienda online" monto={datos.flujo.entradas.tiendaOnline} />}
            <Linea etiqueta="Total entró" monto={datos.flujo.entradas.total} fuerte />
          </Seccion>
          <Seccion titulo="Salió">
            <Linea etiqueta="Gastos de operación" ayuda="Sueldos, arriendos, servicios y gastos corporativos" monto={datos.flujo.salidas.operacion} />
            <Linea etiqueta="Compras a proveedores" ayuda={`${datos.compras.ocs} órdenes recibidas en el mes, con IVA`} monto={datos.flujo.salidas.compras} />
            <Linea etiqueta="Créditos y banco" ayuda="Cuotas completas, intereses y comisiones" monto={datos.flujo.salidas.financiero} />
            <Linea etiqueta="Inversiones" ayuda="Equipos, herramientas, muebles" monto={datos.flujo.salidas.inversion} />
            <Linea etiqueta="Total salió" monto={datos.flujo.salidas.total} fuerte />
          </Seccion>
          <div className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 ${datos.flujo.saldo >= 0 ? 'bg-blue-50' : 'bg-amber-50'}`}>
            <span className="text-sm font-semibold text-gray-700">{datos.flujo.saldo >= 0 ? 'Quedó a favor' : 'Salió más de lo que entró'}</span>
            <span className={`text-lg font-bold ${datos.flujo.saldo >= 0 ? 'text-blue-700' : 'text-amber-800'}`}>{fmt(datos.flujo.saldo)}</span>
          </div>
          <p className="mt-2 text-[11px] leading-4 text-gray-400">
            Las compras se cuentan el mes en que se recibieron: Pixit no registra cuándo le pagaste al proveedor. Si pagas a 30 días, no va a calzar exacto con tu banco.
          </p>
        </Tarjeta>

        <Tarjeta titulo="Caja" ayuda="Cierres de caja del mes y ventas anuladas.">
          <div className="grid grid-cols-3 gap-2">
            <Dato etiqueta="Cierres de caja" valor={String(datos.caja.cerradas)} />
            <Dato etiqueta={`Faltantes (${datos.caja.faltantes.cantidad})`} valor={fmt(datos.caja.faltantes.monto)} alerta={datos.caja.faltantes.monto > 0} />
            <Dato etiqueta={`Sobrantes (${datos.caja.sobrantes.cantidad})`} valor={fmt(datos.caja.sobrantes.monto)} />
          </div>
          {datos.caja.diferencias.length > 0 && <div className="mt-3">
            <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Cierres con diferencia</p>
            {datos.caja.diferencias.slice(0, 6).map(d => <div key={d.id} className="flex items-center justify-between border-b border-gray-50 py-1.5 text-xs">
              <span className="text-gray-600">{d.fecha.split('-').reverse().slice(0, 2).join('/')} · {nombreBodega(d.branchId)} · {d.responsable || 'Sin responsable'}</span>
              <span className={`font-semibold ${d.diferencia < 0 ? 'text-red-600' : 'text-gray-700'}`}>{d.diferencia > 0 ? '+' : ''}{fmt(d.diferencia)}</span>
            </div>)}
          </div>}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
            <span className="text-gray-600">Ventas anuladas ({datos.caja.anuladas.cantidad})</span>
            <span className="font-semibold text-gray-800">{fmt(datos.caja.anuladas.monto)}</span>
          </div>
        </Tarjeta>

        <Tarjeta titulo="IVA estimado" ayuda="Borrador para tu contador. El monto final lo confirma él en el F29.">
          <Linea etiqueta="IVA de tus ventas (débito)" ayuda={`${datos.iva.ventasConDocumento} ventas con boleta o factura`} monto={datos.iva.debito} />
          <Linea etiqueta="IVA de gastos con factura" monto={-datos.iva.credito.gastos} />
          <Linea etiqueta="IVA de compras con factura" monto={-datos.iva.credito.compras} />
          <div className={`mt-3 flex items-center justify-between rounded-xl px-4 py-3 ${datos.iva.aPagar >= 0 ? 'bg-gray-50' : 'bg-blue-50'}`}>
            <span className="text-sm font-semibold text-gray-700">{datos.iva.aPagar >= 0 ? 'IVA a pagar' : 'Remanente a favor'}</span>
            <span className="text-lg font-bold text-gray-900">{fmt(Math.abs(datos.iva.aPagar))}</span>
          </div>
          {datos.iva.ventasSinDocumento.cantidad > 0 && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800">
            {datos.iva.ventasSinDocumento.cantidad} ventas "Sin doc." por {fmt(datos.iva.ventasSinDocumento.total)} no están en este cálculo. Para el SII igual pagan IVA: revísalas con tu contador.
          </p>}
          {datos.compras.sinFactura.length > 0 && <p className="mt-2 text-[11px] leading-4 text-gray-400">
            {datos.compras.sinFactura.length} compras recibidas no tienen folio de factura, así que su IVA no se cuenta. Agrégalo en Compras si tienes la factura.
          </p>}
        </Tarjeta>
      </div>
    </>}
  </div>
}

function BarraCierre({ mes, foto, guardado }: { mes: string; foto: FotoCierre; guardado: CierreGuardado | null }) {
  const cerrar = useCerrarMes()
  const reabrir = useReabrirMes()
  const [error, setError] = useState('')
  const ocupado = cerrar.isPending || reabrir.isPending

  async function alCerrar() {
    const aviso = foto.pendientes
      ? `Quedan ${foto.pendientes} puntos pendientes en la revisión. Si cierras igual, los números pueden no estar completos.\n\n`
      : ''
    if (!window.confirm(`${aviso}¿Cerrar ${nombreMes(mes)}? Desde ahora solo tú (el dueño) podrás crear, editar o anular ventas y gastos de ese mes.`)) return
    setError('')
    try { await cerrar.mutateAsync({ mes, resumen: foto }) } catch (e) { setError((e as Error).message) }
  }
  async function alReabrir() {
    if (!window.confirm(`¿Reabrir ${nombreMes(mes)}? Tu equipo volverá a poder editar ventas y gastos de ese mes.`)) return
    setError('')
    try { await reabrir.mutateAsync(mes) } catch (e) { setError((e as Error).message) }
  }

  if (!guardado) {
    return <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 shadow-sm">
      <div>
        <p className="text-sm font-bold text-gray-900">{nombreMes(mes)} está abierto</p>
        <p className="text-xs text-gray-500">Al cerrarlo se guarda una foto de los números y tu equipo ya no puede cambiar ventas ni gastos de ese mes.</p>
      </div>
      <button type="button" onClick={alCerrar} disabled={ocupado}
        className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
        {cerrar.isPending ? 'Cerrando…' : 'Cerrar mes'}
      </button>
      {error && <p className="w-full text-xs text-red-600">{error}</p>}
    </section>
  }

  const cambios = cambiosDesdeCierre(guardado.resumen ?? {}, foto)
  return <section className={`rounded-2xl border px-4 py-3 shadow-sm ${cambios.length ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50'}`}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <p className="text-sm font-bold text-gray-900">🔒 {nombreMes(mes)} está cerrado</p>
        <p className="text-xs text-gray-600">
          Lo cerró {guardado.cerrado_por_nombre || 'el dueño'} el {new Date(guardado.cerrado_en).toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}.
          {' '}Solo el dueño puede modificar ventas y gastos de este mes.
        </p>
      </div>
      <div className="flex gap-2">
        {cambios.length > 0 && <button type="button" onClick={() => cerrar.mutateAsync({ mes, resumen: foto }).catch(e => setError((e as Error).message))} disabled={ocupado}
          className="rounded-xl bg-white px-3 py-2 text-xs font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50">Actualizar foto</button>}
        <button type="button" onClick={alReabrir} disabled={ocupado}
          className="rounded-xl px-3 py-2 text-xs font-semibold text-gray-600 hover:bg-white/60 disabled:opacity-50">Reabrir</button>
      </div>
    </div>
    {cambios.length > 0 && <div className="mt-2 border-t border-amber-200 pt-2">
      <p className="text-xs font-semibold text-amber-900">Cambió desde que se cerró:</p>
      {cambios.map(c => <p key={c.etiqueta} className="text-xs text-amber-900">
        {c.etiqueta}: {fmt(c.antes)} → <b>{fmt(c.ahora)}</b> ({c.ahora - c.antes > 0 ? '+' : ''}{fmt(c.ahora - c.antes)})
      </p>)}
    </div>}
    {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
  </section>
}

function Revision({ puntos }: { puntos: ReturnType<typeof revisionCierre> }) {
  const pendientes = puntos.filter(p => p.cantidad == null || p.cantidad > 0)
  const [abierto, setAbierto] = useState<string | null>(null)
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
    <div className="flex items-center justify-between gap-2">
      <div>
        <h3 className="text-sm font-bold text-gray-900">Revisión antes de cerrar</h3>
        <p className="text-xs text-gray-500">{pendientes.length
          ? `${pendientes.length} ${pendientes.length === 1 ? 'punto pendiente' : 'puntos pendientes'}: mientras sigan, los números del mes pueden cambiar.`
          : 'Todo en orden: los números del mes están completos.'}</p>
      </div>
      <span className={`rounded-full px-3 py-1 text-xs font-bold ${pendientes.length ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'}`}>
        {puntos.length - pendientes.length}/{puntos.length}
      </span>
    </div>
    <div className="mt-3 space-y-2">
      {puntos.map(p => {
        const ok = p.cantidad === 0
        const expandido = abierto === p.id
        return <div key={p.id} className={`rounded-xl border ${ok ? 'border-gray-100' : 'border-amber-200 bg-amber-50/50'}`}>
          <button type="button" disabled={ok || p.cantidad == null} onClick={() => setAbierto(expandido ? null : p.id)}
            aria-expanded={expandido}
            className="flex w-full items-start gap-3 px-3 py-2.5 text-left disabled:cursor-default">
            <span aria-hidden="true" className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${ok ? 'bg-blue-100 text-blue-700' : 'bg-amber-200 text-amber-900'}`}>
              {ok ? '✓' : '!'}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-gray-800">{p.titulo}{p.cantidad ? ` (${p.cantidad})` : ''}</span>
              {!ok && <span className="block text-xs leading-5 text-gray-500">{p.cantidad == null ? 'No se pudo revisar.' : p.detalle}</span>}
            </span>
            {!ok && p.cantidad != null && <span className="shrink-0 text-xs font-semibold text-blue-600">{expandido ? 'Ocultar' : 'Ver cuáles'}</span>}
          </button>
          {expandido && <div className="border-t border-amber-200 px-3 pb-3 pt-2">
            <p className="mb-2 text-xs font-medium text-amber-900">{p.comoCorregir}</p>
            <ul className="divide-y divide-amber-100 rounded-lg bg-white">
              {p.items.map(it => <li key={it.clave}>
                <Link to={it.enlace} className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-gray-50">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-gray-800">{it.titulo}</span>
                    {it.detalle && <span className="block truncate text-xs text-gray-500">{it.detalle}</span>}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-blue-600">Corregir →</span>
                </Link>
              </li>)}
            </ul>
          </div>}
        </div>
      })}
    </div>
  </section>
}

function Resultado({ r, previo, nombreBodega }: {
  r: Parameters<typeof cascada>[0]
  previo: Parameters<typeof cascada>[0]
  nombreBodega: (id: string) => string
}) {
  if (!r) return <p className="text-sm text-gray-400">Sin datos de resultado para este mes.</p>
  const c = cascada(r, null)
  const p = previo ? cascada(previo, null) : null
  const variacion = (actual: number, anterior: number | undefined) => {
    if (anterior == null || anterior === 0) return null
    return Math.round(((actual - anterior) / Math.abs(anterior)) * 100)
  }
  const v = variacion(c.resultado, p?.resultado)
  const margenPct = c.ventasNetas ? Math.round((c.margenBruto / c.ventasNetas) * 100) : 0
  return <>
    <Linea etiqueta="Ventas netas" monto={c.ventasNetas} />
    <Linea etiqueta="Costo de lo vendido" monto={-c.costo} />
    <Linea etiqueta={`Margen bruto (${margenPct}%)`} monto={c.margenBruto} fuerte />
    <Linea etiqueta="Gastos de las tiendas" monto={-c.gastosTienda} />
    <Linea etiqueta="Gastos corporativos" ayuda="Repartidos entre tiendas según sus ventas" monto={-c.corporativo} />
    <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
      <span className="text-sm font-semibold text-gray-700">Resultado de la operación</span>
      <span className="text-right">
        <span className={`block text-lg font-bold ${c.resultado >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{fmt(c.resultado)}</span>
        {v != null && <span className="block text-[11px] text-gray-500">{v >= 0 ? '▲' : '▼'} {Math.abs(v)}% vs mes anterior</span>}
      </span>
    </div>
    {c.fueraDeOperacion != null && c.fueraDeOperacion > 0 && <p className="mt-2 text-xs text-gray-500">
      Aparte, fuera de la operación: {fmt(c.fueraDeOperacion)} en créditos, banco e inversiones.
    </p>}
    {r.sucursales.length > 1 && <div className="mt-3">
      <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">Por sucursal</p>
      {r.sucursales.map(s => <div key={s.branch_id} className="flex items-center justify-between border-b border-gray-50 py-1.5 text-xs">
        <span className="text-gray-600">{s.nombre || nombreBodega(s.branch_id)}</span>
        <span className={`font-semibold ${s.resultado_completo >= 0 ? 'text-gray-800' : 'text-red-600'}`}>{fmt(s.resultado_completo)}</span>
      </div>)}
      {/* Sin esta fila, las sucursales no suman el total de arriba. */}
      {r.no_asignado && Math.round(r.no_asignado.resultado) !== 0 && <div className="flex items-center justify-between border-b border-gray-50 py-1.5 text-xs">
        <span className="text-gray-500">Ventas sin sucursal asignada</span>
        <span className={`font-semibold ${r.no_asignado.resultado >= 0 ? 'text-gray-800' : 'text-red-600'}`}>{fmt(r.no_asignado.resultado)}</span>
      </div>}
    </div>}
  </>
}

function Tarjeta({ titulo, ayuda, children }: { titulo: string; ayuda: string; children: React.ReactNode }) {
  return <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
    <h3 className="text-sm font-bold text-gray-900">{titulo}</h3>
    <p className="mb-3 text-xs text-gray-500">{ayuda}</p>
    {children}
  </section>
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return <div className="mb-2">
    <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{titulo}</p>
    {children}
  </div>
}

function Linea({ etiqueta, monto, ayuda, fuerte }: { etiqueta: string; monto: number; ayuda?: string; fuerte?: boolean }) {
  return <div className={`flex items-baseline justify-between gap-3 py-1 text-sm ${fuerte ? 'border-t border-gray-100 font-semibold text-gray-900' : 'text-gray-600'}`}>
    <span className="min-w-0">
      {etiqueta}
      {ayuda && <span className="block text-[11px] font-normal text-gray-400">{ayuda}</span>}
    </span>
    <span className="shrink-0 tabular-nums">{fmt(monto)}</span>
  </div>
}

function Dato({ etiqueta, valor, alerta }: { etiqueta: string; valor: string; alerta?: boolean }) {
  return <div className="rounded-xl bg-gray-50 px-3 py-2">
    <p className="text-[11px] text-gray-500">{etiqueta}</p>
    <p className={`text-sm font-bold ${alerta ? 'text-red-600' : 'text-gray-900'}`}>{valor}</p>
  </div>
}
