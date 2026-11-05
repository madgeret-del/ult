// Tiny SSE reader over a fetch Response body.

export async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) throw new Error('empty response body')
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '')
        buf = buf.slice(idx + 1)
        if (line.startsWith('data:')) yield line.slice(5).trim()
      }
    }
    const tail = buf.trim()
    if (tail.startsWith('data:')) yield tail.slice(5).trim()
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* ignore */
    }
  }
}

export async function raiseForStatus(res: Response, provider: string): Promise<void> {
  if (res.ok) return
  let detail = ''
  try {
    const text = await res.text()
    detail = text.slice(0, 400)
  } catch {
    /* ignore */
  }
  const hint = res.status === 401 || res.status === 403 ? ' — check your API key in Settings' : ''
  throw new Error(`${provider} HTTP ${res.status}${hint}: ${detail}`)
}

/** Rough token estimate (≈4 chars/token) when a provider doesn't report usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
