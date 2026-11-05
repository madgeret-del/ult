import { useCallback, useEffect, useRef, useState } from 'react'
import { bridge } from './api.ts'
import type { AgentEventLike, ChatMessage, LiveTool, PublicConfig, SessionMeta } from './rtypes.ts'
import { Sidebar } from './components/Sidebar.tsx'
import { ChatLog, type Note } from './components/ChatLog.tsx'
import { Composer } from './components/Composer.tsx'
import { ApprovalDialog, type ApprovalReq } from './components/ApprovalDialog.tsx'
import { ModelPicker } from './components/ModelPicker.tsx'
import { SettingsDialog } from './components/SettingsDialog.tsx'

const THEMES = ['midnight', 'carbon', 'synthwave', 'solar']

let noteSeq = 0
const makeNote = (text: string): Note => ({ id: `note-${++noteSeq}-${Date.now()}`, text })

const HELP_TEXT = `ult — your terminal-grade coding agent, on your desktop.

Commands:
  /help      this text
  /new       fresh chat
  /model     switch provider & model
  /provider  open settings (API keys, custom providers)
  /theme     cycle color themes
  /tools     list agent tools

Tools I can call (you approve anything that touches your disk or shell):
  read_file · write_file · edit_file · glob · grep · run_command

Pick a preset in Settings (Z.ai/GLM, Anthropic, OpenAI, OpenRouter, DeepSeek,
Kimi, Groq, Ollama — or paste any custom base URL), drop in a key, and go.`

