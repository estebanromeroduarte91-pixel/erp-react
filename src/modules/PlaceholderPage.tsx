interface Props {
  titulo: string
  descripcion?: string
}

export function PlaceholderPage({ titulo, descripcion }: Props) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-center">
      <div className="text-4xl mb-3">🚧</div>
      <h2 className="text-xl font-bold text-gray-700">{titulo}</h2>
      <p className="text-sm text-gray-400 mt-1">{descripcion ?? 'Próximamente en la migración'}</p>
    </div>
  )
}
