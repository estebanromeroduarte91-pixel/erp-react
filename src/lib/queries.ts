import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { supabase } from './supabase'
import { dbGet, dbSet } from './db'
import { reconciliarLotes } from './lotes'
import { useAuth } from '@/context/AuthContext'
import type { Orden, Cliente, Producto, Bodega, Movimiento, Proveedor, Venta, VentaItem, MetodoPago, Caja, CajaSesion, Gasto, GastoCat, CuentaContable, Asiento, SeguimientoConfig, SmtpConfig, MsgTemplates, Cargo, UserProfile, UserConfig, PendingInvite, EmailDomain, OC, OCLogEntry, Categoria, Kit, Traslado, TecnicoExterno, Equipo, FichaUsuario, LoteInventario, ConteoInventario } from '@/types'

// ── Órdenes de Taller ─────────────────────────────────────────
// Tabla relacional `ordenes` (migrada desde el blob erp_data/tp_orders).
// Repuestos/checklists/fotos quedan como columnas JSONB en la misma fila —a
// diferencia de Ventas, nada en el código de hoy agrega esos datos entre
// órdenes distintas, así que una tabla hija sería sobre-ingeniería.

const ORDEN_FIELD_MAP: Record<string, string> = {
  num: 'num', fecha: 'fecha', status: 'status', nombre: 'nombre', apellido: 'apellido', tel: 'tel', email: 'email', rut: 'rut',
  modelo: 'modelo', serie: 'serie', color: 'color', pin: 'pin', pinType: 'pin_type',
  estadoFisico: 'estado_fisico', trabajo: 'trabajo', tecnico: 'tecnico', presup: 'presup', costo: 'costo', fechaEstimada: 'fecha_estimada',
  repuestos: 'repuestos', checkIngreso: 'check_ingreso', photosIngreso: 'photos_ingreso', branchId: 'branch_id', subestado: 'subestado',
  _draft: 'is_draft', inspeccion: 'inspeccion', photosSalida: 'photos_salida', checkSalida: 'check_salida', observSalida: 'observ_salida',
  obs: 'obs', photosTraslado: 'photos_traslado', aprobacion_estado: 'aprobacion_estado', aprobacion_token: 'aprobacion_token',
  aprobacion_enviado: 'aprobacion_enviado', aprobacion_fecha: 'aprobacion_fecha', deliveredAt: 'delivered_at', updatedAt: 'updated_at',
  createdAt: 'created_at', venta_id: 'venta_id', numero_boleta: 'numero_boleta',
}

function hidratarOrden(row: Record<string, unknown>): Orden {
  return {
    id: row.id as string,
    num: row.num as string,
    fecha: row.fecha as string,
    status: row.status as Orden['status'],
    nombre: (row.nombre as string) ?? '',
    apellido: row.apellido as string | undefined,
    tel: row.tel as string | undefined,
    email: row.email as string | undefined,
    rut: row.rut as string | undefined,
    modelo: row.modelo as string | undefined,
    serie: row.serie as string | undefined,
    color: row.color as string | undefined,
    pin: row.pin as string | undefined,
    pinType: row.pin_type as Orden['pinType'],
    estadoFisico: row.estado_fisico as string | undefined,
    trabajo: row.trabajo as string | undefined,
    tecnico: row.tecnico as string | undefined,
    presup: row.presup as string | undefined,
    costo: row.costo as string | undefined,
    fechaEstimada: row.fecha_estimada as string | undefined,
    repuestos: (row.repuestos as Orden['repuestos']) ?? [],
    checkIngreso: (row.check_ingreso as Orden['checkIngreso']) ?? [],
    photosIngreso: (row.photos_ingreso as string[]) ?? [],
    branchId: row.branch_id as string | undefined,
    subestado: row.subestado as string | undefined,
    _draft: (row.is_draft as boolean) ?? false,
    inspeccion: row.inspeccion as Orden['inspeccion'],
    photosSalida: (row.photos_salida as string[]) ?? [],
    checkSalida: (row.check_salida as Orden['checkSalida']) ?? [],
    observSalida: row.observ_salida as string | undefined,
    obs: row.obs as string | undefined,
    photosTraslado: (row.photos_traslado as string[]) ?? [],
    aprobacion_estado: row.aprobacion_estado as Orden['aprobacion_estado'],
    aprobacion_token: row.aprobacion_token as string | undefined,
    aprobacion_enviado: row.aprobacion_enviado as string | undefined,
    aprobacion_fecha: row.aprobacion_fecha as string | undefined,
    deliveredAt: row.delivered_at as string | undefined,
    updatedAt: row.updated_at as string | undefined,
    createdAt: row.created_at as string | undefined,
    venta_id: row.venta_id as string | undefined,
    numero_boleta: row.numero_boleta as string | undefined,
  }
}

// Convierte los campos presentes de una Orden parcial a columnas snake_case.
// Solo incluye claves que vengan en `o` (para updates parciales sin pisar el resto).
// Un valor `undefined` explícito se convierte a `null` — si no, Postgres simplemente
// no incluiría esa columna en el UPDATE y el valor viejo quedaría sin limpiar.
function filaOrdenParcial(o: Partial<Orden>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [k, col] of Object.entries(ORDEN_FIELD_MAP)) {
    if (k in o) {
      const v = (o as Record<string, unknown>)[k]
      row[col] = v === undefined ? null : v
    }
  }
  if ('presup' in o) row.presup = o.presup != null ? String(o.presup) : null
  if ('costo' in o) row.costo = o.costo != null ? String(o.costo) : null
  return row
}

