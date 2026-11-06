import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import type { DteCierre, PedidoOnlineCierre, VentaCierre } from '@/lib/cierre'

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
        .select('estado,ambiente,creado_en')
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
        .select('total,estado_gestion')
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
 * Cuántas filas de stock hay bajo cero. producto_stock no tiene empresa_id,
 * así que se filtra por la del producto: un platform admin impersonando ve
 * por RLS el stock de todas las empresas. null = no se pudo revisar.
 */
export function useStockNegativo() {
  const { empresaId } = useAuth()
  return useQuery({
    queryKey: ['cierre-stock-negativo', empresaId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('producto_stock')
        .select('producto_id, productos!inner(empresa_id)', { count: 'exact', head: true })
        .eq('productos.empresa_id', empresaId!)
        .lt('cantidad', 0)
      if (error) return null
      return count ?? 0
    },
    enabled: !!empresaId,
  })
}
