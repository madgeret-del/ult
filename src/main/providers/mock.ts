// Mock provider — deterministic scripted demo used for the empty-config experience,
// smoke tests and screenshots. No network needed.

import type { ProviderClient, StreamChunk, WireRequest } from '../types.ts'

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function lastUserText(req: WireRequest): string {
  for (let i = req.messages.length - 1; i >= 0; i--) {
    const m = req.messages[i]
    if (m.role === 'user') return m.content
  }
  return ''
}

async function* streamText(text: string, delay = 18): AsyncGenerator<StreamChunk> {
  // Stream in word-sized chunks for a realistic feel.
  const parts = text.split(/(\s+)/)
  let buf = ''
  for (const p of parts) {
    buf += p
    if (buf.length >= 6 || p === '\n') {
      yield { type: 'text', text: buf }
      buf = ''
      await sleep(delay)
    }
  }
  if (buf) yield { type: 'text', text: buf }
}

export function mockClient(): ProviderClient {
  return {
    kind: 'mock',
    label: 'mock',
    async *stream(req: WireRequest): AsyncGenerator<StreamChunk> {
      await sleep(150)
      const userText = lastUserText(req)

      // Second turn (after tool result): wrap up.
      const hasToolResult = req.messages.some((m) => m.role === 'tool')
      if (hasToolResult) {
        yield* streamText(
          `Done! I created **demo-ult.md** in the workspace with a friendly note.\n\nTo see the real thing, open **Settings → Provider** and pick Z.ai, Anthropic, OpenAI, OpenRouter, DeepSeek, Kimi, Groq or a local Ollama model — then ask me to do something in your project. I can read, write, edit, search files and run commands (with your approval).`
        )
        yield { type: 'usage', inTokens: 1420, outTokens: 233 }
        yield { type: 'done', finishReason: 'stop' }
        return
      }

      yield* streamText(`Hi! You said: “${userText.slice(0, 120)}”\n\nLet me show you how my tools work — I'll create a small demo file.`)
      await sleep(120)
      yield {
        type: 'toolcall',
        call: {
          id: 'call_mock_write_1',
          name: 'write_file',
          args: {
            path: 'demo-ult.md',
            content: '# Demo file\n\nThis file was written by **ult** using its `write_file` tool.\n\n- streaming chat ✓\n- agent tools ✓\n- approval flow ✓\n'
          }
        }
      }
      yield { type: 'usage', inTokens: 980, outTokens: 120 }
      yield { type: 'done', finishReason: 'tool_calls' }
    }
  }
}
