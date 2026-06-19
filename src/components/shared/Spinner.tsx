export function Spinner({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-spin rounded-full border-2 border-gray-200 border-t-blue-600 ${className}`}
      style={{ width: 20, height: 20 }}
    />
  )
}