export function useOrdenes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const instanceId = useId()

  // Realtime: inyecta el cambio directo en la caché en vez de invalidar y
  // volver a descargar la tabla completa (cara con miles de órdenes, y se
  // dispara para TODOS los usuarios conectados por cada INSERT/UPDATE/DELETE
  // de cualquiera). El nombre del canal incluye un id único por instancia del
  // hook para que dos componentes que usen useOrdenes a la vez (ej. lista +
  // modal de detalle) no choquen suscribiéndose al mismo canal de Supabase.
  useEffect(() => {
    if (!empresaId) return
    const channel = supabase
      .channel(`rt-ordenes-${empresaId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ordenes', filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string }).id
            if (!oldId) return
            qc.setQueryData<Orden[]>(['ordenes', empresaId], (old = []) => old.filter((o) => o.id !== oldId))
            return
          }
          const row = payload.new as Record<string, unknown>
          // Los borradores del QR no viven en esta lista: si llega uno, o si una
          // orden pasó a ser borrador, asegurarse de sacarla de la caché.
          if (row.is_draft) {
            qc.setQueryData<Orden[]>(['ordenes', empresaId], (old = []) => old.filter((o) => o.id !== row.id))
            return
          }
          const orden = hidratarOrden(row)
          qc.setQueryData<Orden[]>(['ordenes', empresaId], (old = []) => {
            const idx = old.findIndex((o) => o.id === orden.id)
            if (idx >= 0) {
              const copy = [...old]
              copy[idx] = orden
              return copy
            }
            return [orden, ...old]
          })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [empresaId, qc, instanceId])

  return useQuery({
    queryKey: ['ordenes', empresaId],
    queryFn: async () => {
      const PAGE = 1000
      const filas: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('ordenes')
          .select('*')
          .eq('empresa_id', empresaId!)
          .eq('is_draft', false)
          .range(from, from + PAGE - 1)
        if (error) throw error
        filas.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return filas.map(hidratarOrden)
    },
    enabled: !!empresaId,
  })
}

// Crea UNA orden nueva (insert de una fila). Reemplaza el patrón anterior de
// reescribir el array `tp_orders` completo en cada creación.
export function useCrearOrden() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (o: Orden) => {
      const row = { id: o.id, empresa_id: empresaId!, ...filaOrdenParcial(o) }
      const { error } = await supabase.from('ordenes').insert(row).select()
      if (error) throw error
    },
    // Update optimista: la orden aparece al instante en la lista sin esperar el
    // refetch paginado (que recorre miles de filas). Los borradores del QR no van
    // a la lista, así que no se agregan a la caché.
    onMutate: async (o: Orden) => {
      if (o._draft) return { prev: undefined }
      await qc.cancelQueries({ queryKey: ['ordenes', empresaId] })
      const prev = qc.getQueryData<Orden[]>(['ordenes', empresaId])
      qc.setQueryData<Orden[]>(['ordenes', empresaId], (old = []) => [o, ...old])
      return { prev }
    },
    // Sin onSettled: el insert real dispara el evento Realtime (arriba), que ya
    // actualiza la caché con la fila confirmada del servidor. Invalidar aquí
    // además volvería a descargar toda la tabla por cada orden creada.
    onError: (_e, _o, ctx) => { if (ctx?.prev) qc.setQueryData(['ordenes', empresaId], ctx.prev) },
  })
}

// Actualiza una orden existente (update de una fila, solo los campos que cambian).
export function useActualizarOrden() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (o: Partial<Orden> & { id: string }) => {
      const { id, ...rest } = o
      const { error } = await supabase.from('ordenes').update(filaOrdenParcial(rest)).eq('id', id).eq('empresa_id', empresaId!).select()
      if (error) throw error
    },
    // Update optimista: refleja el cambio al instante. Si la orden no está en la
    // caché pero deja de ser borrador (se finalizó desde el QR), se agrega.
    onMutate: async (o: Partial<Orden> & { id: string }) => {
      await qc.cancelQueries({ queryKey: ['ordenes', empresaId] })
      const prev = qc.getQueryData<Orden[]>(['ordenes', empresaId])
      qc.setQueryData<Orden[]>(['ordenes', empresaId], (old = []) => {
        const idx = old.findIndex((x) => x.id === o.id)
        if (idx >= 0) {
          const copy = [...old]
          copy[idx] = { ...copy[idx], ...o }
          return copy
        }
        if (o._draft === false) return [{ ...(o as Orden) }, ...old]
        return old
      })
      return { prev }
    },
    // Sin invalidate: el update real dispara el evento Realtime (arriba), que
    // ya reconcilia la caché con la fila confirmada del servidor.
    onError: (_e, _o, ctx) => { if (ctx?.prev) qc.setQueryData(['ordenes', empresaId], ctx.prev) },
  })
}

export function useEliminarOrden() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ordenes').delete().eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['ordenes', empresaId] })
      const prev = qc.getQueryData<Orden[]>(['ordenes', empresaId])
      qc.setQueryData<Orden[]>(['ordenes', empresaId], (old = []) => old.filter((o) => o.id !== id))
      return { prev }
    },
    onError: (_e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(['ordenes', empresaId], ctx.prev) },
    // Sin invalidate en éxito: el DELETE real dispara el evento Realtime
    // (arriba), que ya confirma/mantiene la fila fuera de la caché.
  })
}

// Importación masiva (historial) — upsert por lotes, igual patrón que useImportarProductos.
export function useImportarOrdenes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ordenes: Orden[]) => {
      const rows = ordenes.map(o => ({ id: o.id, empresa_id: empresaId!, ...filaOrdenParcial(o) }))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from('ordenes').upsert(rows.slice(i, i + 200), { onConflict: 'id' })
        if (error) throw error
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ordenes', empresaId] }),
  })
}

// ── Checklist de ingreso (ítems configurables) ───────────────

const DEFAULT_CHECKS = [
  'Pantalla (táctil y visual)', 'Cámara trasera', 'Cámara frontal',
  'Face ID / Touch ID', 'Conector de carga', 'Altavoz',
  'Auricular (llamadas)', 'Micrófono', 'Botones (volumen, encendido)', 'WiFi / Bluetooth',
]

export function useChecklist() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_cl_ingreso', empresaId],
    queryFn: () => dbGet<string[] | string>(empresaId!, 'tp_cl_ingreso'),
    enabled: !!empresaId,
    select: (data) => {
      if (!data) return DEFAULT_CHECKS
      if (typeof data === 'string') {
        try { return JSON.parse(data) as string[] } catch { return DEFAULT_CHECKS }
      }
      return (data as string[]).length ? (data as string[]) : DEFAULT_CHECKS
    },
  })
}

// ── Productos (tabla relacional `productos` + `producto_stock`) ───────────────
// El catálogo vive en Postgres, no en el blob JSON de `erp_data`. `stock_sucursales`
// se rehidrata desde `producto_stock` para que los consumidores mantengan la misma forma.
// Todas las claves de caché cuelgan de ['productos', empresaId] para que una sola
// invalidación cubra tanto la lista como las búsquedas.
const PRODUCTO_COLS = 'id,nombre,sku,unidad,precio_compra,precio_venta,stock_min,categoria,subcategoria,enlace,descripcion,tipo, producto_stock(bodega_id,cantidad)'

function hidratarProducto(row: Record<string, unknown>): Producto {
  const stock_sucursales: Record<string, number> = {}
  const stockRows = (row.producto_stock as { bodega_id: string; cantidad: number }[] | undefined) ?? []
  for (const s of stockRows) stock_sucursales[s.bodega_id] = s.cantidad
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se destructura solo para omitirlo de `rest`
  const { producto_stock: _omit, ...rest } = row
  return { ...(rest as unknown as Producto), stock_sucursales }
}

function filaProducto(p: Producto, empresaId: string) {
  return {
    id: p.id,
    empresa_id: empresaId,
    nombre: p.nombre,
    sku: p.sku ?? null,
    unidad: p.unidad ?? null,
    precio_compra: p.precio_compra ?? 0,
    precio_venta: p.precio_venta ?? 0,
    stock_min: p.stock_min ?? 0,
    categoria: p.categoria ?? null,
    subcategoria: p.subcategoria ?? null,
    enlace: p.enlace ?? null,
    descripcion: p.descripcion ?? null,
    tipo: p.tipo === 'servicio' ? 'servicio' : 'producto',
  }
}

function filasStock(prods: Producto[]) {
  const rows: { producto_id: string; bodega_id: string; cantidad: number }[] = []
  for (const p of prods) {
    for (const [bodega_id, cantidad] of Object.entries(p.stock_sucursales ?? {})) {
      rows.push({ producto_id: p.id, bodega_id, cantidad: Number(cantidad) || 0 })
    }
  }
  return rows
}

export function useProductos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['productos', empresaId],
    queryFn: async () => {
      // PostgREST devuelve máximo 1000 filas por página — hay que paginar
      // explícitamente con .range() para traer catálogos más grandes que eso.
      const PAGE = 1000
      const filas: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('productos')
          .select(PRODUCTO_COLS)
          .eq('empresa_id', empresaId!)
          .range(from, from + PAGE - 1)
        if (error) throw error
        filas.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return filas.map(hidratarProducto)
    },
    enabled: !!empresaId,
  })
}

// Búsqueda del lado del servidor por nombre o SKU (ilike + índice pg_trgm), limitada.
// Reemplaza el patrón `productos.filter(...).slice(0, N)` que corría en el navegador.
export function useBuscarProductos(query: string) {
  const { empresaId } = useAuth()
  const safe = query.replace(/[%,()]/g, ' ').trim()
  return useQuery({
    queryKey: ['productos', empresaId, 'buscar', safe],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('productos')
        .select(PRODUCTO_COLS)
        .eq('empresa_id', empresaId!)
        .or(`nombre.ilike.%${safe}%,sku.ilike.%${safe}%`)
        .limit(20)
      if (error) throw error
      return (data ?? []).map(hidratarProducto)
    },
    enabled: !!empresaId && safe.length > 0,
  })
}

// Crear o editar UN producto. El stock por sucursal se fija en valor absoluto
// (el admin lo está definiendo explícitamente en el formulario).
export function useGuardarProducto() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (p: Producto) => {
      const { error } = await supabase.from('productos').upsert(filaProducto(p, empresaId!), { onConflict: 'id' })
      if (error) throw error
      const rows = filasStock([p])
      if (rows.length) {
        const { error: e2 } = await supabase.from('producto_stock').upsert(rows, { onConflict: 'producto_id,bodega_id' })
        if (e2) throw e2
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['productos', empresaId] }),
  })
}

export function useEliminarProducto() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('productos').delete().eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['productos', empresaId] }),
  })
}

export function useEliminarTodosProductos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('productos').delete().eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['productos', empresaId] }),
  })
}

// Importación masiva (Excel). 'reemplazar' borra el catálogo antes de insertar.
export function useImportarProductos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ productos, modo }: { productos: Producto[]; modo: 'reemplazar' | 'agregar' }) => {
      if (modo === 'reemplazar') {
        const { error } = await supabase.from('productos').delete().eq('empresa_id', empresaId!)
        if (error) throw error
      }
      const rows = productos.map(p => filaProducto(p, empresaId!))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from('productos').upsert(rows.slice(i, i + 200), { onConflict: 'id' })
        if (error) throw error
      }
      const stock = filasStock(productos)
      for (let i = 0; i < stock.length; i += 200) {
        const { error } = await supabase.from('producto_stock').upsert(stock.slice(i, i + 200), { onConflict: 'producto_id,bodega_id' })
        if (error) throw error
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['productos', empresaId] }),
  })
}

// Fija el stock de una sucursal a un valor ABSOLUTO (corrección manual: "acá hay 5").
// Distinto de useAjustarStock, que suma/resta un delta.
// Además reconcilia los lotes FIFO para que las capas de costo no se separen del stock
// (si baja, consume los más antiguos; si sube, crea una capa con el costo actual).
// No genera asiento contable: la diferencia no afecta la utilidad.
export function useFijarStock() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ producto_id, bodega_id, cantidad }: { producto_id: string; bodega_id: string; cantidad: number }) => {
      const cant = Math.max(0, Math.round(cantidad))
      const { error } = await supabase
        .from('producto_stock')
        .upsert({ producto_id, bodega_id, cantidad: cant }, { onConflict: 'producto_id,bodega_id' })
      if (error) throw error

      const productos = qc.getQueryData<Producto[]>(['productos', empresaId]) ?? []
      const costo = productos.find(p => p.id === producto_id)?.precio_compra ?? 0
      const lotes = (qc.getQueryData<LoteInventario[]>(['lotes_inventario', empresaId]) ?? [])
      const reconciliados = reconciliarLotes(lotes, producto_id, bodega_id, cant, costo)
      if (reconciliados !== lotes) {
        await dbSet(empresaId!, 'lotes_inventario', reconciliados)
        qc.setQueryData(['lotes_inventario', empresaId], reconciliados)
      }
    },
    onSuccess: (_data, v) => {
      const cant = Math.max(0, Math.round(v.cantidad))
      qc.setQueryData(['productos', empresaId], (old: Producto[] | undefined) =>
        (old ?? []).map(p => p.id === v.producto_id
          ? { ...p, stock_sucursales: { ...(p.stock_sucursales ?? {}), [v.bodega_id]: cant } }
          : p),
      )
    },
  })
}

// Ajuste de stock por delta (venta = negativo, recepción = positivo).
// Va por la función `fn_ajustar_stock` de Postgres: es atómica, así que dos
// ventas simultáneas del mismo producto no se pisan (no se pierde ningún descuento).
export type AjusteStock = { producto_id: string; bodega_id: string; delta: number }

export function useAjustarStock() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (ajustes: AjusteStock[]) => {
      const validos = ajustes.filter(a => a.producto_id && a.bodega_id && a.delta !== 0)
      if (!validos.length) return
      const { error } = await supabase.rpc('fn_ajustar_stock', { ajustes: validos })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['productos', empresaId] }),
  })
}

// ── Tomas de inventario (conteo físico) ───────────────────────

export function useConteos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['conteos_inventario', empresaId],
    queryFn: () => dbGet<ConteoInventario[] | string>(empresaId!, 'conteos_inventario'),
    enabled: !!empresaId,
    select: (data) => {
      if (typeof data === 'string') {
        try { return JSON.parse(data) as ConteoInventario[] } catch { return [] }
      }
      return (data as ConteoInventario[]) ?? []
    },
  })
}

export function useGuardarConteos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (conteos: ConteoInventario[]) => dbSet(empresaId!, 'conteos_inventario', conteos),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['conteos_inventario', empresaId] }),
  })
}

// ── Lotes de inventario (costeo FIFO) ─────────────────────────

// Tabla relacional `lotes_inventario` (migrada desde el blob erp_data/lotes_inventario).
// A diferencia de ventas/órdenes, una sola acción de negocio (vender, recibir una OC)
// puede tocar VARIOS lotes a la vez (consumo FIFO de capas de costo) — por eso acá los
// hooks reciben arrays, pero siguen siendo escrituras acotadas a los lotes involucrados,
// nunca una reescritura de los ~1400 lotes de la empresa.
const LOTE_COLS = [
  'producto_id', 'bodega_id', 'cantidad_inicial', 'cantidad_restante', 'costo_unitario',
  'origen', 'oc_id', 'oc_item_id', 'fecha', 'creado_en',
] as const

function hidratarLote(row: Record<string, unknown>): LoteInventario {
  return {
    id: row.id as string,
    producto_id: row.producto_id as string,
    bodega_id: row.bodega_id as string,
    cantidad_inicial: Number(row.cantidad_inicial ?? 0),
    cantidad_restante: Number(row.cantidad_restante ?? 0),
    costo_unitario: Number(row.costo_unitario ?? 0),
    origen: (row.origen as LoteInventario['origen']) ?? 'apertura',
    oc_id: row.oc_id as string | undefined,
    oc_item_id: row.oc_item_id as string | undefined,
    fecha: (row.fecha as string) ?? '',
    creado_en: (row.creado_en as string) ?? '',
  }
}

function filaLoteParcial(l: Partial<LoteInventario>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const k of LOTE_COLS) {
    if (k in l) {
      const v = (l as Record<string, unknown>)[k]
      row[k] = v === undefined ? null : v
    }
  }
  return row
}

export function useLotes() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['lotes_inventario', empresaId],
    queryFn: async () => {
      const PAGE = 1000
      const filas: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('lotes_inventario')
          .select('*')
          .eq('empresa_id', empresaId!)
          .range(from, from + PAGE - 1)
        if (error) throw error
        filas.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return filas.map(hidratarLote)
    },
    enabled: !!empresaId,
  })
}

// Crea uno o varios lotes nuevos (recepción de OC, apertura de stock). Batch de 200.
export function useCrearLotes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (nuevos: LoteInventario[]) => {
      const rows = nuevos.map(l => ({ id: l.id, empresa_id: empresaId!, ...filaLoteParcial(l) }))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from('lotes_inventario').insert(rows.slice(i, i + 200))
        if (error) throw error
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['lotes_inventario', empresaId] }),
  })
}

// Actualiza solo `cantidad_restante` de los lotes consumidos por FIFO en una venta.
// Upsert acotado a las filas que realmente cambiaron (nunca el array completo).
export function useActualizarLotes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cambios: { id: string; cantidad_restante: number }[]) => {
      if (!cambios.length) return
      const rows = cambios.map(c => ({ id: c.id, empresa_id: empresaId!, cantidad_restante: c.cantidad_restante }))
      const { error } = await supabase.from('lotes_inventario').upsert(rows, { onConflict: 'id' })
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['lotes_inventario', empresaId] }),
  })
}

// ── Bodegas ───────────────────────────────────────────────────

export function useBodegas() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['bodegas', empresaId],
    queryFn: () => dbGet<Bodega[] | string>(empresaId!, 'bodegas'),
    enabled: !!empresaId,
    select: (data) => {
      if (typeof data === 'string') { try { return JSON.parse(data) as Bodega[] } catch { return [] } }
      return (data as Bodega[]) ?? []
    },
  })
}

export function useGuardarBodegas() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (bodegas: Bodega[]) => dbSet(empresaId!, 'bodegas', bodegas),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['bodegas', empresaId] }),
  })
}

// ── Movimientos de inventario ─────────────────────────────────

export function useMovimientos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['mov_inventario', empresaId],
    queryFn: () => dbGet<Movimiento[] | string>(empresaId!, 'mov_inventario'),
    enabled: !!empresaId,
    select: (data) => {
      if (typeof data === 'string') { try { return JSON.parse(data) as Movimiento[] } catch { return [] } }
      return (data as Movimiento[]) ?? []
    },
  })
}

export function useGuardarMovimientos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (movs: Movimiento[]) => dbSet(empresaId!, 'mov_inventario', movs),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['mov_inventario', empresaId] }),
  })
}

// ── Clientes ──────────────────────────────────────────────────

function parseArr<T>(data: T[] | string | null): T[] {
  if (!data) return []
  if (typeof data === 'string') { try { return JSON.parse(data) } catch { return [] } }
  return data as T[]
}

// Tabla relacional `clientes` (migrada desde el blob erp_data/clientes).
const CLIENTE_COLS = ['nombre', 'apellido', 'rut', 'email', 'tel', 'direccion', 'fecha_creacion'] as const

function hidratarCliente(row: Record<string, unknown>): Cliente {
  return {
    id: row.id as string,
    nombre: (row.nombre as string) ?? '',
    apellido: row.apellido as string | undefined,
    rut: row.rut as string | undefined,
    email: row.email as string | undefined,
    tel: row.tel as string | undefined,
    direccion: row.direccion as string | undefined,
    fecha_creacion: row.fecha_creacion as string | undefined,
  }
}

function filaClienteParcial(c: Partial<Cliente>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const k of CLIENTE_COLS) {
    if (k in c) {
      const v = (c as Record<string, unknown>)[k]
      row[k] = v === undefined ? null : v
    }
  }
  return row
}

export function useClientes() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['clientes', empresaId],
    queryFn: async () => {
      const PAGE = 1000
      const filas: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('clientes')
          .select('*')
          .eq('empresa_id', empresaId!)
          .range(from, from + PAGE - 1)
        if (error) throw error
        filas.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return filas.map(hidratarCliente)
    },
    enabled: !!empresaId,
  })
}

export function useCrearCliente() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: Cliente) => {
      const row = { id: c.id, empresa_id: empresaId!, ...filaClienteParcial(c) }
      const { error } = await supabase.from('clientes').insert(row)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clientes', empresaId] }),
  })
}

export function useActualizarCliente() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (c: Partial<Cliente> & { id: string }) => {
      const { id, ...rest } = c
      const { error } = await supabase.from('clientes').update(filaClienteParcial(rest)).eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clientes', empresaId] }),
  })
}

export function useEliminarCliente() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clientes').delete().eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clientes', empresaId] }),
  })
}

// Importación masiva (historial gestioo) — upsert por lotes, igual patrón que useImportarOrdenes.
export function useImportarClientes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (clientes: Cliente[]) => {
      const rows = clientes.map(c => ({ id: c.id, empresa_id: empresaId!, ...filaClienteParcial(c) }))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await supabase.from('clientes').upsert(rows.slice(i, i + 200), { onConflict: 'id' })
        if (error) throw error
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['clientes', empresaId] }),
  })
}

// ── Proveedores ───────────────────────────────────────────────

export function useProveedores() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['proveedores', empresaId],
    queryFn: () => dbGet<Proveedor[] | string>(empresaId!, 'proveedores'),
    enabled: !!empresaId,
    select: (data) => parseArr<Proveedor>(data as Proveedor[] | string | null),
  })
}

export function useGuardarProveedores() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (provs: Proveedor[]) => dbSet(empresaId!, 'proveedores', provs),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['proveedores', empresaId] }),
  })
}

// ── Ventas ────────────────────────────────────────────────────

const METODOS_PAGO_DEFAULT: MetodoPago[] = [
  { id: 'efectivo', icon: 'cash', label: 'Efectivo', desc: 'Billetes y monedas' },
  { id: 'tarjeta',  icon: 'card', label: 'Tarjeta',  desc: 'Débito / Crédito' },
  { id: 'transfer', icon: 'bank', label: 'Transferencia', desc: 'Banco / Wallet' },
]

export function useMetodosPago() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['metodos_pago', empresaId],
    queryFn: () => dbGet<MetodoPago[] | string>(empresaId!, 'metodos_pago'),
    enabled: !!empresaId,
    select: (data) => {
      const arr = parseArr<MetodoPago>(data as MetodoPago[] | string | null)
      return arr.length ? arr : METODOS_PAGO_DEFAULT
    },
  })
}

// Ventas: tabla relacional `ventas` + `venta_items` (migradas desde el blob erp_data).
// Mismo patrón que Productos: id TEXT (preserva los ids generados por uid()), paginación
// server-side con .range(), y una fila por venta en vez de reescribir un array completo.
const VENTA_COLS = 'id,numero,fecha,estado,cliente,metodo_pago,branch_id,branch_nombre,bodega_id,caja_id,ot_id,ot_num,tipo_doc,total,total_iva,fecha_creacion,venta_items(id,producto_id,producto_nombre,cantidad,precio_neto,precio_iva,descuento,subtotal,costo_unitario,costo_total)'

function hidratarVenta(row: Record<string, unknown>): Venta {
  const items = (row.venta_items as VentaItem[] | undefined) ?? []
  return {
    id: row.id as string,
    numero: row.numero as string,
    fecha: row.fecha as string,
    estado: row.estado as Venta['estado'],
    cliente: (row.cliente as string) ?? '',
    metodo_pago: (row.metodo_pago as string) ?? '',
    branchId: (row.branch_id as string) ?? '',
    branchNombre: (row.branch_nombre as string) ?? '',
    bodega_id: (row.bodega_id as string) ?? '',
    cajaId: (row.caja_id as string) ?? '',
    otId: (row.ot_id as string | null) ?? null,
    otNum: (row.ot_num as string | null) ?? null,
    tipo_doc: row.tipo_doc as Venta['tipo_doc'],
    total: Number(row.total) || 0,
    total_iva: Number(row.total_iva) || 0,
    fecha_creacion: row.fecha_creacion as string,
    items,
  }
}

function filaVenta(v: Venta, empresaId: string) {
  return {
    id: v.id,
    empresa_id: empresaId,
    numero: v.numero,
    fecha: v.fecha,
    estado: v.estado,
    cliente: v.cliente,
    metodo_pago: v.metodo_pago,
    branch_id: v.branchId,
    branch_nombre: v.branchNombre,
    bodega_id: v.bodega_id,
    caja_id: v.cajaId,
    ot_id: v.otId,
    ot_num: v.otNum,
    tipo_doc: v.tipo_doc ?? null,
    total: v.total,
    total_iva: v.total_iva,
    fecha_creacion: v.fecha_creacion,
  }
}

function filasVentaItems(v: Venta, empresaId: string) {
  return v.items.map(i => ({
    id: i.id,
    venta_id: v.id,
    empresa_id: empresaId,
    producto_id: i.producto_id,
    producto_nombre: i.producto_nombre,
    cantidad: i.cantidad,
    precio_neto: i.precio_neto,
    precio_iva: i.precio_iva,
    descuento: i.descuento,
    subtotal: i.subtotal,
    costo_unitario: i.costo_unitario ?? null,
    costo_total: i.costo_total ?? null,
  }))
}

export function useVentas() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const instanceId = useId()

  // Realtime: los eventos de postgres_changes solo traen la fila de `ventas`,
  // sin el join a `venta_items` — a diferencia de Órdenes, no alcanza con
  // hidratar el payload directo. En vez de invalidar y redescargar toda la
  // tabla (con su join) por cada venta de cualquier usuario, se busca solo
  // esa fila puntual (con join) y se inyecta en la caché.
  useEffect(() => {
    if (!empresaId) return
    const channel = supabase
      .channel(`rt-ventas-${empresaId}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'ventas', filter: `empresa_id=eq.${empresaId}` },
        (payload) => {
          if (payload.eventType === 'DELETE') {
            const oldId = (payload.old as { id?: string }).id
            if (!oldId) return
            qc.setQueryData<Venta[]>(['ventas', empresaId], (old = []) => old.filter((v) => v.id !== oldId))
            return
          }
          const id = (payload.new as { id: string }).id
          void supabase
            .from('ventas')
            .select(VENTA_COLS)
            .eq('id', id)
            .single()
            .then(({ data, error }) => {
              if (error || !data) return
              const venta = hidratarVenta(data)
              qc.setQueryData<Venta[]>(['ventas', empresaId], (old = []) => {
                const idx = old.findIndex((v) => v.id === venta.id)
                if (idx >= 0) {
                  const copy = [...old]
                  copy[idx] = venta
                  return copy
                }
                return [venta, ...old]
              })
            })
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [empresaId, qc, instanceId])

  return useQuery({
    queryKey: ['ventas', empresaId],
    queryFn: async () => {
      const PAGE = 1000
      const filas: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('ventas')
          .select(VENTA_COLS)
          .eq('empresa_id', empresaId!)
          .range(from, from + PAGE - 1)
        if (error) throw error
        filas.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return filas.map(hidratarVenta)
    },
    enabled: !!empresaId,
  })
}

// Crea UNA venta nueva: un insert a `ventas` + sus líneas a `venta_items`.
// Reemplaza el patrón anterior de reescribir el array completo en cada venta.
export function useGuardarVenta() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: Venta) => {
      const { error } = await supabase.from('ventas').insert(filaVenta(v, empresaId!))
      if (error) throw error
      const items = filasVentaItems(v, empresaId!)
      if (items.length) {
        const { error: e2 } = await supabase.from('venta_items').insert(items)
        if (e2) throw e2
      }
    },
    // Update optimista: la venta aparece al instante sin esperar el refetch
    // paginado. El eco de Realtime (arriba) reconcilia con el servidor después.
    onMutate: async (v: Venta) => {
      await qc.cancelQueries({ queryKey: ['ventas', empresaId] })
      const prev = qc.getQueryData<Venta[]>(['ventas', empresaId])
      qc.setQueryData<Venta[]>(['ventas', empresaId], (old = []) => [v, ...old])
      return { prev }
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) qc.setQueryData(['ventas', empresaId], ctx.prev) },
  })
}

