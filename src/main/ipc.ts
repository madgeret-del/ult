// IPC layer: the only place that touches Electron APIs for app logic.

import { BrowserWindow, app, dialog, ipcMain, safeStorage } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { AgentEvent, ApprovalDecision, ChatMessage } from './types.ts'
import { loadConfig, saveConfig, defaultConfig, type AppConfig, type CustomProvider } from './config.ts'
import { PRESETS, presetById, makeClient, type ProviderPreset } from './providers/presets.ts'
import { TOOLS } from './agent/tools/registry.ts'
import { buildSystemPrompt, findAgentsMd } from './agent/prompt.ts'
import { runAgent } from './agent/loop.ts'
import {
  listSessions,
  createSession,
  loadSession,
  saveSession,
  deleteSession,
  renameSession,
  type SessionData
} from './sessions.ts'

const ENC_PREFIX = 'enc:b64:'

let win: BrowserWindow | null = null
let cfgDir = ''
let config: AppConfig = defaultConfig()
let currentWorkspace = ''
let activeSession: SessionData | undefined
let runController: AbortController | undefined
const approvalWaiters = new Map<string, (d: ApprovalDecision) => void>()
const alwaysAllowed = new Set<string>()

// ---------- key encryption helpers (DPAPI via safeStorage) ----------

function encryptKey(plain: string): string {
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return ENC_PREFIX + safeStorage.encryptString(plain).toString('base64')
    }
  } catch {
    /* fall through */
  }
  return plain
}

