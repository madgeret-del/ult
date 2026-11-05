// Client-side mirrors of the main-process types (kept loose on purpose).

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string
  toolName?: string
  meta?: { inTokens?: number; outTokens?: number; ms?: number; model?: string; provider?: string }
}

export interface SessionMeta {
  id: string
  title: string
  workspace: string
  createdAt: number
  updatedAt: number
  providerId: string
  model: string
  messageCount: number
}

export interface PresetView {
  id: string
  label: string
  kind: 'openai' | 'anthropic' | 'mock'
  baseUrl: string
  models: string[]
  needsKey: boolean
  envKey?: string
  note?: string
  hasKey: boolean
}

export interface CustomProvider {
  id: string
  label: string
  kind: 'openai' | 'anthropic'
  baseUrl: string
  models: string[]
  needsKey: boolean
}

export interface PublicConfig {
  providerId: string
  model: string
  theme: string
  lastWorkspace?: string
  customProviders: CustomProvider[]
  presets: PresetView[]
  version: string
}

export interface LiveTool {
  callId: string
  name: string
  args: Record<string, unknown>
  status: 'running' | 'ok' | 'err' | 'denied'
  result?: string
  ms?: number
  preview?: string
}

export type ApprovalDecision = 'once' | 'always' | 'deny' | 'cancel'

export interface AgentEventLike {
  type: string
  sessionId?: string
  messageId?: string
  msg?: ChatMessage
  text?: string
  callId?: string
  name?: string
  args?: Record<string, unknown>
  preview?: string
  ok?: boolean
  result?: string
  ms?: number
  denied?: boolean
  inTokens?: number
  outTokens?: number
  totalIn?: number
  totalOut?: number
  stopped?: boolean
  message?: string
  fatal?: boolean
  model?: string
  provider?: string
}