// Anula una venta existente (solo cambia el estado — igual que el comportamiento
// anterior, no reversa stock ni lotes FIFO).
export function useAnularVenta() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').update({ estado: 'anulada' }).eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: ['ventas', empresaId] })
      const prev = qc.getQueryData<Venta[]>(['ventas', empresaId])
      qc.setQueryData<Venta[]>(['ventas', empresaId], (old = []) =>
        old.map((v) => (v.id === id ? { ...v, estado: 'anulada' } : v)))
      return { prev }
    },
    onError: (_e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(['ventas', empresaId], ctx.prev) },
  })
}

export function useCajas() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cajas_perifericas', empresaId],
    queryFn: () => dbGet<Caja[] | string>(empresaId!, 'cajas_perifericas'),
    enabled: !!empresaId,
    select: (data) => parseArr<Caja>(data as Caja[] | string | null),
  })
}

export function useCajaSesiones() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['caja_sesiones', empresaId],
    queryFn: () => dbGet<CajaSesion[] | string>(empresaId!, 'caja_sesiones'),
    enabled: !!empresaId,
    select: (data) => parseArr<CajaSesion>(data as CajaSesion[] | string | null),
  })
}

export function useGuardarCajaSesiones() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (sesiones: CajaSesion[]) => dbSet(empresaId!, 'caja_sesiones', sesiones),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['caja_sesiones', empresaId] }),
  })
}

