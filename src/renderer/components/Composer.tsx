import { useEffect, useRef, useState } from 'react'

const COMMANDS: Array<{ cmd: string; desc: string }> = [
  { cmd: '/help', desc: 'show what I can do' },
  { cmd: '/new', desc: 'start a fresh chat' },
  { cmd: '/clear', desc: 'alias for /new' },
  { cmd: '/model', desc: 'switch model / provider' },
  { cmd: '/provider', desc: 'open provider settings' },
  { cmd: '/theme', desc: 'cycle the color theme' },
  { cmd: '/tools', desc: 'list my agent tools' }
]

export function Composer({
  streaming,
  onSend,
  onStop
}: {
  streaming: boolean
  onSend: (text: string) => void
  onStop: () => void
}) {
  const [text, setText] = useState('')
  const taRef = useRef<HTMLTextAreaElement | null>(null)

  const slashActive = text.startsWith('/') && !text.includes(' ')
  const matches = COMMANDS.filter((c) => c.cmd.startsWith(text.toLowerCase()))

  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 220) + 'px'
  }, [text])

  const send = (): void => {
    const t = text.trim()
    if (!t || streaming) return
    setText('')
    onSend(t)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      if (slashActive && matches.length === 1) {
        setText(matches[0].cmd + ' ')
        return
      }
      send()
    } else if (e.key === 'Tab' && slashActive && matches.length) {
      e.preventDefault()
      setText(matches[0].cmd + ' ')
    }
  }

  return (
    <div className="composer">
      <div className="composer-box">
        {slashActive && matches.length > 0 && (
          <div className="slash-menu">
            {matches.map((c, i) => (
              <button
                key={c.cmd}
                className={`slash-item${i === 0 ? ' sel' : ''}`}
                onClick={() => {
                  setText(c.cmd + ' ')
                  taRef.current?.focus()
                }}
              >
                <span className="cmd">{c.cmd}</span>
                <span className="desc">{c.desc}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={taRef}
          value={text}
          rows={1}
          autoFocus
          placeholder={streaming ? 'ult is working… (Esc to stop)' : 'Ask anything, or type / for commands…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {streaming ? (
          <button className="send-btn stop" title="Stop (Esc)" onClick={onStop}>
            ■
          </button>
        ) : (
          <button className="send-btn" title="Send (Enter)" onClick={send}>
            ▶
          </button>
        )}
      </div>
      <div className="composer-hints">
        <span>
          <kbd>Enter</kbd> send
        </span>
        <span>
          <kbd>Shift+Enter</kbd> newline
        </span>
        <span>
          <kbd>/</kbd> commands
        </span>
        <span className="spacer" />
        <span>ult can read, write, edit, search and run — you approve every change</span>
      </div>
    </div>
  )
}
