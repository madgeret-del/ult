import { useEffect } from 'react'
import type { ApprovalDecision } from '../rtypes.ts'
import { DiffView } from './DiffView.tsx'

export interface ApprovalReq {
  callId: string
  name: string
  args: Record<string, unknown>
  preview?: string
}

export function ApprovalDialog({ req, onDecision }: { req: ApprovalReq; onDecision: (d: ApprovalDecision) => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onDecision('deny')
      else if (e.key.toLowerCase() === 'a' && !e.ctrlKey && !e.altKey) onDecision('once')
      else if (e.key.toLowerCase() === 's' && !e.ctrlKey && !e.altKey) onDecision('always')
      else if (e.key.toLowerCase() === 'd' && !e.ctrlKey && !e.altKey) onDecision('deny')
      else if (e.key === 'Enter') onDecision('once')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onDecision])

  const isCommand = req.name === 'run_command'
  const target = String(req.args?.path ?? req.args?.command ?? '')

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && onDecision('deny')}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">
            Approval needed <span className="badge">{req.name}</span>
          </div>
          <div className="modal-sub">{target}</div>
        </div>
        <div className="modal-body">
          {req.preview ? (
            isCommand ? (
              <div className="diff">
                <div className="line ctx" style={{ color: 'var(--text)' }}>
                  $ {req.preview}
                </div>
              </div>
            ) : (
              <DiffView preview={req.preview} />
            )
          ) : (
            <div className="diff">
              <div className="line ctx">{JSON.stringify(req.args, null, 2)}</div>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn ok" onClick={() => onDecision('once')}>
            Allow once
          </button>
          <button className="btn" onClick={() => onDecision('always')}>
            Always this session
          </button>
          <button className="btn danger" onClick={() => onDecision('deny')}>
            Deny
          </button>
          <div className="hint">
            <span>
              <kbd>A</kbd> allow
            </span>
            <span>
              <kbd>S</kbd> always
            </span>
            <span>
              <kbd>D</kbd>/<kbd>Esc</kbd> deny
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