export function useGuardarCajas() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cajas: Caja[]) => dbSet(empresaId!, 'cajas_perifericas', cajas),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cajas_perifericas', empresaId] }),
  })
}

export function useGuardarMetodosPago() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (metodos: MetodoPago[]) => dbSet(empresaId!, 'metodos_pago', metodos),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['metodos_pago', empresaId] }),
  })
}

export function useNextVentaNum() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cfg', empresaId],
    queryFn: () => dbGet<Record<string, unknown>>(empresaId!, 'cfg'),
    enabled: !!empresaId,
    select: (data) => {
      const cfg = (data ?? {}) as Record<string, unknown>
      return (cfg.ventaCounter as number | undefined) ?? 0
    },
  })
}

export function useIncrementarContadorVenta() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const cfg = (await dbGet<Record<string, unknown>>(empresaId!, 'cfg')) ?? {}
      const next = ((cfg.ventaCounter as number | undefined) ?? 0) + 1
      await dbSet(empresaId!, 'cfg', { ...cfg, ventaCounter: next })
      return next
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cfg', empresaId] }),
  })
}

// ── Gastos ────────────────────────────────────────────────────

const DEFAULT_GASTO_CATS: GastoCat[] = [
  { id: 'cat-1',  nombre: 'Servicios',     color: '#3b82f6', icono: 'zap' },
  { id: 'cat-2',  nombre: 'RRHH',          color: '#8b5cf6', icono: 'user' },
  { id: 'cat-3',  nombre: 'Arriendo',      color: '#f59e0b', icono: 'home' },
  { id: 'cat-4',  nombre: 'Limpieza',      color: '#10b981', icono: 'sparkle' },
  { id: 'cat-5',  nombre: 'Logística',     color: '#f97316', icono: 'truck' },
  { id: 'cat-6',  nombre: 'Alimentación',  color: '#ec4899', icono: 'utensils' },
  { id: 'cat-7',  nombre: 'Mantenimiento', color: '#6b7280', icono: 'wrench' },
  { id: 'cat-8',  nombre: 'Materiales',    color: '#14b8a6', icono: 'box' },
  { id: 'cat-9',  nombre: 'Administrativo',color: '#64748b', icono: 'folder' },
  { id: 'cat-10', nombre: 'Otros',         color: '#94a3b8', icono: 'grid' },
  { id: 'cat-11', nombre: 'Servicios Tercerizados', color: '#0ea5e9', icono: 'wrench' },
]

