import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId } from 'react'
import { supabase } from './supabase'
import { dbGet, dbSet } from './db'
import { reconciliarLotes } from './lotes'
import { useAuth } from '@/context/AuthContext'
import type { Orden, Cliente, Producto, Bodega, Movimiento, Proveedor, Venta, MetodoPago, Caja, CajaSesion, Gasto, GastoCat, CuentaContable, Asiento, SeguimientoConfig, SmtpConfig, MsgTemplates, Cargo, UserProfile, UserConfig, PendingInvite, EmailDomain, OC, OCLogEntry, Categoria, Kit, Traslado, TecnicoExterno, Equipo, FichaUsuario, LoteInventario, ConteoInventario } from '@/types'

// ── Órdenes de Taller ─────────────────────────────────────────

export function useOrdenes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const instanceId = useId()

  // Realtime: invalida la query cuando cambia tp_orders en Supabase.
  // El nombre del canal incluye un id único por instancia del hook para que
  // dos componentes que usen useOrdenes a la vez (ej. lista + modal de detalle)
  // no choquen suscribiéndose al mismo canal de Supabase.
  useEffect(() => {
    if (!empresaId) return
    const channel = supabase
      .channel(`rt-orders-${empresaId}-${instanceId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'erp_data',
          filter: `empresa_id=eq.${empresaId}`,
        },
        (payload) => {
          const clave = (payload.new as { clave?: string })?.clave
          if (clave === 'tp_orders') {
            void qc.invalidateQueries({ queryKey: ['tp_orders', empresaId] })
          }
        },
      )
      .subscribe()
    return () => { void supabase.removeChannel(channel) }
  }, [empresaId, qc, instanceId])

  return useQuery({
    queryKey: ['tp_orders', empresaId],
    queryFn: () => dbGet<Orden[] | string>(empresaId!, 'tp_orders'),
    enabled: !!empresaId,
    select: (data) => {
      // El ERP vanilla guarda tp_orders como string JSON; lo parseamos si hace falta
      let arr: Orden[] = []
      if (typeof data === 'string') {
        try { arr = JSON.parse(data) } catch { arr = [] }
      } else {
        arr = (data as Orden[]) ?? []
      }
      return arr.filter((o) => !o._draft)
    },
  })
}

export function useGuardarOrden() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()

  return useMutation({
    mutationFn: async (ordenes: Orden[]) => {
      await dbSet(empresaId!, 'tp_orders', ordenes)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tp_orders', empresaId] })
    },
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
      const { data, error } = await supabase
        .from('productos')
        .select(PRODUCTO_COLS)
        .eq('empresa_id', empresaId!)
      if (error) throw error
      return (data ?? []).map(hidratarProducto)
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

export function useLotes() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['lotes_inventario', empresaId],
    queryFn: () => dbGet<LoteInventario[] | string>(empresaId!, 'lotes_inventario'),
    enabled: !!empresaId,
    select: (data) => {
      if (typeof data === 'string') {
        try { return JSON.parse(data) as LoteInventario[] } catch { return [] }
      }
      return (data as LoteInventario[]) ?? []
    },
  })
}

export function useGuardarLotes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (lotes: LoteInventario[]) => dbSet(empresaId!, 'lotes_inventario', lotes),
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

export function useClientes() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['clientes', empresaId],
    queryFn: () => dbGet<Cliente[] | string>(empresaId!, 'clientes'),
    enabled: !!empresaId,
    select: (data) => parseArr<Cliente>(data as Cliente[] | string | null),
  })
}

export function useGuardarClientes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (clientes: Cliente[]) => dbSet(empresaId!, 'clientes', clientes),
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

export function useVentas() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['ventas', empresaId],
    queryFn: () => dbGet<Venta[] | string>(empresaId!, 'ventas'),
    enabled: !!empresaId,
    select: (data) => parseArr<Venta>(data as Venta[] | string | null),
  })
}

export function useGuardarVentas() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ventas: Venta[]) => dbSet(empresaId!, 'ventas', ventas),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['ventas', empresaId] }),
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

export function useGastos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['gastos', empresaId],
    queryFn: () => dbGet<Gasto[] | string>(empresaId!, 'gastos'),
    enabled: !!empresaId,
    select: (data) => parseArr<Gasto>(data as Gasto[] | string | null),
  })
}

export function useGuardarGastos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (gastos: Gasto[]) => dbSet(empresaId!, 'gastos', gastos),
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

export function useOCs() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['ocs', empresaId],
    queryFn: () => dbGet<OC[] | string>(empresaId!, 'ocs'),
    enabled: !!empresaId,
    select: (data) => parseArr<OC>(data as OC[] | string | null),
  })
}

export function useGuardarOCs() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ocs: OC[]) => dbSet(empresaId!, 'ocs', ocs),
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
