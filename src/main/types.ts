// Shared types for the ult agent engine (electron-free, importable from plain Node)

export interface ToolCall {
  id: string
  name: string
  args: Record<string, unknown>
}

export type Role = 'system' | 'user' | 'assistant' | 'tool'

export interface MessageMeta {
  inTokens?: number
  outTokens?: number
  ms?: number
  model?: string
  provider?: string
}

export interface ChatMessage {
  id: string
  role: Role
  content: string
  toolCalls?: ToolCall[]
  toolCallId?: string // role === 'tool'
  toolName?: string // role === 'tool'
  meta?: MessageMeta
}

export interface ToolParam {
  name: string
  type: 'string' | 'number' | 'boolean'
  description: string
  required?: boolean
}

export interface ToolDef {
  name: string
  description: string
  params: ToolParam[]
  danger: 'safe' | 'ask'
}

export interface ToolResult {
  ok: boolean
  output: string
}

export interface ToolContext {
  workspace: string
  signal: AbortSignal
}

export type ToolFn = (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>

// ---------- provider wire types ----------

export type WireMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; toolName: string; content: string }

export interface WireRequest {
  system: string
  messages: WireMessage[]
  tools: ToolDef[]
  model: string
  apiKey?: string
  signal: AbortSignal
}

export type StreamChunk =
  | { type: 'text'; text: string }
  | { type: 'toolcall'; call: ToolCall }
  | { type: 'usage'; inTokens: number; outTokens: number }
  | { type: 'error'; message: string }
  | { type: 'done'; finishReason: string }

export interface ProviderClient {
  kind: string
  label: string
  stream(req: WireRequest): AsyncGenerator<StreamChunk>
}

// ---------- agent events (pushed to the renderer) ----------

export type AgentEvent =
  | { type: 'user_message'; sessionId: string; msg: ChatMessage }
  | { type: 'turn_start'; sessionId: string; messageId: string; model: string; provider: string }
  | { type: 'delta'; sessionId: string; messageId: string; text: string }
  | { type: 'message_done'; sessionId: string; messageId: string; msg: ChatMessage }
  | { type: 'tool_start'; sessionId: string; callId: string; name: string; args: Record<string, unknown>; preview?: string }
  | {
      type: 'approval_request'
      sessionId: string
      callId: string
      name: string
      args: Record<string, unknown>
      preview?: string
    }
  | { type: 'approval_resolved'; sessionId: string; callId: string }
  | { type: 'tool_end'; sessionId: string; callId: string; ok: boolean; result: string; ms: number; denied?: boolean }
  | {
      type: 'usage'
      sessionId: string
      inTokens: number
      outTokens: number
      totalIn: number
      totalOut: number
    }
  | { type: 'turn_end'; sessionId: string; messageId: string; stopped?: boolean }
  | { type: 'error'; sessionId: string; message: string; fatal?: boolean }
  | { type: 'status'; sessionId: string; message: string }

export type ApprovalDecision = 'once' | 'always' | 'deny' | 'cancel'

export class AgentError extends Error {}
export class CancelledError extends Error {}
