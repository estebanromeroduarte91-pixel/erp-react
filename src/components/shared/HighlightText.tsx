interface HighlightTextProps {
  text: string
  query: string
}

export function HighlightText({ text, query }: HighlightTextProps) {
  const normalizedQuery = query.trim()
  if (!normalizedQuery) return <>{text}</>

  const index = text.toLocaleLowerCase().indexOf(normalizedQuery.toLocaleLowerCase())
  if (index === -1) return <>{text}</>

  return (
    <>
      {text.slice(0, index)}
      <strong style={{ color: '#7c3aed' }}>{text.slice(index, index + normalizedQuery.length)}</strong>
      {text.slice(index + normalizedQuery.length)}
    </>
  )
}
