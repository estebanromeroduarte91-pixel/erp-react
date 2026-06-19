interface MoneyProps {
  value: number | string | undefined | null
  moneda?: string
  className?: string
}

/** Formatea un número como moneda. Ej: 14990 → "$14.990" */
export function Money({ value, moneda = '$', className }: MoneyProps) {
  const n = Number(value) || 0
  const fmt = n.toLocaleString('es-CL')
  return (
    <span className={className}>
      {moneda}{fmt}
    </span>
  )
}
