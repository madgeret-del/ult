import { useEffect, useRef } from 'react'
import type { ReactElement } from 'react'
import type { ChatMessage, LiveTool } from '../rtypes.ts'
import { Markdown } from './Markdown.tsx'
import { ToolCard } from './ToolCard.tsx'

export interface Note {
  id: string
  text: string
}

export function ChatLog({
  messages,
  notes,
  live,
  streamingId
}: {
  messages: ChatMessage[]
  notes: Note[]
  live: Record<string, LiveTool>
  streamingId: string | null
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const stickRef = useRef(true)
  const contentKey =
    messages.map((m) => `${m.id}:${m.content.length}`).join('|') +
    '|' +
    Object.values(live)
      .map((l) => `${l.callId}:${l.status}:${l.result?.length ?? 0}`)
      .join('|')

  useEffect(() => {
    const el = scrollRef.current
    if (el && stickRef.current) el.scrollTop = el.scrollHeight
  }, [contentKey])

  const onScroll = (): void => {
    const el = scrollRef.current
    if (!el) return
    stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 90
  }

  const items: Array<ReactElement> = []

  for (const m of messages) {
    if (m.role === 'tool') continue
    if (m.role === 'user') {
      items.push(
        <div key={m.id} className="msg user">
          <div className="msg-label">you</div>
          <div className="msg-body">{m.content}</div>
        </div>
      )
      continue
    }
    if (m.role === 'assistant') {
      const isStreaming = m.id === streamingId
      items.push(
        <div key={m.id} className="msg assistant">
          <div className="msg-label">
            <span className="avatar">u</span> ult
          </div>
          <div className="msg-body">
            {m.content ? (
              <Markdown text={m.content} />
            ) : isStreaming ? (
              <span style={{ color: 'var(--faint)' }}>thinking…</span>
            ) : null}
            {isStreaming && m.content ? <span className="stream-caret" /> : null}
          </div>
          {m.toolCalls?.length ? (
            <div className="tools">
              {m.toolCalls.map((c) => (
                <ToolCard key={c.id} call={c} live={live[c.id]} />
              ))}
            </div>
          ) : null}
        </div>
      )
      continue
    }
  }

  // local notes (slash-command output) render at the end, in order
  for (const n of notes) {
    items.push(
      <div key={n.id} className="note" style={{ marginLeft: 26, whiteSpace: 'pre-wrap' }}>
        {n.text}
      </div>
    )
  }

  return (
    <div className="log" ref={scrollRef} onScroll={onScroll}>
      <div className="log-inner">{items}</div>
    </div>
  )
}
