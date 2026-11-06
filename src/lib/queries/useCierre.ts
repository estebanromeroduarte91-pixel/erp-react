import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DteCierre, FotoCierre, PedidoOnlineCierre, StockNegativoCierre, VentaCierre } from '@/lib/cierre'

// Datos del mes que no tienen hook propio en queries.ts. Los demás (gastos,
// OC, cajas, órdenes entregadas, rentabilidad) se reutilizan desde ahí.

export function useVentasCierre(desde: string, hasta: string) {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cierre-ventas', empresaId, desde, hasta],
    queryFn: async () => {
      const PAGE = 1000
      const filas: VentaCierre[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('ventas')
          .select('id,estado,tipo_doc,total,total_iva,metodo_pago,pagos')
          .eq('empresa_id', empresaId!)
          .gte('fecha', desde)
          .lte('fecha', hasta)
          .order('id')
          .range(from, from + PAGE - 1)
        if (error) throw error
        filas.push(...((data ?? []) as VentaCierre[]).map(v => ({
          ...v,
          total: Number(v.total) || 0,
          total_iva: Number(v.total_iva) || 0,
          pagos: Array.isArray(v.pagos) ? v.pagos.map(p => ({ metodo_pago: String(p.metodo_pago ?? ''), monto: Number(p.monto) || 0 })) : undefined,
        })))
        if (!data || data.length < PAGE) break
      }
      return filas
    },
    enabled: !!empresaId && !!desde && !!hasta,
  })
}

export function useDtesCierre(desde: string, hasta: string) {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cierre-dtes', empresaId, desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('dte_documentos')
        .select('estado,ambiente,creado_en,venta_id,folio,tipo_dte,ultimo_error')
        .eq('empresa_id', empresaId!)
        .gte('creado_en', `${desde}T00:00:00`)
        .lte('creado_en', `${hasta}T23:59:59.999`)
      if (error) throw error
      return (data ?? []) as DteCierre[]
    },
    enabled: !!empresaId && !!desde && !!hasta,
  })
}

export function usePedidosOnlineCierre(desde: string, hasta: string) {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cierre-pedidos-online', empresaId, desde, hasta],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ecommerce_pedidos')
        .select('id,numero,cliente_nombre,total,estado_gestion')
        .eq('empresa_id', empresaId!)
        .gte('pagado_en', `${desde}T00:00:00`)
        .lte('pagado_en', `${hasta}T23:59:59.999`)
      // Sin la tabla (empresa sin tienda online) no hay pedidos que contar.
      if (error) return [] as PedidoOnlineCierre[]
      return ((data ?? []) as PedidoOnlineCierre[]).map(p => ({ ...p, total: Number(p.total) || 0 }))
    },
    enabled: !!empresaId && !!desde && !!hasta,
  })
}

/**
 * Stock bajo cero, con el producto y la sucursal. producto_stock no tiene
 * empresa_id, así que se filtra por la del producto: un platform admin
 * impersonando ve por RLS el stock de todas las empresas. null = no se pudo
 * revisar.
 */
export function useStockNegativo() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cierre-stock-negativo', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producto_stock')
        .select('producto_id, bodega_id, cantidad, productos!inner(empresa_id, nombre)')
        .eq('productos.empresa_id', empresaId!)
        .lt('cantidad', 0)
        .order('cantidad')
        .limit(500)
      if (error) return null
      return (data ?? []).map((r): StockNegativoCierre => {
        const prod = (Array.isArray(r.productos) ? r.productos[0] : r.productos) as { nombre?: string } | null
        return { producto_id: r.producto_id, bodega_id: r.bodega_id, cantidad: Number(r.cantidad) || 0, nombre: prod?.nombre || 'Producto sin nombre' }
      })
    },
    enabled: !!empresaId,
  })
}

/**
 * Cierres es solo del dueño de la empresa y de los platform admin de Pixit
 * (fn_puede_cerrar_mes). La misma regla decide en el servidor quién puede
 * editar un mes cerrado; acá solo se usa para mostrar u ocultar la pantalla.
 */
export function usePuedeCerrarMes() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['puede-cerrar-mes', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('fn_puede_cerrar_mes', { p_empresa_id: empresaId })
      // Sin la migración 68 la función no existe: nadie ve Cierres todavía.
      if (error) return false
      return data === true
    },
    enabled: !!empresaId,
    staleTime: 5 * 60_000,
  })
}

export interface CierreGuardado {
  mes: string
  cerrado_por_nombre: string | null
  cerrado_en: string
  resumen: FotoCierre
}

export function useCierreGuardado(mes: string) {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cierre-guardado', empresaId, mes],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cierres_mes')
        .select('mes,cerrado_por_nombre,cerrado_en,resumen')
        .eq('empresa_id', empresaId!)
        .eq('mes', mes)
        .maybeSingle()
      if (error) return null
      return data as CierreGuardado | null
    },
    enabled: !!empresaId && !!mes,
  })
}

export function useCerrarMes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ mes, resumen }: { mes: string; resumen: FotoCierre }) => {
      const { error } = await supabase.rpc('fn_cerrar_mes', { p_mes: mes, p_resumen: resumen, p_empresa_id: empresaId })
      if (error) throw error
    },
    onSettled: (_d, _e, { mes }) => qc.invalidateQueries({ queryKey: ['cierre-guardado', empresaId, mes] }),
  })
}

export function useReabrirMes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (mes: string) => {
      const { error } = await supabase.rpc('fn_reabrir_mes', { p_mes: mes, p_empresa_id: empresaId })
      if (error) throw error
    },
    onSettled: (_d, _e, mes) => qc.invalidateQueries({ queryKey: ['cierre-guardado', empresaId, mes] }),
  })
}

/** Claves "punto|clave" que el dueño marcó como revisadas (migración 69). */
export function useCierreRevisados() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cierre-revisados', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cierre_revisados')
        .select('punto,clave')
        .eq('empresa_id', empresaId!)
      // Sin la migración 69 no hay nada marcado: la revisión sigue igual.
      if (error) return new Set<string>()
      return new Set((data ?? []).map(r => `${r.punto}|${r.clave}`))
    },
    enabled: !!empresaId,
  })
}

export function useMarcarRevisado() {
  const { empresaId, session } = useAuth()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ punto, clave, revisado }: { punto: string; clave: string; revisado: boolean }) => {
      const consulta = revisado
        ? supabase.from('cierre_revisados').insert({ empresa_id: empresaId!, punto, clave, revisado_por: session?.user.id })
        : supabase.from('cierre_revisados').delete().eq('empresa_id', empresaId!).eq('punto', punto).eq('clave', clave)
      const { error } = await consulta
      if (error) throw new Error(/cierre_revisados/.test(error.message)
        ? 'Falta aplicar la migración 69 en Supabase.'
        : error.message)
    },
    onMutate: async ({ punto, clave, revisado }) => {
      qc.setQueryData<Set<string>>(['cierre-revisados', empresaId], prev => {
        const next = new Set(prev)
        if (revisado) next.add(`${punto}|${clave}`)
        else next.delete(`${punto}|${clave}`)
        return next
      })
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['cierre-revisados', empresaId] }),
  })
}
