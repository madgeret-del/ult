// run_command — spawn a shell command inside the workspace, capture output.

import { exec } from 'node:child_process'
import type { ToolFn } from '../../types.ts'
import { ToolError } from './util.ts'

const DEFAULT_TIMEOUT = 120
const MAX_TIMEOUT = 600
const MAX_OUTPUT = 100 * 1024

function truncateMiddle(s: string, max = MAX_OUTPUT): string {
  if (s.length <= max) return s
  const half = Math.floor((max - 20) / 2)
  return `${s.slice(0, half)}\n… (${s.length - max} chars hidden) …\n${s.slice(s.length - half)}`
}

function killTree(pid: number): void {
  if (process.platform === 'win32') {
    try {
      exec(`taskkill /pid ${pid} /T /F`, { windowsHide: true })
    } catch {
      /* best effort */
    }
  } else {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        /* already gone */
      }
    }
  }
}

export const run_command: ToolFn = async (args, ctx) => {
  const command = String(args.command ?? '').trim()
  if (!command) throw new ToolError('run_command: "command" is required')
  const timeoutSec = Math.min(MAX_TIMEOUT, Math.max(1, Number(args.timeout_sec ?? DEFAULT_TIMEOUT) || DEFAULT_TIMEOUT))

  const isWin = process.platform === 'win32'
  const shellCmd = isWin ? `cmd.exe /c ${JSON.stringify(command)}` : command

  return new Promise((resolve) => {
    const child = exec(
      shellCmd,
      {
        cwd: ctx.workspace,
        timeout: timeoutSec * 1000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
        env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' }
      },
      (err, stdout, stderr) => {
        const out = truncateMiddle(String(stdout ?? ''))
        const errOut = truncateMiddle(String(stderr ?? ''))
        const code = err && typeof (err as NodeJS.ErrnoException & { code?: number }).code === 'number' ? (err as unknown as { code: number }).code : err ? 1 : 0
        const timedOut = (err as { killed?: boolean } | null | undefined)?.killed === true
        if (ctx.signal.aborted) {
          if (child.pid) killTree(child.pid)
          resolve({ ok: false, output: 'run_command: aborted by user' })
          return
        }
        const sections: string[] = []
        if (timedOut) sections.push(`(timed out after ${timeoutSec}s, process killed)`)
        if (out) sections.push(`stdout:\n${out}`)
        if (errOut) sections.push(`stderr:\n${errOut}`)
        if (!out && !errOut) sections.push('(no output)')
        resolve({
          ok: code === 0 && !timedOut,
          output: `exit code: ${timedOut ? 'timeout' : code}\n${sections.join('\n')}`
        })
      }
    )
    const onAbort = () => {
      if (child.pid) killTree(child.pid)
    }
    ctx.signal.addEventListener('abort', onAbort, { once: true })
    child.on('close', () => ctx.signal.removeEventListener('abort', onAbort))
  })
}