function decryptKey(v: string): string {
  if (!v) return ''
  if (!v.startsWith(ENC_PREFIX)) return v
  try {
    return safeStorage.decryptString(Buffer.from(v.slice(ENC_PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}

// ---------- presets view ----------

function customPresets(): ProviderPreset[] {
  return (config.customProviders ?? []).map((c: CustomProvider) => ({
    id: c.id,
    label: c.label,
    kind: c.kind,
    baseUrl: c.baseUrl,
    models: c.models,
    needsKey: c.needsKey
  }))
}

function resolveApiKey(presetId: string): string {
  const stored = config.apiKeys[presetId]
  const fromStore = stored ? decryptKey(stored) : ''
  if (fromStore) return fromStore
  const preset = presetById(presetId, customPresets())
  const env = preset?.envKey ? process.env[preset.envKey] : undefined
  if (env) return env
  return ''
}

function hasKey(presetId: string): boolean {
  return resolveApiKey(presetId) !== ''
}

function publicPresets() {
  return [...PRESETS, ...customPresets()].map((p) => ({
    id: p.id,
    label: p.label,
    kind: p.kind,
    baseUrl: p.baseUrl,
    models: p.models,
    needsKey: p.needsKey,
    envKey: p.envKey,
    note: p.note,
    hasKey: hasKey(p.id)
  }))
}

function publicConfig() {
  return {
    providerId: config.providerId,
    model: config.model,
    theme: config.theme,
    lastWorkspace: config.lastWorkspace,
    customProviders: config.customProviders,
    presets: publicPresets(),
    version: app.getVersion()
  }
}

function persistConfig(): void {
  saveConfig(cfgDir, config)
}

function pushEvent(ev: AgentEvent): void {
  if (process.env.ULT_LOG_EVENTS) console.log('[ult:event]', ev.type, ev.sessionId?.slice(0, 8))
  if (win && !win.isDestroyed()) win.webContents.send('ult:event', ev)
}

// ---------- agent run ----------

async function startRun(text: string): Promise<{ ok: boolean; error?: string }> {
  if (!currentWorkspace) return { ok: false, error: 'Pick a workspace folder first' }
  if (runController) return { ok: false, error: 'A turn is already running' }

  if (!activeSession) {
    activeSession = createSession(cfgDir, currentWorkspace, config.providerId, config.model)
  }
  if (path.resolve(activeSession.workspace) !== path.resolve(currentWorkspace)) {
    activeSession = createSession(cfgDir, currentWorkspace, config.providerId, config.model)
  }

  const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text }
  activeSession.messages.push(userMsg)
  activeSession.providerId = config.providerId
  activeSession.model = config.model
  saveSession(cfgDir, activeSession)
  pushEvent({ type: 'user_message', sessionId: activeSession.id, msg: userMsg })

  const preset = presetById(config.providerId, customPresets())
  if (!preset) return { ok: false, error: `unknown provider: ${config.providerId}` }
  const client = makeClient(preset)
  const apiKey = resolveApiKey(config.providerId)
  if (preset.needsKey && !apiKey) {
    pushEvent({
      type: 'error',
      sessionId: activeSession.id,
      message: `No API key for ${preset.label}. Open Settings (⚙) and add one${preset.envKey ? `, or set ${preset.envKey}` : ''}.`,
      fatal: true
    })
    return { ok: false, error: 'missing api key' }
  }

  const agentsMd = findAgentsMd(currentWorkspace)
  const system = buildSystemPrompt(currentWorkspace, agentsMd)
  const sessionId = activeSession.id

  runController = new AbortController()
  const controller = runController

  // Run in background; events stream to the renderer.
  void (async () => {
    try {
      if (process.env.ULT_LOG_EVENTS) console.log('[ult] run starting, provider=', preset.id, 'model=', config.model)
      await runAgent({
        sessionId,
        client,
        model: config.model,
        apiKey,
        system,
        messages: activeSession!.messages,
        tools: TOOLS,
        workspace: currentWorkspace,
        onEvent: pushEvent,
        requestApproval: (call, preview) =>
          new Promise<ApprovalDecision>((resolve) => {
            approvalWaiters.set(call.id, resolve)
            pushEvent({
              type: 'approval_request',
              sessionId,
              callId: call.id,
              name: call.name,
              args: call.args,
              preview
            })
            // auto-cancel if the run is aborted while waiting
            controller.signal.addEventListener(
              'abort',
              () => {
                if (approvalWaiters.has(call.id)) {
                  approvalWaiters.delete(call.id)
                  resolve('cancel')
                }
              },
              { once: true }
            )
          }),
        alwaysAllowed,
        signal: controller.signal
      })
    } catch (e) {
      console.error('[ult] runAgent threw:', e)
      pushEvent({ type: 'error', sessionId, message: (e as Error).message, fatal: true })
    } finally {
      if (activeSession) saveSession(cfgDir, activeSession)
      runController = undefined
      approvalWaiters.clear()
    }
  })()

  return { ok: true }
}

// ---------- registration ----------

export function registerIpc(theWin: BrowserWindow): void {
  win = theWin
  cfgDir = app.getPath('userData')
  fs.mkdirSync(path.join(cfgDir, 'sessions'), { recursive: true })
  config = loadConfig(cfgDir)
  currentWorkspace = config.lastWorkspace ?? ''

  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    platform: process.platform,
    workspace: currentWorkspace,
    theme: config.theme
  }))

  ipcMain.handle('config:get', () => publicConfig())

  ipcMain.handle(
    'config:set',
    (_e, patch: {
      providerId?: string
      model?: string
      theme?: string
      apiKey?: { provider: string; value: string | null }
      custom?: CustomProvider
      customRemove?: string
    }) => {
      if (patch.providerId !== undefined) config.providerId = patch.providerId
      if (patch.model !== undefined) config.model = patch.model
      if (patch.theme !== undefined) config.theme = patch.theme
      if (patch.apiKey) {
        if (patch.apiKey.value === null || patch.apiKey.value === '') delete config.apiKeys[patch.apiKey.provider]
        else config.apiKeys[patch.apiKey.provider] = encryptKey(patch.apiKey.value)
      }
      if (patch.custom) {
        const c = patch.custom
        const i = config.customProviders.findIndex((x) => x.id === c.id)
        if (i >= 0) config.customProviders[i] = c
        else config.customProviders.push(c)
      }
      if (patch.customRemove) {
        config.customProviders = config.customProviders.filter((x) => x.id !== patch.customRemove)
        if (config.providerId === patch.customRemove) config.providerId = 'mock'
      }
      persistConfig()
      return publicConfig()
    }
  )

  ipcMain.handle('workspace:pick', async () => {
    const res = await dialog.showOpenDialog(win!, {
      title: 'Choose a workspace folder',
      properties: ['openDirectory']
    })
    if (res.canceled || !res.filePaths.length) return null
    setWorkspace(res.filePaths[0])
    return currentWorkspace
  })

  ipcMain.handle('session:list', () => listSessions(cfgDir, currentWorkspace))

  ipcMain.handle('session:new', () => {
    activeSession = createSession(cfgDir, currentWorkspace, config.providerId, config.model)
    saveSession(cfgDir, activeSession)
    return { meta: { ...activeSession, messageCount: 0 }, messages: [] }
  })

  ipcMain.handle('session:load', (_e, id: string) => {
    const s = loadSession(cfgDir, id)
    if (!s) return null
    activeSession = s
    setWorkspace(s.workspace)
    return { meta: { ...s, messageCount: s.messages.length }, messages: s.messages }
  })

  ipcMain.handle('session:rename', (_e, { id, title }: { id: string; title: string }) => renameSession(cfgDir, id, title))

  ipcMain.handle('session:delete', (_e, id: string) => {
    if (activeSession?.id === id) activeSession = undefined
    return deleteSession(cfgDir, id)
  })

  ipcMain.handle('chat:send', async (_e, text: string) => {
    return startRun(String(text ?? '').trim())
  })

  ipcMain.handle('chat:stop', () => {
    for (const [id, resolve] of approvalWaiters) {
      resolve('cancel')
      approvalWaiters.delete(id)
      if (activeSession) pushEvent({ type: 'approval_resolved', sessionId: activeSession.id, callId: id })
    }
    runController?.abort()
    return true
  })

  ipcMain.handle('approval:respond', (_e, { callId, decision }: { callId: string; decision: ApprovalDecision }) => {
    const resolve = approvalWaiters.get(callId)
    if (resolve) {
      approvalWaiters.delete(callId)
      resolve(decision)
      return true
    }
    return false
  })

  ipcMain.handle('tools:list', () => TOOLS.map((t) => ({ name: t.name, description: t.description, danger: t.danger })))
}

export function setWorkspace(ws: string): void {
  currentWorkspace = ws
  config.lastWorkspace = ws
  persistConfig()
}

/** Used by the demo/screenshot mode in index.ts. */
export function demoSend(text: string): void {
  void startRun(text)
}

/** Auto-approve the pending approval request (demo/screenshot mode). */
export function demoApprove(): void {
  const [callId, resolve] = [...approvalWaiters.entries()][0] ?? []
  if (callId) {
    approvalWaiters.delete(callId)
    resolve('once')
    if (activeSession) pushEvent({ type: 'approval_resolved', sessionId: activeSession.id, callId })
  }
}
