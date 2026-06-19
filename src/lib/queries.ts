import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { supabase } from './supabase'
import { dbGet, dbSet } from './db'
import { useAuth } from '@/context/AuthContext'
import type { Orden, Cliente, Producto, Bodega, Movimiento, Proveedor, Venta, MetodoPago, Caja, CajaSesion, Gasto, GastoCat, CuentaContable, Asiento, SeguimientoConfig, SmtpConfig, MsgTemplates, Cargo, UserProfile, UserConfig, PendingInvite, EmailDomain, OC, OCLogEntry, Categoria, Kit, Traslado, TecnicoExterno, Equipo } from '@/types'

// ── Órdenes de Taller ─────────────────────────────────────────

export function useOrdenes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()

  // Realtime: invalida la query cuando cambia tp_orders en Supabase
  useEffect(() => {
    if (!empresaId) return
    const channel = supabase
      .channel(`rt-orders-${empresaId}`)
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
  }, [empresaId, qc])

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

// ── Productos (para buscador de repuestos) ────────────────────

export function useProductos() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['productos', empresaId],
    queryFn: () => dbGet<Producto[] | string>(empresaId!, 'productos'),
    enabled: !!empresaId,
    select: (data) => {
      if (typeof data === 'string') {
        try { return JSON.parse(data) as Producto[] } catch { return [] }
      }
      return (data as Producto[]) ?? []
    },
  })
}

export function useGuardarProductos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (prods: Producto[]) => dbSet(empresaId!, 'productos', prods),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['productos', empresaId] }),
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
  { id: 'efectivo', icon: '💵', label: 'Efectivo', desc: 'Billetes y monedas' },
  { id: 'tarjeta',  icon: '💳', label: 'Tarjeta',  desc: 'Débito / Crédito' },
  { id: 'transfer', icon: '🏦', label: 'Transferencia', desc: 'Banco / Wallet' },
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
        'Mantenimiento': 'pc-570', 'Materiales': 'pc-580', 'Administrativo': 'pc-590', 'Otros': 'pc-595',
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

const CARGOS_DEFAULT: Cargo[] = [
  { id: 'tecnico',   nombre: 'Técnico',   sistema: true, permisos: { dashboard: false, ventas: false, taller: true,  clientes: true,  inventario: false, compras: false, estadisticas: false, configuracion: false } },
  { id: 'vendedor',  nombre: 'Vendedor',  sistema: true, permisos: { dashboard: false, ventas: true,  taller: false, clientes: true,  inventario: false, compras: false, estadisticas: false, configuracion: false } },
  { id: 'encargado', nombre: 'Encargado', sistema: true, permisos: { dashboard: true,  ventas: true,  taller: true,  clientes: true,  inventario: true,  compras: false, estadisticas: true,  configuracion: false } },
]

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
      const cargos = parseArr<Cargo>(cargosData as Cargo[] | string | null)
      if (cfg.cargoId && cfg.cargoId !== '__admin') {
        const roleMap: Record<string, string> = { tecnico: 'tecnico', vendedor: 'vendedor', encargado: 'encargado' }
        const newRole = roleMap[cfg.cargoId] ?? cargos.find(c => c.id === cfg.cargoId)?.id ?? 'tecnico'
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
