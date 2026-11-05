import { useEffect, useState } from 'react'
import type { LiveTool, ToolCall } from '../rtypes.ts'
import { DiffView } from './DiffView.tsx'

const GLYPHS: Record<string, string> = {
  read_file: '▤',
  write_file: '✚',
  edit_file: '✎',
  glob: '⌗',
  grep: '⌕',
  run_command: '▶'
}

function argLine(name: string, args: Record<string, unknown>): string {
  const s = (v: unknown, n = 70): string => {
    const t = String(v ?? '')
    return t.length > n ? t.slice(0, n) + '…' : t
  }
  switch (name) {
    case 'read_file':
      return s(args.path)
    case 'write_file':
      return `${s(args.path, 50)} · ${String(args.content ?? '').split('\n').length} lines`
    case 'edit_file':
      return `${s(args.path, 40)} · "${s(args.old_string, 34)}" → "${s(args.new_string, 34)}"`
    case 'glob':
      return s(args.pattern)
    case 'grep':
      return `/${s(args.pattern, 50)}/${args.glob ? ` · ${s(args.glob)}` : ''}`
    case 'run_command':
      return s(args.command, 110)
    default:
      return JSON.stringify(args).slice(0, 110)
  }
}

const STATUS_ICON: Record<LiveTool['status'], string> = {
  running: '',
  ok: '✓',
  err: '✗',
  denied: '⊘'
}

export function ToolCard({ call, live }: { call: ToolCall; live?: LiveTool }) {
  const status = live?.status ?? 'running'
  const [open, setOpen] = useState(false)

  // auto-expand on failure
  useEffect(() => {
    if (status === 'err' || status === 'denied') setOpen(true)
  }, [status])

  const showOutput = open && !!live?.result
  const showPreview = open && status === 'running' && !!live?.preview

  return (
    <div className={`tool-card ${status}`}>
      <button className="tool-head" onClick={() => setOpen((o) => !o)}>
        <span className="tool-glyph">{GLYPHS[call.name] ?? '⚙'}</span>
        <span className="tool-name">{call.name}</span>
        <span className="tool-args">{argLine(call.name, live?.args ?? call.args)}</span>
        <span className="tool-meta">
          {live?.ms !== undefined ? `${(live.ms / 1000).toFixed(1)}s` : ''}
          {status === 'running' ? <span className="spinner" /> : STATUS_ICON[status]}
        </span>
      </button>
      {showOutput ? (
        <div className="tool-body">
          <pre>{live!.result}</pre>
        </div>
      ) : showPreview && live?.preview ? (
        <div className="tool-body">
          <DiffView preview={live.preview} />
        </div>
      ) : null}
    </div>
  )
}
