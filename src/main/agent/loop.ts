// The agentic loop: stream an assistant turn, execute tool calls, feed results back.

import { randomUUID } from 'node:crypto'
import type {
  AgentEvent,
  ApprovalDecision,
  ChatMessage,
  ProviderClient,
  ToolCall,
  ToolDef,
  WireMessage
} from '../types.ts'
import { toolByName, executeTool, buildPreview } from './tools/registry.ts'
import { ToolError } from './tools/util.ts'

export interface AgentRunOptions {
  sessionId: string
  client: ProviderClient
  model: string
  apiKey?: string
  system: string
  /** History — the loop appends assistant/tool messages as it runs. */
  messages: ChatMessage[]
  tools: ToolDef[]
  workspace: string
  onEvent: (ev: AgentEvent) => void
  requestApproval: (call: ToolCall, preview?: string) => Promise<ApprovalDecision>
  /** Tool names approved "always" for this session — mutated when the user picks "always". */
  alwaysAllowed: Set<string>
  signal: AbortSignal
  maxIterations?: number
}

export interface AgentRunResult {
  inTokens: number
  outTokens: number
  stopped: boolean
  error?: string
}

function toWire(messages: ChatMessage[]): WireMessage[] {
  const out: WireMessage[] = []
  for (const m of messages) {
    if (m.role === 'system') continue
    if (m.role === 'user') out.push({ role: 'user', content: m.content })
    else if (m.role === 'assistant') out.push({ role: 'assistant', content: m.content, toolCalls: m.toolCalls })
    else if (m.role === 'tool') out.push({ role: 'tool', toolCallId: m.toolCallId ?? '', toolName: m.toolName ?? '', content: m.content })
  }
  return out
}

const MAX_ITERATIONS = 25

type WithoutSession<T> = T extends { sessionId: string } ? Omit<T, 'sessionId'> : T

