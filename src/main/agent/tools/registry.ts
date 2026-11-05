// Tool registry: definitions (sent to the model), implementations, and approval previews.

import type { ToolCall, ToolContext, ToolDef, ToolFn, ToolResult } from '../../types.ts'
import { read_file, write_file, edit_file, planEdit, planWrite, diffPreview } from './files.ts'
import { glob, grep } from './search.ts'
import { run_command } from './shell.ts'
import { ToolError } from './util.ts'
import fs from 'node:fs'
import { jailPath, toRel } from '../../util/fsutil.ts'

export const TOOLS: ToolDef[] = [
  {
    name: 'read_file',
    description: 'Read a text file from the workspace. Returns numbered lines. Use offset/limit for big files.',
    params: [
      { name: 'path', type: 'string', description: 'File path relative to the workspace root', required: true },
      { name: 'offset', type: 'number', description: '1-based first line to read (default 1)' },
      { name: 'limit', type: 'number', description: 'Max lines to read (default 2000)' }
    ],
    danger: 'safe'
  },
  {
    name: 'write_file',
    description: 'Create or overwrite a file with the given content. Parent directories are created automatically.',
    params: [
      { name: 'path', type: 'string', description: 'File path relative to the workspace root', required: true },
      { name: 'content', type: 'string', description: 'Full file content to write', required: true }
    ],
    danger: 'ask'
  },
  {
    name: 'edit_file',
    description:
      'Replace an exact string in an existing file. old_string must match exactly once unless replace_all is true. Always read the file first.',
    params: [
      { name: 'path', type: 'string', description: 'File path relative to the workspace root', required: true },
      { name: 'old_string', type: 'string', description: 'Exact text to replace', required: true },
      { name: 'new_string', type: 'string', description: 'Replacement text', required: true },
      { name: 'replace_all', type: 'boolean', description: 'Replace every occurrence (default false)' }
    ],
    danger: 'ask'
  },
  {
    name: 'glob',
    description: 'List files matching a glob pattern (supports **, *, ?), e.g. "src/**/*.ts".',
    params: [
      { name: 'pattern', type: 'string', description: 'Glob pattern relative to the workspace root', required: true },
      { name: 'path', type: 'string', description: 'Sub-directory to scan (default workspace root)' }
    ],
    danger: 'safe'
  },
  {
    name: 'grep',
    description: 'Search file contents with a case-insensitive regex. Returns file:line: snippet.',
    params: [
      { name: 'pattern', type: 'string', description: 'Regular expression to search for', required: true },
      { name: 'path', type: 'string', description: 'Sub-directory to scan (default workspace root)' },
      { name: 'glob', type: 'string', description: 'Only search files matching this glob, e.g. "*.ts"' },
      { name: 'case_sensitive', type: 'boolean', description: 'Case-sensitive search (default false)' }
    ],
    danger: 'safe'
  },
  {
    name: 'run_command',
    description: 'Run a shell command in the workspace root (cmd.exe on Windows). Use for builds, tests, git, etc.',
    params: [
      { name: 'command', type: 'string', description: 'The command line to run', required: true },
      { name: 'timeout_sec', type: 'number', description: 'Timeout in seconds (default 120, max 600)' }
    ],
    danger: 'ask'
  }
]

const TOOL_FNS: Record<string, ToolFn> = {
  read_file,
  write_file,
  edit_file,
  glob,
  grep,
  run_command
}

export function toolByName(name: string): ToolDef | undefined {
  return TOOLS.find((t) => t.name === name)
}

export function paramsToSchema(def: ToolDef): Record<string, unknown> {
  const properties: Record<string, unknown> = {}
  const required: string[] = []
  for (const p of def.params) {
    properties[p.name] = { type: p.type, description: p.description }
    if (p.required) required.push(p.name)
  }
  return { type: 'object', properties, required }
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
  const fn = TOOL_FNS[name]
  if (!fn) return { ok: false, output: `unknown tool: ${name}` }
  try {
    return await fn(args, ctx)
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, output: e.message }
    return { ok: false, output: `${name} failed: ${(e as Error).message}` }
  }
}

/**
 * Human-readable preview of what a tool call would do, for the approval dialog.
 * Throws ToolError when the call is invalid (the loop fails it fast without asking).
 */
export function buildPreview(name: string, args: Record<string, unknown>, workspace: string): string | undefined {
  if (name === 'write_file') {
    const plan = planWrite(workspace, String(args.path ?? ''), String(args.content ?? ''))
    return diffPreview(plan.before, plan.after)
  }
  if (name === 'edit_file') {
    const plan = planEdit(
      workspace,
      String(args.path ?? ''),
      String(args.old_string ?? ''),
      String(args.new_string ?? ''),
      args.replace_all === true
    )
    return diffPreview(plan.before, plan.after)
  }
  if (name === 'run_command') {
    return String(args.command ?? '')
  }
  return undefined
}

/** Summary line for tool cards (collapsed state). */
export function argSummary(name: string, args: Record<string, unknown>, workspace: string): string {
  const s = (v: unknown, n = 60): string => {
    const t = String(v ?? '')
    return t.length > n ? t.slice(0, n) + '…' : t
  }
  switch (name) {
    case 'read_file':
      return `${s(args.path)}${args.offset ? ` (from line ${args.offset})` : ''}`
    case 'write_file':
      return `${args.path ? toRel(workspace, jailPath(workspace, String(args.path)) || String(args.path)) : '?'} · ${
        String(args.content ?? '').split('\n').length
      } lines`
    case 'edit_file':
      return `${s(args.path)} · "${s(args.old_string, 40)}" → "${s(args.new_string, 40)}"`
    case 'glob':
      return s(args.pattern)
    case 'grep':
      return `/${s(args.pattern, 48)}/${args.glob ? ` in ${s(args.glob)}` : ''}`
    case 'run_command':
      return s(args.command, 100)
    default:
      return JSON.stringify(args).slice(0, 120)
  }
}

/** Whether a tool name is auto-approved for this session (policy) — safe tools never need approval. */
export function needsApproval(name: string, alwaysAllowed: Set<string>): boolean {
  const def = toolByName(name)
  if (!def) return false
  return def.danger === 'ask' && !alwaysAllowed.has(name)
}

export function fileExistsInWorkspace(workspace: string, rel: string): boolean {
  const abs = jailPath(workspace, rel)
  return !!abs && fs.existsSync(abs)
}
