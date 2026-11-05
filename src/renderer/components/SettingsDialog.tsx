import { useState } from 'react'
import type { CustomProvider, PublicConfig } from '../rtypes.ts'

const THEMES: Array<{ id: string; label: string; preview: string }> = [
  { id: 'midnight', label: 'midnight', preview: 'linear-gradient(135deg,#0a0d14 55%,#8b7cff)' },
  { id: 'carbon', label: 'carbon', preview: 'linear-gradient(135deg,#0f1113 55%,#5eead4)' },
  { id: 'synthwave', label: 'synthwave', preview: 'linear-gradient(135deg,#12081f 55%,#ff5ea8)' },
  { id: 'solar', label: 'solar', preview: 'linear-gradient(135deg,#f6f2e9 55%,#b45309)' }
]

export function SettingsDialog({
  config,
  onClose,
  onPatch
}: {
  config: PublicConfig
  onClose: () => void
  onPatch: (patch: Record<string, unknown>) => void
}) {
  const current = config.presets.find((p) => p.id === config.providerId)
  const [keyDraft, setKeyDraft] = useState('')
  const [modelDraft, setModelDraft] = useState('')
  const [cName, setCName] = useState('')
  const [cKind, setCKind] = useState<'openai' | 'anthropic'>('openai')
  const [cUrl, setCUrl] = useState('')
  const [cModels, setCModels] = useState('')

  const addCustom = (): void => {
    const label = cName.trim()
    const baseUrl = cUrl.trim()
    if (!label || !baseUrl) return
    const c: CustomProvider = {
      id: 'custom-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
      label,
      kind: cKind,
      baseUrl,
      models: cModels.split(',').map((s) => s.trim()).filter(Boolean),
      needsKey: true
    }
    onPatch({ custom: c })
    setCName('')
    setCUrl('')
    setCModels('')
  }

  return (
    <div className="overlay settings" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-head">
          <div className="modal-title">Settings</div>
          <div className="modal-sub" style={{ fontFamily: 'inherit' }}>
            Everything is stored locally in your user data dir. API keys are encrypted (DPAPI).
          </div>
        </div>
        <div className="modal-body">
          <div className="set-section">
            <h3>Provider</h3>
            <div className="set-row">
              <label>Preset</label>
              <select
                value={config.providerId}
                onChange={(e) => {
                  const p = config.presets.find((x) => x.id === e.target.value)
                  onPatch({ providerId: e.target.value, model: p?.models[0] ?? config.model })
                }}
              >
                {config.presets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="set-row">
              <label>API key</label>
              <div className="key-row">
                <input
                  type="password"
                  placeholder={current?.needsKey ? (current.hasKey ? '•••••• stored — paste to replace' : 'paste your key') : 'not required'}
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  disabled={!current?.needsKey}
                />
                <button
                  className="btn"
                  disabled={!keyDraft.trim()}
                  onClick={() => {
                    onPatch({ apiKey: { provider: config.providerId, value: keyDraft.trim() } })
                    setKeyDraft('')
                  }}
                >
                  Save
                </button>
                <button
                  className="btn ghost"
                  disabled={!current?.hasKey}
                  onClick={() => onPatch({ apiKey: { provider: config.providerId, value: null } })}
                >
                  Remove
                </button>
              </div>
            </div>
            {current?.envKey && (
              <div className="set-note">
                Alternatively set the <code style={{ fontFamily: 'monospace' }}>{current.envKey}</code> environment variable.
                {current.note ? ' ' + current.note : ''}
              </div>
            )}
            <div className="set-row" style={{ marginTop: 12 }}>
              <label>Model</label>
              <div className="key-row">
                <input
                  placeholder="model id"
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                />
                <button
                  className="btn"
                  disabled={!modelDraft.trim()}
                  onClick={() => {
                    onPatch({ model: modelDraft.trim() })
                    setModelDraft('')
                  }}
                >
                  Set
                </button>
              </div>
            </div>
            <div className="model-chips">
              {current?.models.map((m) => (
                <button
                  key={m}
                  className={`model-chip${m === config.model ? ' active' : ''}`}
                  onClick={() => onPatch({ model: m })}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <div className="set-section">
            <h3>Custom OpenAI-compatible / Anthropic provider</h3>
            <div className="set-row">
              <input placeholder="name" value={cName} onChange={(e) => setCName(e.target.value)} />
              <select value={cKind} onChange={(e) => setCKind(e.target.value as 'openai' | 'anthropic')}>
                <option value="openai">openai-compatible</option>
                <option value="anthropic">anthropic</option>
              </select>
            </div>
            <div className="set-row">
              <input placeholder="base URL, e.g. https://host/v1" value={cUrl} onChange={(e) => setCUrl(e.target.value)} />
            </div>
            <div className="set-row">
              <input placeholder="models (comma separated)" value={cModels} onChange={(e) => setCModels(e.target.value)} />
              <button className="btn" onClick={addCustom}>
                Add
              </button>
            </div>
            {config.customProviders.length > 0 && (
              <div className="custom-list">
                {config.customProviders.map((c) => (
                  <div key={c.id} className="custom-item">
                    <span className="grow">
                      <b>{c.label}</b> <span style={{ color: 'var(--faint)' }}>{c.baseUrl}</span>
                    </span>
                    <button className="btn ghost" onClick={() => onPatch({ customRemove: c.id })}>
                      remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="set-section">
            <h3>Theme</h3>
            <div className="theme-row">
              {THEMES.map((t) => (
                <button
                  key={t.id}
                  className={`theme-swatch${config.theme === t.id ? ' active' : ''}`}
                  onClick={() => onPatch({ theme: t.id })}
                >
                  <span className="sw" style={{ background: t.preview }} />
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="modal-foot">
          <span style={{ color: 'var(--faint)', fontSize: 12 }}>ult v{config.version}</span>
          <span className="hint" style={{ marginLeft: 'auto' }} />
          <button className="btn primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