// ── Gastos ────────────────────────────────────────────────────
// Tabla relacional `gastos` (migrada desde el blob erp_data/gastos).
// El asiento contable de cada gasto se sigue manejando aparte (blob asientos),
// vinculado por id determinístico (asientoIdDeGasto), sin cambios acá.
function hidratarGasto(row: Record<string, unknown>): Gasto {
  return {
    id: row.id as string,
    fecha: row.fecha as string,
    descripcion: (row.descripcion as string) ?? '',
    monto: Number(row.monto ?? 0),
    categoria: (row.categoria as string) ?? '',
    subcategoria: row.subcategoria as string | undefined,
    metodo: row.metodo as string | undefined,
    bodega_id: row.bodega_id as string | undefined,
    bodega_nombre: row.bodega_nombre as string | undefined,
  }
}

const GASTO_FIELD_MAP: Record<string, string> = {
  fecha: 'fecha', descripcion: 'descripcion', monto: 'monto', categoria: 'categoria',
  subcategoria: 'subcategoria', metodo: 'metodo', bodega_id: 'bodega_id', bodega_nombre: 'bodega_nombre',
}

function filaGastoParcial(g: Partial<Gasto>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const [k, col] of Object.entries(GASTO_FIELD_MAP)) {
    if (k in g) {
      const v = (g as Record<string, unknown>)[k]
      row[col] = v === undefined ? null : v
    }
  }
  return row
}

export function useGastos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['gastos', empresaId],
    queryFn: async () => {
      const PAGE = 1000
      const filas: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('gastos')
          .select('*')
          .eq('empresa_id', empresaId!)
          .order('fecha', { ascending: false })
          .range(from, from + PAGE - 1)
        if (error) throw error
        filas.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return filas.map(hidratarGasto)
    },
    enabled: !!empresaId,
  })
}

// Crea UN gasto (insert de una fila). Reemplaza el reescribir todo el array.
export function useCrearGasto() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (g: Gasto) => {
      const row = { id: g.id, empresa_id: empresaId!, ...filaGastoParcial(g) }
      const { error } = await supabase.from('gastos').insert(row)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gastos', empresaId] }),
  })
}

// Actualiza un gasto existente (solo los campos que cambian).
export function useActualizarGasto() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (g: Partial<Gasto> & { id: string }) => {
      const { id, ...rest } = g
      const { error } = await supabase.from('gastos').update(filaGastoParcial(rest)).eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gastos', empresaId] }),
  })
}

export function useEliminarGasto() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos').delete().eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gastos', empresaId] }),
  })
}

export function useGastoCats() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['gasto_cats', empresaId],
    queryFn: () => dbGet<GastoCat[] | string>(empresaId!, 'gasto_cats'),
    enabled: !!empresaId,
    select: (data) => {
      const arr = parseArr<GastoCat>(data as GastoCat[] | string | null)
      return arr.length ? arr : DEFAULT_GASTO_CATS
    },
  })
}

