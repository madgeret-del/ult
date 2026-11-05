function classify(line: string): string {
  if (line === '…') return 'meta'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  if (/^\(?\d* ?more lines/.test(line)) return 'meta'
  return 'ctx'
}

export function DiffView({ preview }: { preview: string }) {
  const lines = preview.split('\n')
  return (
    <div className="diff">
      {lines.map((l, i) => (
        <div key={i} className={`line ${classify(l)}`}>
          {l || ' '}
        </div>
      ))}
    </div>
  )
}
