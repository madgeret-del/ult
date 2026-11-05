// Minimal line diff (LCS based) used for approval previews and tool output.

export interface DiffLine {
  type: 'ctx' | 'add' | 'del'
  text: string
  a?: number // line number in `before` (1-based)
  b?: number // line number in `after` (1-based)
}

const MAX_LCS_LINES = 4000

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.length ? before.replace(/\r\n/g, '\n').split('\n') : []
  const b = after.length ? after.replace(/\r\n/g, '\n').split('\n') : []

  if (a.length > MAX_LCS_LINES || b.length > MAX_LCS_LINES) {
    // Too big for LCS — render as a full replace, trimmed.
    const out: DiffLine[] = []
    a.forEach((t, i) => out.push({ type: 'del', text: t, a: i + 1 }))
    b.forEach((t, i) => out.push({ type: 'add', text: t, b: i + 1 }))
    return out
  }

  const n = a.length
  const m = b.length
  // DP table of LCS lengths
  const dp: Uint32Array[] = []
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'ctx', text: a[i], a: i + 1, b: j + 1 })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', text: a[i], a: i + 1 })
      i++
    } else {
      out.push({ type: 'add', text: b[j], b: j + 1 })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', text: a[i], a: ++i })
  while (j < m) out.push({ type: 'add', text: b[j], b: ++j })
  return out
}

/** Keep only hunks (context 3 lines) that contain changes; cap output. */
export function trimDiffToHunks(lines: DiffLine[], maxHunkLines = 200): DiffLine[] {
  const hasChange = lines.some((l) => l.type !== 'ctx')
  if (!hasChange) return []
  const keep = new Array<boolean>(lines.length).fill(false)
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].type !== 'ctx') {
      for (let k = Math.max(0, i - 3); k <= Math.min(lines.length - 1, i + 3); k++) keep[k] = true
    }
  }
  const out: DiffLine[] = []
  let gap = false
  for (let i = 0; i < lines.length; i++) {
    if (keep[i]) {
      if (gap) out.push({ type: 'ctx', text: '…' })
      gap = false
      out.push(lines[i])
    } else {
      gap = keep[i - 1] ?? false
    }
  }
  if (out.length > maxHunkLines) {
    const head = out.slice(0, maxHunkLines)
    head.push({ type: 'ctx', text: `… (${out.length - maxHunkLines} more lines)` })
    return head
  }
  return out
}

export function formatDiffText(lines: DiffLine[]): string {
  return lines.map((l) => (l.type === 'add' ? `+ ${l.text}` : l.type === 'del' ? `- ${l.text}` : `  ${l.text}`)).join('\n')
}