export function useGuardarGastoCats() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cats: GastoCat[]) => dbSet(empresaId!, 'gasto_cats', cats),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['gasto_cats', empresaId] }),
  })
}

// ── Contabilidad ──────────────────────────────────────────────

const DEFAULT_PLAN_CUENTAS: CuentaContable[] = [
  { id: 'pc-110', codigo: '110', nombre: 'Caja',                          tipo: 'activo',     grupo: 'Activo Circulante' },
  { id: 'pc-120', codigo: '120', nombre: 'Banco',                         tipo: 'activo',     grupo: 'Activo Circulante' },
  { id: 'pc-130', codigo: '130', nombre: 'Cuentas por Cobrar',            tipo: 'activo',     grupo: 'Activo Circulante' },
  { id: 'pc-140', codigo: '140', nombre: 'Inventario / Mercaderías',      tipo: 'activo',     grupo: 'Activo Circulante' },
  { id: 'pc-150', codigo: '150', nombre: 'IVA Crédito Fiscal',            tipo: 'activo',     grupo: 'Activo Circulante' },
  { id: 'pc-190', codigo: '190', nombre: 'Otros Activos',                 tipo: 'activo',     grupo: 'Activo Circulante' },
  { id: 'pc-210', codigo: '210', nombre: 'Cuentas por Pagar (Proveedores)',tipo: 'pasivo',    grupo: 'Pasivo Circulante' },
  { id: 'pc-220', codigo: '220', nombre: 'IVA Débito Fiscal',             tipo: 'pasivo',     grupo: 'Pasivo Circulante' },
  { id: 'pc-230', codigo: '230', nombre: 'Remuneraciones por Pagar',      tipo: 'pasivo',     grupo: 'Pasivo Circulante' },
  { id: 'pc-290', codigo: '290', nombre: 'Otros Pasivos',                 tipo: 'pasivo',     grupo: 'Pasivo Circulante' },
  { id: 'pc-310', codigo: '310', nombre: 'Capital',                       tipo: 'patrimonio', grupo: 'Patrimonio' },
  { id: 'pc-320', codigo: '320', nombre: 'Utilidades Retenidas',          tipo: 'patrimonio', grupo: 'Patrimonio' },
  { id: 'pc-330', codigo: '330', nombre: 'Resultado del Ejercicio',       tipo: 'patrimonio', grupo: 'Patrimonio' },
  { id: 'pc-410', codigo: '410', nombre: 'Ventas',                        tipo: 'ingreso',    grupo: 'Ingresos' },
  { id: 'pc-490', codigo: '490', nombre: 'Otros Ingresos',                tipo: 'ingreso',    grupo: 'Ingresos' },
  { id: 'pc-510', codigo: '510', nombre: 'Servicios Básicos',             tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-520', codigo: '520', nombre: 'Remuneraciones',                tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-530', codigo: '530', nombre: 'Arriendo',                      tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-540', codigo: '540', nombre: 'Artículos de Limpieza',         tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-550', codigo: '550', nombre: 'Transporte y Logística',        tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-560', codigo: '560', nombre: 'Alimentación',                  tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-570', codigo: '570', nombre: 'Mantenimiento',                 tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-575', codigo: '575', nombre: 'Servicios Tercerizados',        tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-580', codigo: '580', nombre: 'Materiales y Suministros',      tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-590', codigo: '590', nombre: 'Gastos Administrativos',        tipo: 'gasto',      grupo: 'Gastos Operacionales' },
  { id: 'pc-595', codigo: '595', nombre: 'Otros Gastos',                  tipo: 'gasto',      grupo: 'Gastos Operacionales' },
]

export { DEFAULT_PLAN_CUENTAS }

export function usePlanCuentas() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['plan_cuentas', empresaId],
    queryFn: () => dbGet<CuentaContable[] | string>(empresaId!, 'plan_cuentas'),
    enabled: !!empresaId,
    select: (data) => {
      const arr = parseArr<CuentaContable>(data as CuentaContable[] | string | null)
      return arr.length ? arr : DEFAULT_PLAN_CUENTAS
    },
  })
}

export function useGuardarPlanCuentas() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cuentas: CuentaContable[]) => dbSet(empresaId!, 'plan_cuentas', cuentas),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['plan_cuentas', empresaId] }),
  })
}

export function useAsientos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['asientos', empresaId],
    queryFn: () => dbGet<Asiento[] | string>(empresaId!, 'asientos'),
    enabled: !!empresaId,
    select: (data) => parseArr<Asiento>(data as Asiento[] | string | null),
  })
}

export function useGuardarAsientos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (asientos: Asiento[]) => dbSet(empresaId!, 'asientos', asientos),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['asientos', empresaId] }),
  })
}

export function useCatCuentaMap() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cat_cuenta', empresaId],
    queryFn: () => dbGet<Record<string, string>>(empresaId!, 'cat_cuenta'),
    enabled: !!empresaId,
    select: (data) => {
      const DEFAULT: Record<string, string> = {
        'Servicios': 'pc-510', 'RRHH': 'pc-520', 'Arriendo': 'pc-530',
        'Limpieza': 'pc-540', 'Logística': 'pc-550', 'Alimentación': 'pc-560',
        'Mantenimiento': 'pc-570', 'Servicios Tercerizados': 'pc-575',
        'Materiales': 'pc-580', 'Administrativo': 'pc-590', 'Otros': 'pc-595',
      }
      return { ...DEFAULT, ...((data as Record<string, string> | null) ?? {}) }
    },
  })
}

export function useGuardarCatCuentaMap() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (map: Record<string, string>) => dbSet(empresaId!, 'cat_cuenta', map),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cat_cuenta', empresaId] }),
  })
}

// ── Configuración ─────────────────────────────────────────────

export function useSeguimientoConfig() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_seg_config', empresaId],
    queryFn: () => dbGet<SeguimientoConfig | string>(empresaId!, 'tp_seg_config'),
    enabled: !!empresaId,
    select: (data): SeguimientoConfig => {
      if (!data) return {}
      if (typeof data === 'string') { try { return JSON.parse(data) } catch { return {} } }
      return data as SeguimientoConfig
    },
  })
}

export function useGuardarSeguimientoConfig() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cfg: SeguimientoConfig) => dbSet(empresaId!, 'tp_seg_config', cfg),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_seg_config', empresaId] }),
  })
}

export function useSmtpConfig() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_smtp_config', empresaId],
    queryFn: () => dbGet<SmtpConfig>(empresaId!, 'tp_smtp_config'),
    enabled: !!empresaId,
    select: (data) => (data ?? {}) as SmtpConfig,
  })
}

export function useGuardarSmtpConfig() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cfg: SmtpConfig) => dbSet(empresaId!, 'tp_smtp_config', cfg),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_smtp_config', empresaId] }),
  })
}

export function useMsgTemplates() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_msg_templates', empresaId],
    queryFn: () => dbGet<MsgTemplates>(empresaId!, 'tp_msg_templates'),
    enabled: !!empresaId,
    select: (data) => (data ?? {}) as MsgTemplates,
  })
}

export function useGuardarMsgTemplates() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tpls: MsgTemplates) => dbSet(empresaId!, 'tp_msg_templates', tpls),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_msg_templates', empresaId] }),
  })
}

export function useTerminos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_terminos', empresaId],
    queryFn: () => dbGet<string>(empresaId!, 'tp_terminos'),
    enabled: !!empresaId,
    select: (data) => (typeof data === 'string' ? data : '') as string,
  })
}

export function useGuardarTerminos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (texto: string) => dbSet(empresaId!, 'tp_terminos', texto),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_terminos', empresaId] }),
  })
}

export function useChecklistSalida() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_cl_salida', empresaId],
    queryFn: () => dbGet<string[] | string>(empresaId!, 'tp_cl_salida'),
    enabled: !!empresaId,
    select: (data) => parseArr<string>(data as string[] | string | null),
  })
}

export function useGuardarChecklistIngreso() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: string[]) => dbSet(empresaId!, 'tp_cl_ingreso', items),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_cl_ingreso', empresaId] }),
  })
}

export function useGuardarChecklistSalida() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (items: string[]) => dbSet(empresaId!, 'tp_cl_salida', items),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_cl_salida', empresaId] }),
  })
}

// ── Cargos ────────────────────────────────────────────────────

