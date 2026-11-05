import { useEffect, useRef } from 'react'
import type { PublicConfig } from '../rtypes.ts'

export function ModelPicker({
  config,
  anchor,
  onPick,
  onClose
}: {
  config: PublicConfig
  anchor: DOMRect
  onPick: (providerId: string, model: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const onEsc = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onDoc)
    window.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      window.removeEventListener('keydown', onEsc)
    }
  }, [onClose])

  const style: React.CSSProperties = {
    top: Math.min(anchor.bottom + 6, window.innerHeight - 400),
    left: Math.min(anchor.left, window.innerWidth - 316)
  }

  return (
    <div className="picker" ref={ref} style={style}>
      {config.presets.map((p) => (
        <button
          key={p.id}
          className={`picker-item${p.id === config.providerId ? ' active' : ''}`}
          onClick={() => onPick(p.id, p.models[0] ?? '')}
          title={p.note}
        >
          <span
            className={`dot ${p.id === 'mock' ? 'mock' : p.needsKey && !p.hasKey ? 'nokey' : ''}`}
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: p.id === 'mock' ? 'var(--accent2)' : p.needsKey && !p.hasKey ? 'var(--warn)' : 'var(--ok)'
            }}
          />
          <span className="grow">{p.label}</span>
          <span className="kind">{p.kind}</span>
        </button>
      ))}
    </div>
  )
}
