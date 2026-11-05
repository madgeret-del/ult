// glob / grep — workspace-scoped search tools.

import fs from 'node:fs'
import type { ToolFn } from '../../types.ts'
import { jailPath, walk, globToRegExp, looksBinary, toRel } from '../../util/fsutil.ts'
import { ToolError } from './util.ts'

const MAX_RESULTS = 500

export const glob: ToolFn = async (args, ctx) => {
  const pattern = String(args.pattern ?? '')
  if (!pattern) throw new ToolError('glob: "pattern" is required (e.g. "src/**/*.ts")')
  const sub = String(args.path ?? '.')
  const rootAbs = jailPath(ctx.workspace, sub)
  if (!rootAbs) throw new ToolError(`glob: path "${sub}" is outside the workspace`)

  const re = globToRegExp(pattern)
  const all = walk(rootAbs)
  const hits = all.filter((e) => re.test(e.rel)).slice(0, MAX_RESULTS)
  if (!hits.length) return { ok: true, output: `no files matching "${pattern}" (scanned ${all.length} files)` }
  return {
    ok: true,
    output: `${hits.length}${all.filter((e) => re.test(e.rel)).length > MAX_RESULTS ? '+' : ''} file(s):\n${hits
      .map((h) => h.rel)
      .join('\n')}`
  }
}

const TEXT_LIMIT = 2 * 1024 * 1024

export const grep: ToolFn = async (args, ctx) => {
  const pattern = String(args.pattern ?? '')
  if (!pattern) throw new ToolError('grep: "pattern" is required (regex)')
  const sub = String(args.path ?? '.')
  const include = args.glob === undefined ? undefined : String(args.glob)
  const caseSensitive = args.case_sensitive === true

  let re: RegExp
  try {
    re = new RegExp(pattern, caseSensitive ? '' : 'i')
  } catch (e) {
    throw new ToolError(`grep: invalid regex: ${(e as Error).message}`)
  }
  const rootAbs = jailPath(ctx.workspace, sub)
  if (!rootAbs) throw new ToolError(`grep: path "${sub}" is outside the workspace`)

  const includeRe = include ? globToRegExp(include) : null
  const files = walk(rootAbs).filter((f) => f.size <= TEXT_LIMIT && (!includeRe || includeRe.test(f.rel)))

  const out: string[] = []
  let truncated = false
  for (const f of files) {
    if (out.length >= 300) {
      truncated = true
      break
    }
    let text: string
    try {
      const buf = fs.readFileSync(f.abs)
      if (looksBinary(buf)) continue
      text = buf.toString('utf8')
    } catch {
      continue
    }
    const lines = text.replace(/\r\n/g, '\n').split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (re.test(lines[i])) {
        const snippet = lines[i].trim().slice(0, 240)
        out.push(`${toRel(ctx.workspace, f.abs)}:${i + 1}: ${snippet}`)
        if (out.length >= 300) {
          truncated = true
          break
        }
      }
    }
  }
  if (!out.length) return { ok: true, output: `no matches for /${pattern}/` }
  return {
    ok: true,
    output: `${out.length}${truncated ? '+' : ''} match(es):\n${out.join('\n')}`
  }
}