export const CARGOS_DEFAULT: Cargo[] = [
  { id: 'tecnico',   nombre: 'Técnico',   sistema: true, rol: 'tecnico',   permisos: { dashboard: false, ventas: false, taller: true,  clientes: true,  inventario: false, compras: false, estadisticas: false, configuracion: false } },
  { id: 'vendedor',  nombre: 'Vendedor',  sistema: true, rol: 'vendedor',  permisos: { dashboard: false, ventas: true,  taller: false, clientes: true,  inventario: false, compras: false, estadisticas: false, configuracion: false } },
  { id: 'encargado', nombre: 'Encargado', sistema: true, rol: 'encargado', permisos: { dashboard: true,  ventas: true,  taller: true,  clientes: true,  inventario: true,  compras: true,  estadisticas: true,  configuracion: true  } },
]

const ROLE_MAP: Record<string, string> = { tecnico: 'tecnico', vendedor: 'vendedor', encargado: 'encargado' }

function resolveRol(cargoId: string | undefined, cargos: Cargo[]): string {
  if (!cargoId) return 'tecnico'
  if (ROLE_MAP[cargoId]) return ROLE_MAP[cargoId]
  const cargo = cargos.find(c => c.id === cargoId)
  return cargo?.rol ?? 'tecnico'
}

export function useCargos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cargos', empresaId],
    queryFn: () => dbGet<Cargo[]>(empresaId!, 'cargos'),
    enabled: !!empresaId,
    select: (data) => {
      const arr = parseArr<Cargo>(data as Cargo[] | string | null)
      return arr.length ? arr : [...CARGOS_DEFAULT]
    },
  })
}

export function useGuardarCargos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cargos: Cargo[]) => dbSet(empresaId!, 'cargos', cargos),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cargos', empresaId] }),
  })
}

// ── Dominio de email (Resend) ─────────────────────────────────

export function useEmailDomain() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_email_domain', empresaId],
    queryFn: () => dbGet<EmailDomain>(empresaId!, 'tp_email_domain'),
    enabled: !!empresaId,
    select: (data) => (data ?? {}) as EmailDomain,
  })
}

export function useGuardarEmailDomain() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (domain: EmailDomain | null) => dbSet(empresaId!, 'tp_email_domain', domain),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_email_domain', empresaId] }),
  })
}

// ── Kits de Equipos ───────────────────────────────────────────

export function useKits() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['kits', empresaId],
    queryFn: () => dbGet<Kit[] | string>(empresaId!, 'kits'),
    enabled: !!empresaId,
    select: (data) => parseArr<Kit>(data as Kit[] | string | null),
  })
}

export function useGuardarKits() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (kits: Kit[]) => dbSet(empresaId!, 'kits', kits),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kits', empresaId] }),
  })
}

// ── Categorías de productos ───────────────────────────────────

export function useCategorias() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cats_db', empresaId],
    queryFn: () => dbGet<Categoria[] | string>(empresaId!, 'cats_db'),
    enabled: !!empresaId,
    select: (data) => parseArr<Categoria>(data as Categoria[] | string | null),
  })
}

export function useGuardarCategorias() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cats: Categoria[]) => dbSet(empresaId!, 'cats_db', cats),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cats_db', empresaId] }),
  })
}

// ── Compras / Órdenes de Compra ───────────────────────────────

// ── Órdenes de Compra (OCs) ───────────────────────────────────
// Tabla relacional `ocs` (migrada desde el blob erp_data/ocs). items/recepciones
// quedan como columnas JSONB (no se agregan entre OCs en ningún reporte). El log
// de OCs eliminadas (oc_log) y los asientos siguen como blob, sin cambios.
const OC_COLS = [
  'numero', 'estado', 'proveedor_id', 'proveedor_nombre', 'fecha', 'fecha_entrega',
  'bodega_id', 'bodega_nombre', 'notas', 'items', 'total', 'recepciones',
  'folio_factura', 'metodo_pago', 'fecha_recepcion', 'fecha_primera_recepcion',
  'fecha_confirmacion', 'fecha_creacion',
] as const

function hidratarOC(row: Record<string, unknown>): OC {
  return {
    id: row.id as string,
    numero: (row.numero as string) ?? '',
    estado: (row.estado as OC['estado']) ?? 'borrador',
    proveedor_id: (row.proveedor_id as string) ?? '',
    proveedor_nombre: (row.proveedor_nombre as string) ?? '',
    fecha: (row.fecha as string) ?? '',
    fecha_entrega: row.fecha_entrega as string | undefined,
    bodega_id: row.bodega_id as string | undefined,
    bodega_nombre: row.bodega_nombre as string | undefined,
    notas: row.notas as string | undefined,
    items: (row.items as OC['items']) ?? [],
    total: Number(row.total ?? 0),
    fecha_creacion: (row.fecha_creacion as string) ?? '',
    recepciones: (row.recepciones as OC['recepciones']) ?? [],
    folio_factura: row.folio_factura as string | undefined,
    metodo_pago: row.metodo_pago as string | undefined,
    fecha_recepcion: row.fecha_recepcion as string | undefined,
    fecha_primera_recepcion: row.fecha_primera_recepcion as string | undefined,
    fecha_confirmacion: row.fecha_confirmacion as string | undefined,
  }
}

function filaOCParcial(o: Partial<OC>): Record<string, unknown> {
  const row: Record<string, unknown> = {}
  for (const k of OC_COLS) {
    if (k in o) {
      const v = (o as Record<string, unknown>)[k]
      row[k] = v === undefined ? null : v
    }
  }
  return row
}

export function useOCs() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['ocs', empresaId],
    queryFn: async () => {
      const PAGE = 1000
      const filas: Record<string, unknown>[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('ocs')
          .select('*')
          .eq('empresa_id', empresaId!)
          .range(from, from + PAGE - 1)
        if (error) throw error
        filas.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return filas.map(hidratarOC)
    },
    enabled: !!empresaId,
  })
}

// Crea UNA orden de compra (insert de una fila).
export function useCrearOC() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (o: OC) => {
      const row = { id: o.id, empresa_id: empresaId!, ...filaOCParcial(o) }
      const { error } = await supabase.from('ocs').insert(row)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ocs', empresaId] }),
  })
}

// Actualiza una OC existente (solo los campos que cambian).
export function useActualizarOC() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (o: Partial<OC> & { id: string }) => {
      const { id, ...rest } = o
      const { error } = await supabase.from('ocs').update(filaOCParcial(rest)).eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ocs', empresaId] }),
  })
}

export function useEliminarOC() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ocs').delete().eq('id', id).eq('empresa_id', empresaId!)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ocs', empresaId] }),
  })
}

export function useOCLog() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['oc_log', empresaId],
    queryFn: () => dbGet<OCLogEntry[] | string>(empresaId!, 'oc_log'),
    enabled: !!empresaId,
    select: (data) => parseArr<OCLogEntry>(data as OCLogEntry[] | string | null),
  })
}

export function useGuardarOCLog() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (log: OCLogEntry[]) => dbSet(empresaId!, 'oc_log', log),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['oc_log', empresaId] }),
  })
}

export function useIncrementarContadorOC() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const cfg = (await dbGet<Record<string, unknown>>(empresaId!, 'cfg')) ?? {}
      const next = ((cfg.ocCounter as number | undefined) ?? 0) + 1
      await dbSet(empresaId!, 'cfg', { ...cfg, ocCounter: next })
      return next
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['cfg', empresaId] }),
  })
}

// ── Usuarios del sistema (user_profiles) ─────────────────────

export function useUserProfiles() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['user_profiles', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id,nombre,role,activo')
        .eq('empresa_id', empresaId!)
      if (error) throw error
      return (data ?? []) as UserProfile[]
    },
    enabled: !!empresaId,
  })
}

export function useToggleUsuarioActivo() {
  const qc = useQueryClient()
  const { empresaId } = useAuth()
  return useMutation({
    mutationFn: async ({ userId, activo }: { userId: string; activo: boolean }) => {
      const { error } = await supabase.from('user_profiles').update({ activo }).eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['user_profiles', empresaId] }),
  })
}