export default function App() {
  const [config, setConfig] = useState<PublicConfig | null>(null)
  const [workspace, setWorkspace] = useState('')
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [title, setTitle] = useState('New chat')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [live, setLive] = useState<Record<string, LiveTool>>({})
  const [streaming, setStreaming] = useState(false)
  const [streamingId, setStreamingId] = useState<string | null>(null)
  const [approval, setApproval] = useState<ApprovalReq | null>(null)
  const [tokens, setTokens] = useState({ in: 0, out: 0 })
  const [toast, setToast] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [pickerAnchor, setPickerAnchor] = useState<DOMRect | null>(null)
  const [statusNote, setStatusNote] = useState('')
  const pillRef = useRef<HTMLButtonElement | null>(null)
  const activeIdRef = useRef<string | null>(null)
  activeIdRef.current = activeId

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4500)
  }, [])

  const applyTheme = useCallback((t: string) => {
    document.documentElement.dataset.theme = THEMES.includes(t) ? t : 'midnight'
  }, [])

  const refreshSessions = useCallback(async () => {
    try {
      setSessions(await bridge().invoke('session:list'))
    } catch {
      /* ignore */
    }
  }, [])

  const doNewSession = useCallback(async () => {
    const res = await bridge().invoke('session:new')
    setActiveId(res.meta.id)
    setTitle(res.meta.title)
    setMessages(res.messages)
    setNotes([])
    setLive({})
    setTokens({ in: 0, out: 0 })
    setStreaming(false)
    setStreamingId(null)
    void refreshSessions()
  }, [refreshSessions])

  const selectSession = useCallback(
    async (id: string) => {
      const res = await bridge().invoke('session:load', id)
      if (!res) return
      setActiveId(res.meta.id)
      setTitle(res.meta.title)
      setWorkspace(res.meta.workspace)
      setMessages(res.messages)
      setNotes([])
      setLive({})
      setTokens({ in: 0, out: 0 })
      setStreaming(false)
      setStreamingId(null)
      void refreshSessions()
    },
    [refreshSessions]
  )

  // ---------- boot ----------
  useEffect(() => {
    void (async () => {
      const cfg: PublicConfig = await bridge().invoke('config:get')
      setConfig(cfg)
      applyTheme(cfg.theme)
      setWorkspace(cfg.lastWorkspace ?? '')
      const list: SessionMeta[] = await bridge().invoke('session:list')
      setSessions(list)
      if (list.length && cfg.lastWorkspace) await selectSession(list[0].id)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- event stream ----------
  useEffect(() => {
    const off = bridge().onEvent((ev: AgentEventLike) => {
      if (ev.sessionId && activeIdRef.current && ev.sessionId !== activeIdRef.current) return
      switch (ev.type) {
        case 'user_message':
          if (ev.msg) {
            setMessages((ms) => [...ms, ev.msg!])
            setTitle((t) =>
              t === 'New chat' ? ev.msg!.content.replace(/\s+/g, ' ').trim().slice(0, 60) || t : t
            )
          }
          break
        case 'turn_start':
          setStreaming(true)
          setStreamingId(ev.messageId ?? null)
          setStatusNote('')
          if (ev.messageId) {
            setMessages((ms) =>
              ms.some((m) => m.id === ev.messageId)
                ? ms
                : [...ms, { id: ev.messageId!, role: 'assistant', content: '', meta: { model: ev.model, provider: ev.provider } }]
            )
          }
          break
        case 'delta':
          if (ev.messageId && ev.text) {
            setMessages((ms) => ms.map((m) => (m.id === ev.messageId ? { ...m, content: m.content + ev.text! } : m)))
          }
          break
        case 'message_done':
          if (ev.msg) setMessages((ms) => ms.map((m) => (m.id === ev.msg!.id ? ev.msg! : m)))
          break
        case 'tool_start':
          if (ev.callId) {
            setLive((l) => ({
              ...l,
              [ev.callId!]: {
                callId: ev.callId!,
                name: ev.name ?? '',
                args: ev.args ?? {},
                status: 'running',
                preview: ev.preview
              }
            }))
          }
          break
        case 'tool_end':
          if (ev.callId) {
            setLive((l) => ({
              ...l,
              [ev.callId!]: {
                ...l[ev.callId!],
                callId: ev.callId!,
                name: l[ev.callId!]?.name ?? '',
                args: l[ev.callId!]?.args ?? {},
                status: ev.denied ? 'denied' : ev.ok ? 'ok' : 'err',
                result: ev.result,
                ms: ev.ms
              }
            }))
          }
          break
        case 'approval_request':
          setApproval({
            callId: ev.callId!,
            name: ev.name ?? '',
            args: ev.args ?? {},
            preview: ev.preview
          })
          break
        case 'approval_resolved':
          setApproval((a) => (a && a.callId === ev.callId ? null : a))
          break
        case 'usage':
          setTokens({ in: ev.totalIn ?? 0, out: ev.totalOut ?? 0 })
          break
        case 'turn_end':
          setStreaming(false)
          setStreamingId(null)
          setStatusNote(ev.stopped ? 'stopped' : '')
          void refreshSessions()
          break
        case 'error':
          if (ev.message) showToast(ev.message)
          break
        case 'status':
          setStatusNote(ev.message ?? '')
          break
        default:
          break
      }
    })
    return off
  }, [refreshSessions, showToast])

  // Esc stops a running turn
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape' && streaming) void bridge().invoke('chat:stop')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [streaming])

  // ---------- actions ----------

  const patchConfig = useCallback(
    async (patch: Record<string, unknown>) => {
      const cfg: PublicConfig = await bridge().invoke('config:set', patch)
      setConfig(cfg)
      if (patch.theme) applyTheme(cfg.theme)
    },
    [applyTheme]
  )

  const handleSend = useCallback(
    (text: string) => {
      if (text.startsWith('/')) {
        const [cmd, ...rest] = text.slice(1).split(/\s+/)
        switch (cmd) {
          case 'help':
            setNotes((n) => [...n, makeNote(HELP_TEXT)])
            return
          case 'new':
          case 'clear':
            void doNewSession()
            return
          case 'model':
            setPickerAnchor(pillRef.current?.getBoundingClientRect() ?? new DOMRect(200, 60))
            return
          case 'provider':
            setShowSettings(true)
            return
          case 'theme': {
            const arg = rest[0]
            if (arg && THEMES.includes(arg)) {
              void patchConfig({ theme: arg })
            } else {
              const next = THEMES[(THEMES.indexOf(document.documentElement.dataset.theme ?? 'midnight') + 1) % THEMES.length]
              void patchConfig({ theme: next })
            }
            return
          }
          case 'tools': {
            void (async () => {
              const tools = (await bridge().invoke('tools:list')) as Array<{ name: string; description: string; danger: string }>
              setNotes((n) => [
                ...n,
                makeNote(tools.map((t) => `${t.name}${t.danger === 'ask' ? '  (asks you first)' : '  (safe)'}`).join('\n'))
              ])
            })()
            return
          }
          default:
            setNotes((n) => [...n, makeNote(`unknown command: /${cmd} — try /help`)])
            return
        }
      }
      void (async () => {
        const res = await bridge().invoke('chat:send', text)
        if (res && res.ok === false && res.error) showToast(res.error === 'missing api key' ? '' : res.error)
        if (res && res.ok === false) setTitle(title === 'New chat' ? text.slice(0, 40) : title)
      })()
    },
    [doNewSession, patchConfig, showToast, title]
  )

  const pickWorkspace = useCallback(async () => {
    const ws = await bridge().invoke('workspace:pick')
    if (ws) {
      setWorkspace(ws)
      setActiveId(null)
      setTitle('New chat')
      setMessages([])
      setNotes([])
      setLive({})
      setTokens({ in: 0, out: 0 })
      void refreshSessions()
    }
  }, [refreshSessions])

  const renameSession = useCallback(
    async (id: string, newTitle: string) => {
      await bridge().invoke('session:rename', { id, title: newTitle })
      if (id === activeId) setTitle(newTitle.trim() || title)
      void refreshSessions()
    },
    [activeId, refreshSessions, title]
  )

  const deleteSession = useCallback(
    async (id: string) => {
      await bridge().invoke('session:delete', id)
      if (id === activeId) {
        setActiveId(null)
        setMessages([])
        setNotes([])
        setTitle('New chat')
      }
      void refreshSessions()
    },
    [activeId, refreshSessions]
  )

  const decide = useCallback(async (d: 'once' | 'always' | 'deny' | 'cancel') => {
    const req = approval
    setApproval(null)
    if (req) await bridge().invoke('approval:respond', { callId: req.callId, decision: d })
  }, [approval])

  const pickModel = useCallback(
    async (providerId: string, model: string) => {
      await patchConfig({ providerId, model })
      setPickerAnchor(null)
    },
    [patchConfig]
  )

  if (!config) {
    return (
      <div className="app">
        <div className="empty">
          <div className="wordmark">ult.</div>
          <div className="tagline">waking up…</div>
        </div>
      </div>
    )
  }

  const preset = config.presets.find((p) => p.id === config.providerId)
  const empty = messages.length === 0 && notes.length === 0
  const wsFolder = workspace ? workspace.split(/[\\/]/).filter(Boolean).pop() : ''

  return (
    <div className="app">
      <Sidebar
        workspace={workspace}
        sessions={sessions}
        activeId={activeId}
        onNew={() => void doNewSession()}
        onSelect={(id) => void selectSession(id)}
        onRename={(id, t) => void renameSession(id, t)}
        onDelete={(id) => void deleteSession(id)}
        onPickWorkspace={() => void pickWorkspace()}
        onOpenSettings={() => setShowSettings(true)}
        onCycleTheme={() => {
          const next = THEMES[(THEMES.indexOf(document.documentElement.dataset.theme ?? 'midnight') + 1) % THEMES.length]
          void patchConfig({ theme: next })
        }}
      />

      <div className="main">
        <div className="hdr">
          <div className="hdr-title">{empty ? 'ult — a coding agent on your desktop' : title}</div>
          <button className="pill" ref={pillRef} onClick={() => setPickerAnchor(pillRef.current?.getBoundingClientRect() ?? null)}>
            <span className={preset?.needsKey && !preset.hasKey ? 'dot nokey' : preset?.id === 'mock' ? 'dot mock' : 'dot'} />
            {preset?.label.split('—')[0].trim() ?? config.providerId}
            <span style={{ color: 'var(--faint)' }}>·</span>
            <span style={{ fontFamily: "'Cascadia Code', Consolas, monospace", fontSize: 12 }}>{config.model}</span>
            <span style={{ color: 'var(--faint)', fontSize: 10 }}>▾</span>
          </button>
        </div>

        {empty ? (
          <div className="empty">
            <div className="wordmark">ult.</div>
            <div className="tagline">Your code, an agent, and nothing in the cloud between.</div>
            {workspace ? (
              <div className="chips">
                {['Explain this codebase', 'Add a README', 'Find TODOs and fix one', 'Write a smoke test'].map((c) => (
                  <button key={c} className="chip" onClick={() => handleSend(c)}>
                    {c}
                  </button>
                ))}
              </div>
            ) : (
              <div className="pick">
                ⚡ Pick a workspace folder first (top-left) — everything I do stays inside it.
              </div>
            )}
            {!preset?.hasKey && preset?.needsKey && (
              <div className="pick" style={{ color: 'var(--dim)' }}>
                No API key yet — using it needs one in ⚙ Settings. Or keep the Mock provider for a demo.
              </div>
            )}
          </div>
        ) : (
          <ChatLog messages={messages} notes={notes} live={live} streamingId={streamingId} />
        )}

        <Composer streaming={streaming} onSend={handleSend} onStop={() => void bridge().invoke('chat:stop')} />

        <div className="statusbar">
          <span className="ws" onClick={() => void pickWorkspace()} title={workspace}>
            {wsFolder ? `📁 ${workspace}` : '📁 no workspace'}
          </span>
          <span>·</span>
          <span>
            {config.providerId} / {config.model}
          </span>
          {statusNote && (
            <>
              <span>·</span>
              <span style={{ color: 'var(--warn)' }}>{statusNote}</span>
            </>
          )}
          <span className="spacer" />
          {streaming && <span className="pulse-dot" />}
          <span className="tok">
            ▲ {tokens.in.toLocaleString()} ▼ {tokens.out.toLocaleString()} tok
          </span>
        </div>
      </div>

      {approval && <ApprovalDialog req={approval} onDecision={(d) => void decide(d)} />}

      {pickerAnchor && <ModelPicker config={config} anchor={pickerAnchor} onPick={(p, m) => void pickModel(p, m)} onClose={() => setPickerAnchor(null)} />}

      {showSettings && <SettingsDialog config={config} onClose={() => setShowSettings(false)} onPatch={(p) => void patchConfig(p)} />}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
