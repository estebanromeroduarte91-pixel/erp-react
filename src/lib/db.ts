import { supabase } from './supabase'

// ─────────────────────────────────────────────────────────────
// Capa de acceso a la tabla `erp_data` (almacén llave-valor por empresa).
// Es la MISMA tabla que usa el ERP actual, así que comparte los datos.
// ─────────────────────────────────────────────────────────────

/** Lee el valor guardado bajo una clave para una empresa. */
export async function dbGet<T>(empresaId: string, clave: string): Promise<T | null> {
  const { data, error } = await supabase
    .from('erp_data')
    .select('datos')
    .eq('empresa_id', empresaId)
    .eq('clave', clave)
    .maybeSingle()
  if (error) {
    console.error(`dbGet(${clave}):`, error.message)
    return null
  }
  return (data?.datos as T) ?? null
}

/** Guarda (crea o reemplaza) el valor de una clave para una empresa. */
export async function dbSet(empresaId: string, clave: string, datos: unknown): Promise<void> {
  const { error } = await supabase.from('erp_data').upsert(
    [{ empresa_id: empresaId, clave, datos, actualizado_en: new Date().toISOString() }],
    { onConflict: 'empresa_id,clave' },
  )
  if (error) console.error(`dbSet(${clave}):`, error.message)
}