export function useActualizarNombreUsuario() {
  const qc = useQueryClient()
  const { empresaId } = useAuth()
  return useMutation({
    mutationFn: async ({ userId, nombre }: { userId: string; nombre: string }) => {
      const { error } = await supabase.from('user_profiles').update({ nombre }).eq('id', userId)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['user_profiles', empresaId] }),
  })
}

export function useFichaUsuario(userId: string) {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['ficha_usuario', empresaId, userId],
    queryFn: () => dbGet<FichaUsuario>(empresaId!, `ficha_${userId}`),
    enabled: !!empresaId && !!userId,
    select: data => (data ?? {}) as FichaUsuario,
  })
}

export function useGuardarFichaUsuario() {
  const qc = useQueryClient()
  const { empresaId } = useAuth()
  return useMutation({
    mutationFn: async ({ userId, ficha }: { userId: string; ficha: FichaUsuario }) => {
      await dbSet(empresaId!, `ficha_${userId}`, ficha)
    },
    onSuccess: (_, { userId }) => void qc.invalidateQueries({ queryKey: ['ficha_usuario', empresaId, userId] }),
  })
}

// user_cargo_map en erp_data
export function useUserCargoMap() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['user_cargo_map', empresaId],
    queryFn: () => dbGet<Record<string, UserConfig>>(empresaId!, 'user_cargo_map'),
    enabled: !!empresaId,
    select: (data) => (data ?? {}) as Record<string, UserConfig>,
  })
}

export function useGuardarUserConfig() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ userId, cfg }: { userId: string; cfg: UserConfig }) => {
      // Guardar ucfg_<userId>
      await dbSet(empresaId!, `ucfg_${userId}`, cfg)
      // Actualizar user_cargo_map
      const { data: current } = await supabase
        .from('erp_data')
        .select('datos')
        .eq('empresa_id', empresaId!)
        .eq('clave', 'user_cargo_map')
        .maybeSingle()
      const map = (current?.datos ?? {}) as Record<string, UserConfig>
      map[userId] = cfg
      await dbSet(empresaId!, 'user_cargo_map', map)
      // Actualizar role en user_profiles si corresponde
      const cargosData = await dbGet<Cargo[]>(empresaId!, 'cargos')
      const allCargos = [...CARGOS_DEFAULT, ...parseArr<Cargo>(cargosData as Cargo[] | string | null).filter(c => !c.sistema)]
      if (cfg.cargoId && cfg.cargoId !== '__admin') {
        const newRole = resolveRol(cfg.cargoId, allCargos)
        await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['user_profiles', empresaId] })
      void qc.invalidateQueries({ queryKey: ['user_cargo_map', empresaId] })
    },
  })
}

// ── Invitaciones pendientes ───────────────────────────────────

export function usePendingInvites() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['pending_invites', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pending_invites')
        .select('id,email,nombre,role,token,created_at')
        .eq('empresa_id', empresaId!)
        .eq('used', false)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data ?? []) as PendingInvite[]
    },
    enabled: !!empresaId,
  })
}

export function useCrearInvitacion() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ nombre, email, role, cargoId, branchId }: { nombre: string; email: string; role: string; cargoId: string; branchId: string }) => {
      const token = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
      const { error } = await supabase
        .from('pending_invites')
        .insert({ empresa_id: empresaId!, email, nombre, role, token, used: false })
      if (error) throw error
      // Guardar cfg pendiente para cuando el usuario acepte
      await dbSet(empresaId!, `pending_cargo_${token}`, JSON.stringify({ cargoId, branchId }))
      return token
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pending_invites', empresaId] }),
  })
}

export function useCancelarInvitacion() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('pending_invites').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pending_invites', empresaId] }),
  })
}

// ── Traslados (derivaciones a técnicos externos) ──────────────

export function useTraslados() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['traslados', empresaId],
    queryFn: () => dbGet<Traslado[] | string>(empresaId!, 'traslados'),
    enabled: !!empresaId,
    select: (data) => parseArr<Traslado>(data as Traslado[] | string | null),
  })
}

export function useGuardarTraslados() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (traslados: Traslado[]) => dbSet(empresaId!, 'traslados', traslados),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['traslados', empresaId] }),
  })
}

export function useTecnicosExternos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_tecnicos', empresaId],
    queryFn: () => dbGet<TecnicoExterno[] | string>(empresaId!, 'tp_tecnicos'),
    enabled: !!empresaId,
    select: (data) => parseArr<TecnicoExterno>(data as TecnicoExterno[] | string | null),
  })
}

export function useGuardarTecnicosExternos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (tecnicos: TecnicoExterno[]) => dbSet(empresaId!, 'tp_tecnicos', tecnicos),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_tecnicos', empresaId] }),
  })
}

// ── Catálogo de equipos del taller (tp_equipos) ───────────────

export function useEquipos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_equipos', empresaId],
    queryFn: () => dbGet<Equipo[] | string>(empresaId!, 'tp_equipos'),
    enabled: !!empresaId,
    select: (data) => parseArr<Equipo>(data as Equipo[] | string | null),
  })
}

export function useGuardarEquipos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (equipos: Equipo[]) => dbSet(empresaId!, 'tp_equipos', equipos),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_equipos', empresaId] }),
  })
}

const DEFAULT_CATEGORIAS = ['Teléfono', 'Tablet', 'Notebook', 'Smartwatch', 'PC escritorio', 'Consola', 'Audífonos', 'Otro']
const DEFAULT_MARCAS = ['Apple', 'Samsung', 'Lenovo', 'HP', 'Dell', 'Huawei', 'Xiaomi', 'Sony', 'LG', 'Asus']

export function useCatEquipo() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_cat_equipo', empresaId],
    queryFn: () => dbGet<string[]>(empresaId!, 'tp_cat_equipo'),
    enabled: !!empresaId,
    select: (data) => (Array.isArray(data) && data.length ? data as string[] : DEFAULT_CATEGORIAS),
  })
}

export function useGuardarCatEquipo() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (cats: string[]) => dbSet(empresaId!, 'tp_cat_equipo', cats),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_cat_equipo', empresaId] }),
  })
}

export function useMarcasEquipo() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['tp_marcas_equipo', empresaId],
    queryFn: () => dbGet<string[]>(empresaId!, 'tp_marcas_equipo'),
    enabled: !!empresaId,
    select: (data) => (Array.isArray(data) && data.length ? data as string[] : DEFAULT_MARCAS),
  })
}

export function useGuardarMarcasEquipo() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (marcas: string[]) => dbSet(empresaId!, 'tp_marcas_equipo', marcas),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tp_marcas_equipo', empresaId] }),
  })
}

// ── Panel Pixit Admin (super-admin de la plataforma) ─────────────
// Solo funciona para quien esté en la tabla `platform_admins` — las políticas
// RLS de `empresas`/`user_profiles` le dan acceso cross-tenant explícito.
export interface EmpresaAdmin {
  id: string
  nombre: string
  owner_id: string | null
  plan_estado: string | null
  trial_termina: string | null
  creado_en: string | null
  usuarios: number
}

export function usePlatformEmpresas() {
  const { esPlatformAdmin } = useAuth()
  return useQuery({
    queryKey: ['pixit_admin_empresas'],
    queryFn: async () => {
      const [{ data: empresas, error: e1 }, { data: perfiles, error: e2 }] = await Promise.all([
        supabase.from('empresas').select('id,nombre,owner_id,plan_estado,trial_termina,creado_en').order('creado_en', { ascending: false }),
        supabase.from('user_profiles').select('empresa_id,activo'),
      ])
      if (e1) throw e1
      if (e2) throw e2
      const conteo = new Map<string, number>()
      for (const p of perfiles ?? []) {
        if (!p.activo) continue
        conteo.set(p.empresa_id, (conteo.get(p.empresa_id) ?? 0) + 1)
      }
      return (empresas ?? []).map((e): EmpresaAdmin => ({ ...e, usuarios: conteo.get(e.id) ?? 0 }))
    },
    enabled: esPlatformAdmin,
  })
}

export function useActualizarEmpresaAdmin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (cambio: { id: string; plan_estado?: string; trial_termina?: string | null }) => {
      const { id, ...rest } = cambio
      const { error } = await supabase.from('empresas').update(rest).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pixit_admin_empresas'] }),
  })
}
export * from './queries/usePlanLimits'
