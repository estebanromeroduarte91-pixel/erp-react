export function accesoComisiones({ rol, esAdmin, esPlatformAdmin, branchId }: {
  rol: string
  esAdmin: boolean
  esPlatformAdmin: boolean
  branchId?: string | null
}) {
  const puedeGestionar = esAdmin || esPlatformAdmin || rol === 'admin'
  return {
    puedeGestionar,
    puedeVerEquipo: puedeGestionar || rol === 'encargado',
    sucursal: !puedeGestionar && rol === 'encargado' ? branchId || null : null,
    requiereSucursal: !puedeGestionar && rol === 'encargado' && !branchId,
  }
}

export function comisionVisible(
  orden: { tecnicoId?: string; branchId?: string },
  acceso: ReturnType<typeof accesoComisiones>,
  usuarioId?: string,
): boolean {
  if (acceso.requiereSucursal) return false
  if (acceso.puedeGestionar) return true
  if (acceso.puedeVerEquipo) return orden.branchId === acceso.sucursal
  return !!usuarioId && orden.tecnicoId === usuarioId
}
