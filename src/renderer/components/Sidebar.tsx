import { useState } from 'react'
import type { SessionMeta } from '../rtypes.ts'

function relTime(ts: number): string {
  const d = Date.now() - ts
  const m = Math.floor(d / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export function Sidebar({
  workspace,
  sessions,
  activeId,
  onNew,
  onSelect,
  onRename,
  onDelete,
  onPickWorkspace,
  onOpenSettings,
  onCycleTheme
}: {
  workspace: string
  sessions: SessionMeta[]
  activeId: string | null
  onNew: () => void
  onSelect: (id: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onPickWorkspace: () => void
  onOpenSettings: () => void
  onCycleTheme: () => void
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  const wsName = workspace ? workspace.split(/[\\/]/).filter(Boolean).pop() || workspace : 'choose folder…'

  return (
    <aside className="sidebar">
      <div className="side-top">
        <div className="logo">
          <div className="logo-mark">u</div>
          <div className="logo-name">ult</div>
        </div>
        <button className="workspace-pill" onClick={onPickWorkspace} title={workspace || 'Choose a workspace folder'}>
          <span style={{ fontSize: 13 }}>📁</span>
          <span className="ws-name">{wsName}</span>
          <span style={{ color: 'var(--faint)' }}>⌄</span>
        </button>
        <button className="btn-new" onClick={onNew}>
          ＋ New chat
        </button>
      </div>

      <div className="side-label">Recent</div>
      <div className="sessions">
        {sessions.length === 0 && <div style={{ padding: '4px 10px', color: 'var(--faint)', fontSize: 12.5 }}>no chats yet</div>}
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item${s.id === activeId ? ' active' : ''}`}
            onClick={() => onSelect(s.id)}
            role="button"
          >
            {editing === s.id ? (
              <input
                autoFocus
                value={draft}
                style={{ flex: 1, fontSize: 13, padding: '2px 6px' }}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    onRename(s.id, draft)
                    setEditing(null)
                  } else if (e.key === 'Escape') setEditing(null)
                }}
                onClick={(e) => e.stopPropagation()}
                onBlur={() => setEditing(null)}
              />
            ) : (
              <>
                <span className="session-title" title={s.title}>
                  {s.title}
                </span>
                <span className="session-actions">
                  <button
                    title="Rename"
                    onClick={(e) => {
                      e.stopPropagation()
                      setEditing(s.id)
                      setDraft(s.title)
                    }}
                  >
                    ✎
                  </button>
                  <button
                    title="Delete"
                    onClick={(e) => {
                      e.stopPropagation()
                      onDelete(s.id)
                    }}
                  >
                    ✕
                  </button>
                </span>
                <span className="session-time">{relTime(s.updatedAt)}</span>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="side-bottom">
        <button className="icon-btn" title="Cycle theme" onClick={onCycleTheme}>
          ◐
        </button>
        <button className="icon-btn" title="Settings" onClick={onOpenSettings}>
          ⚙
        </button>
        <div className="side-note">local · your keys</div>
      </div>
    </aside>
  )
}
