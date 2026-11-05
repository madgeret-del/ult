// Anthropic Messages API streaming client.

import type { ProviderClient, StreamChunk, ToolCall, WireRequest } from '../types.ts'
import { paramsToSchema } from '../agent/tools/registry.ts'
import { sseData, raiseForStatus, estimateTokens } from './sse.ts'

interface ToolAcc {
  id: string
  name: string
  args: string
}

export function anthropicClient(baseUrl: string, label = 'anthropic'): ProviderClient {
  const url = baseUrl.replace(/\/+$/, '') + '/v1/messages'
  return {
    kind: 'anthropic',
    label,
    async *stream(req: WireRequest): AsyncGenerator<StreamChunk> {
      // Map neutral wire messages to Anthropic format. Consecutive tool results
      // merge into a single user message of tool_result blocks.
      const messages: Array<Record<string, unknown>> = []
      for (const m of req.messages) {
        if (m.role === 'tool') {
          const last = messages[messages.length - 1]
          const block = { type: 'tool_result', tool_use_id: m.toolCallId, content: m.content || '(empty)' }
          if (last && Array.isArray(last.content) && last.role === 'user') {
            last.content.push(block)
          } else {
            messages.push({ role: 'user', content: [block] })
          }
          continue
        }
        if (m.role === 'assistant') {
          const content: Array<Record<string, unknown>> = []
          if (m.content) content.push({ type: 'text', text: m.content })
          for (const c of m.toolCalls ?? []) {
            content.push({ type: 'tool_use', id: c.id, name: c.name, input: c.args ?? {} })
          }
          if (content.length) messages.push({ role: 'assistant', content })
          continue
        }
        if (m.role === 'user') messages.push({ role: 'user', content: m.content })
      }

      const body: Record<string, unknown> = {
        model: req.model,
        max_tokens: 8192,
        system: req.system,
        messages,
        stream: true
      }
      if (req.tools.length) {
        body.tools = req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: paramsToSchema(t)
        }))
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': req.apiKey ?? '',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body),
        signal: req.signal
      })
      await raiseForStatus(res, label)

      let text = ''
      const tools: ToolAcc[] = []
      let cur: ToolAcc | null = null
      let stopReason = 'end_turn'
      let inTokens = 0
      let outTokens = 0

      for await (const data of sseData(res)) {
        if (!data) continue
        let ev: any
        try {
          ev = JSON.parse(data)
        } catch {
          continue
        }
        switch (ev.type) {
          case 'message_start':
            inTokens = ev.message?.usage?.input_tokens ?? 0
            break
          case 'content_block_start':
            if (ev.content_block?.type === 'tool_use') {
              cur = { id: ev.content_block.id, name: ev.content_block.name, args: '' }
              tools.push(cur)
            }
            break
          case 'content_block_delta':
            if (ev.delta?.type === 'text_delta' && ev.delta.text) {
              text += ev.delta.text
              yield { type: 'text', text: ev.delta.text }
            } else if (ev.delta?.type === 'input_json_delta' && cur) {
              cur.args += ev.delta.partial_json ?? ''
            }
            break
          case 'content_block_stop':
            cur = null
            break
          case 'message_delta':
            stopReason = ev.delta?.stop_reason ?? stopReason
            outTokens = ev.usage?.output_tokens ?? outTokens
            break
          case 'error':
            yield { type: 'error', message: ev.error?.message ?? 'anthropic stream error' }
            break
          case 'message_stop':
            break
          default:
            break
        }
      }

      for (const t of tools) {
        if (!t.name) continue
        let args: Record<string, unknown> = {}
        if (t.args.trim()) {
          try {
            args = JSON.parse(t.args)
          } catch {
            yield { type: 'error', message: `tool call "${t.name}" had malformed JSON input` }
          }
        }
        const call: ToolCall = { id: t.id || `toolu_${Math.random().toString(36).slice(2, 10)}`, name: t.name, args }
        yield { type: 'toolcall', call }
        text += JSON.stringify(call.args)
      }

      yield {
        type: 'usage',
        inTokens: inTokens || estimateTokens(req.system + req.messages.map((m) => m.content).join('')),
        outTokens: outTokens || estimateTokens(text)
      }
      yield { type: 'done', finishReason: stopReason === 'tool_use' ? 'tool_calls' : stopReason }
    }
  }
}
