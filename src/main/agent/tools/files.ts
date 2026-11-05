// read_file / write_file / edit_file — all paths jailed to the workspace.

import fs from 'node:fs'
import path from 'node:path'
import type { ToolFn } from '../../types.ts'
import { jailPath, readTextCapped, safeStat, toRel } from '../../util/fsutil.ts'
import { diffLines, trimDiffToHunks, formatDiffText } from '../../util/diff.ts'
import { ToolError } from './util.ts'

const MAX_READ_LINES = 2000
const MAX_LINE_LEN = 2000

export const read_file: ToolFn = async (args, ctx) => {
  const p = String(args.path ?? '')
  if (!p) throw new ToolError('read_file: "path" is required')
  const abs = jailPath(ctx.workspace, p)
  if (!abs) throw new ToolError(`read_file: path "${p}" is outside the workspace`)
  const st = safeStat(abs)
  if (!st) throw new ToolError(`read_file: file not found: ${p}`)
  if (st.isDirectory()) throw new ToolError(`read_file: "${p}" is a directory (use glob or grep instead)`)

  const { text, truncated, size } = readTextCapped(abs)
  const lines = text.split('\n')
  const offset = Math.max(1, Number(args.offset ?? 1) || 1)
  const limit = Math.min(MAX_READ_LINES, Math.max(1, Number(args.limit ?? MAX_READ_LINES) || MAX_READ_LINES))
  const slice = lines.slice(offset - 1, offset - 1 + limit)

  const body = slice
    .map((l, i) => {
      const t = l.length > MAX_LINE_LEN ? l.slice(0, MAX_LINE_LEN) + ' …' : l
      return `${String(offset + i).padStart(6)}| ${t}`
    })
    .join('\n')

  const head = `${toRel(ctx.workspace, abs)} · ${lines.length} lines · ${size} bytes${truncated ? ' (truncated at 512KB)' : ''}${
    offset > 1 || slice.length < lines.length ? ` · showing ${offset}–${offset - 1 + slice.length}` : ''
  }`
  return { ok: true, output: `${head}\n${body}` }
}

export const write_file: ToolFn = async (args, ctx) => {
  const p = String(args.path ?? '')
  const content = String(args.content ?? '')
  if (!p) throw new ToolError('write_file: "path" is required')
  if (args.content === undefined) throw new ToolError('write_file: "content" is required')
  const abs = jailPath(ctx.workspace, p)
  if (!abs) throw new ToolError(`write_file: path "${p}" is outside the workspace`)

  const existed = !!safeStat(abs)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  if (ctx.signal.aborted) throw new ToolError('aborted')
  fs.writeFileSync(abs, content, 'utf8')
  const n = content ? content.replace(/\r\n/g, '\n').split('\n').length : 0
  return {
    ok: true,
    output: `${existed ? 'overwrote' : 'created'} ${toRel(ctx.workspace, abs)} (${n} lines, ${Buffer.byteLength(content)} bytes)`
  }
}

export const edit_file: ToolFn = async (args, ctx) => {
  const p = String(args.path ?? '')
  const oldStr = args.old_string === undefined ? undefined : String(args.old_string)
  const newStr = args.new_string === undefined ? undefined : String(args.new_string)
  const replaceAll = args.replace_all === true
  if (!p || oldStr === undefined || newStr === undefined) {
    throw new ToolError('edit_file: "path", "old_string" and "new_string" are required')
  }
  const abs = jailPath(ctx.workspace, p)
  if (!abs) throw new ToolError(`edit_file: path "${p}" is outside the workspace`)
  const st = safeStat(abs)
  if (!st) throw new ToolError(`edit_file: file not found: ${p}`)

  const { text } = readTextCapped(abs)
  const count = text.split(oldStr).length - 1
  if (count === 0) throw new ToolError(`edit_file: old_string not found in ${p} — copy the exact text (including whitespace) from the file`)
  if (count > 1 && !replaceAll) {
    throw new ToolError(`edit_file: old_string matches ${count} places in ${p} — include more surrounding context or pass replace_all: true`)
  }

  const updated = replaceAll ? text.split(oldStr).join(newStr) : text.replace(oldStr, newStr)
  if (ctx.signal.aborted) throw new ToolError('aborted')
  fs.writeFileSync(abs, updated, 'utf8')

  const hunks = trimDiffToHunks(diffLines(text, updated))
  const nRepl = replaceAll ? count : 1
  return {
    ok: true,
    output: `edited ${toRel(ctx.workspace, abs)} (${nRepl} replacement${nRepl === 1 ? '' : 's'})\n${formatDiffText(hunks)}`
  }
}

/** Compute the resulting file content of a write/edit without touching disk (for approval previews). */
export function planWrite(workspace: string, p: string, content: string): { abs: string; before: string; after: string } {
  const abs = jailPath(workspace, p)
  if (!abs) throw new ToolError(`write_file: path "${p}" is outside the workspace`)
  const before = safeStat(abs)?.isFile() ? readTextCapped(abs).text : ''
  return { abs, before, after: content }
}

export function planEdit(
  workspace: string,
  p: string,
  oldStr: string,
  newStr: string,
  replaceAll: boolean
): { abs: string; before: string; after: string } {
  const abs = jailPath(workspace, p)
  if (!abs) throw new ToolError(`edit_file: path "${p}" is outside the workspace`)
  if (!safeStat(abs)) throw new ToolError(`edit_file: file not found: ${p}`)
  const { text } = readTextCapped(abs)
  const count = text.split(oldStr).length - 1
  if (count === 0) throw new ToolError(`edit_file: old_string not found in ${p} — copy the exact text (including whitespace) from the file`)
  if (count > 1 && !replaceAll) {
    throw new ToolError(`edit_file: old_string matches ${count} places in ${p} — include more surrounding context or pass replace_all: true`)
  }
  const after = replaceAll ? text.split(oldStr).join(newStr) : text.replace(oldStr, newStr)
  return { abs, before: text, after }
}

/** Diff preview (trimmed) for an approval dialog, or an error string. */
export function diffPreview(before: string, after: string, maxLines = 160): string {
  const hunks = trimDiffToHunks(diffLines(before, after), maxLines)
  if (!hunks.length) return '(no textual changes)'
  let text = formatDiffText(hunks)
  const lines = text.split('\n')
  if (lines.length > maxLines) text = lines.slice(0, maxLines).join('\n') + `\n… (${lines.length - maxLines} more lines)`
  return text
}
