// OpenAI-compatible chat-completions streaming client.
// Works with OpenAI, Z.ai, OpenRouter, DeepSeek, Moonshot, Groq, Ollama, vLLM, LM Studio…

import type { ProviderClient, StreamChunk, ToolCall, WireRequest } from '../types.ts'
import { paramsToSchema } from '../agent/tools/registry.ts'
import { sseData, raiseForStatus, estimateTokens } from './sse.ts'

interface ToolCallAcc {
  id: string
  name: string
  args: string
}

export function openaiCompatClient(baseUrl: string, label = 'openai-compatible'): ProviderClient {
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions'
  return {
    kind: 'openai',
    label,
    async *stream(req: WireRequest): AsyncGenerator<StreamChunk> {
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      if (req.apiKey) headers['authorization'] = `Bearer ${req.apiKey}`

      const body: Record<string, unknown> = {
        model: req.model,
        stream: true,
        messages: [
          { role: 'system', content: req.system },
          ...req.messages.map((m) => {
            if (m.role === 'assistant') {
              const out: Record<string, unknown> = { role: 'assistant', content: m.content || null }
              if (m.toolCalls?.length) {
                out.tool_calls = m.toolCalls.map((c) => ({
                  id: c.id,
                  type: 'function',
                  function: { name: c.name, arguments: JSON.stringify(c.args ?? {}) }
                }))
              }
              return out
            }
            if (m.role === 'tool') {
              return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
            }
            return { role: m.role, content: m.content }
          })
        ]
      }
      if (req.tools.length) {
        body.tools = req.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: paramsToSchema(t) }
        }))
      }

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: req.signal
      })
      await raiseForStatus(res, label)

      let text = ''
      const acc = new Map<number, ToolCallAcc>()
      let finishReason = 'stop'
      let usage: { inTokens: number; outTokens: number } | null = null

      for await (const data of sseData(res)) {
        if (data === '[DONE]') break
        let json: any
        try {
          json = JSON.parse(data)
        } catch {
          continue
        }
        const choice = json.choices?.[0]
        if (choice?.finish_reason) finishReason = choice.finish_reason
        const delta = choice?.delta
        if (delta?.content) {
          text += delta.content
          yield { type: 'text', text: delta.content }
        }
        if (Array.isArray(delta?.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = Number(tc.index ?? 0)
            let cur = acc.get(idx)
            if (!cur) {
              cur = { id: '', name: '', args: '' }
              acc.set(idx, cur)
            }
            if (tc.id) cur.id = tc.id
            if (tc.function?.name) cur.name = tc.function.name
            if (tc.function?.arguments) cur.args += tc.function.arguments
          }
        }
        if (json.usage) {
          usage = { inTokens: Number(json.usage.prompt_tokens) || 0, outTokens: Number(json.usage.completion_tokens) || 0 }
        }
      }

      for (const [, t] of [...acc.entries()].sort((a, b) => a[0] - b[0])) {
        if (!t.name) continue
        let args: Record<string, unknown> = {}
        if (t.args.trim()) {
          try {
            args = JSON.parse(t.args)
          } catch {
            yield { type: 'error', message: `tool call "${t.name}" had malformed JSON arguments` }
          }
        }
        const call: ToolCall = { id: t.id || `call_${Math.random().toString(36).slice(2, 10)}`, name: t.name, args }
        yield { type: 'toolcall', call }
        text += JSON.stringify(call.args)
      }

      yield {
        type: 'usage',
        inTokens: usage?.inTokens ?? estimateTokens(req.system + req.messages.map((m) => m.content).join('')),
        outTokens: usage?.outTokens ?? estimateTokens(text)
      }
      yield { type: 'done', finishReason }
    }
  }
}