export async function runAgent(o: AgentRunOptions): Promise<AgentRunResult> {
  const sid = o.sessionId
  const maxIter = o.maxIterations ?? MAX_ITERATIONS
  let totalIn = 0
  let totalOut = 0
  let stopped = false
  let error: string | undefined

  const emit = (ev: WithoutSession<AgentEvent>) => {
    o.onEvent({ ...(ev as AgentEvent), sessionId: sid })
  }

  for (let iter = 0; iter < maxIter; iter++) {
    if (o.signal.aborted) {
      stopped = true
      break
    }

    const messageId = randomUUID()
    emit({ type: 'turn_start', messageId, model: o.model, provider: o.client.label })

    let text = ''
    const calls: ToolCall[] = []

    try {
      for await (const chunk of o.client.stream({
        system: o.system,
        messages: toWire(o.messages),
        tools: o.tools,
        model: o.model,
        apiKey: o.apiKey,
        signal: o.signal
      })) {
        switch (chunk.type) {
          case 'text':
            text += chunk.text
            emit({ type: 'delta', messageId, text: chunk.text })
            break
          case 'toolcall':
            calls.push(chunk.call)
            break
          case 'usage':
            totalIn += chunk.inTokens
            totalOut += chunk.outTokens
            emit({
              type: 'usage',
              inTokens: chunk.inTokens,
              outTokens: chunk.outTokens,
              totalIn,
              totalOut
            })
            break
          case 'error':
            throw new Error(chunk.message)
          case 'done':
            break
        }
      }
    } catch (e) {
      if (isAbort(e)) {
        stopped = true
        const msg: ChatMessage = { id: messageId, role: 'assistant', content: text, meta: { model: o.model, provider: o.client.label } }
        if (text) o.messages.push(msg)
        emit({ type: 'message_done', messageId, msg })
        emit({ type: 'turn_end', messageId, stopped: true })
        return { inTokens: totalIn, outTokens: totalOut, stopped, error: 'stopped by user' }
      }
      error = (e as Error).message
      emit({ type: 'error', message: error, fatal: true })
      emit({ type: 'turn_end', messageId, stopped: false })
      return { inTokens: totalIn, outTokens: totalOut, stopped, error }
    }

    const assistantMsg: ChatMessage = {
      id: messageId,
      role: 'assistant',
      content: text,
      ...(calls.length ? { toolCalls: calls } : {}),
      meta: { inTokens: 0, outTokens: 0, model: o.model, provider: o.client.label }
    }
    o.messages.push(assistantMsg)
    emit({ type: 'message_done', messageId, msg: assistantMsg })

    if (!calls.length) {
      emit({ type: 'turn_end', messageId })
      return { inTokens: totalIn, outTokens: totalOut, stopped: false }
    }

    // Execute tool calls in order.
    for (const call of calls) {
      const def = toolByName(call.name)

      if (!def) {
        const output = `unknown tool "${call.name}" — available: ${o.tools.map((t) => t.name).join(', ')}`
        const tm: ChatMessage = { id: randomUUID(), role: 'tool', content: output, toolCallId: call.id, toolName: call.name }
        o.messages.push(tm)
        emit({ type: 'tool_start', callId: call.id, name: call.name, args: call.args })
        emit({ type: 'tool_end', callId: call.id, ok: false, result: output, ms: 0 })
        continue
      }

      const ask = def.danger === 'ask' && !o.alwaysAllowed.has(call.name)
      let preview: string | undefined
      if (ask) {
        try {
          preview = buildPreview(call.name, call.args, o.workspace)
        } catch (e) {
          if (e instanceof ToolError) {
            // Invalid call — fail it without bothering the user.
            const tm: ChatMessage = { id: randomUUID(), role: 'tool', content: e.message, toolCallId: call.id, toolName: call.name }
            o.messages.push(tm)
            emit({ type: 'tool_start', callId: call.id, name: call.name, args: call.args })
            emit({ type: 'tool_end', callId: call.id, ok: false, result: e.message, ms: 0 })
            continue
          }
          throw e
        }
        let decision: ApprovalDecision
        try {
          decision = await o.requestApproval(call, preview)
        } catch {
          decision = 'cancel'
        }
        if (decision === 'always') {
          o.alwaysAllowed.add(call.name)
        } else if (decision === 'deny' || decision === 'cancel') {
          if (decision === 'cancel') {
            emit({ type: 'turn_end', messageId, stopped: true })
            return { inTokens: totalIn, outTokens: totalOut, stopped: true, error: 'cancelled at approval' }
          }
          const output = 'User denied this tool call. Do not retry the same action; ask the user how to proceed instead.'
          const tm: ChatMessage = { id: randomUUID(), role: 'tool', content: output, toolCallId: call.id, toolName: call.name }
          o.messages.push(tm)
          emit({ type: 'tool_start', callId: call.id, name: call.name, args: call.args, preview })
          emit({ type: 'tool_end', callId: call.id, ok: false, result: output, ms: 0, denied: true })
          continue
        }
      }

      emit({ type: 'tool_start', callId: call.id, name: call.name, args: call.args, preview })
      const t0 = Date.now()
      const result = await executeTool(call.name, call.args, { workspace: o.workspace, signal: o.signal })
      const ms = Date.now() - t0
      const tm: ChatMessage = { id: randomUUID(), role: 'tool', content: result.output, toolCallId: call.id, toolName: call.name }
      o.messages.push(tm)
      emit({ type: 'tool_end', callId: call.id, ok: result.ok, result: result.output, ms })
      if (o.signal.aborted) {
        stopped = true
        emit({ type: 'turn_end', messageId, stopped: true })
        return { inTokens: totalIn, outTokens: totalOut, stopped, error: 'stopped during tool execution' }
      }
    }
    // next iteration streams the assistant's follow-up
  }

  emit({ type: 'status', message: `reached the ${maxIter}-iteration limit for one turn` })
  return { inTokens: totalIn, outTokens: totalOut, stopped, error }
}

function isAbort(e: unknown): boolean {
  const err = e as { name?: string; code?: string }
  return err?.name === 'AbortError' || err?.code === 'ABORT_ERR'
}
