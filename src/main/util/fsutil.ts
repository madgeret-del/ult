// Filesystem helpers: workspace jailing, capped text reading, binary sniffing.

import path from 'node:path'
import fs from 'node:fs'

/** Resolve `p` against the workspace and verify it stays inside. Returns absolute path or null. */
export function jailPath(workspace: string, p: string): string | null {
  const abs = path.isAbsolute(p) ? path.resolve(p) : path.resolve(workspace, p)
  const rel = path.relative(path.resolve(workspace), abs)
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null
  return abs
}

export function toRel(workspace: string, abs: string): string {
  const rel = path.relative(path.resolve(workspace), abs)
  return rel.split(path.sep).join('/')
}

export interface ReadCapped {
  text: string
  truncated: boolean
  size: number
}

/** Read a UTF-8 text file with a byte cap. */
export function readTextCapped(file: string, maxBytes = 512 * 1024): ReadCapped {
  const buf = fs.readFileSync(file)
  const truncated = buf.length > maxBytes
  const slice = truncated ? buf.subarray(0, maxBytes) : buf
  return { text: slice.toString('utf8').replace(/^\uFEFF/, ''), truncated, size: buf.length }
}

export function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) if (buf[i] === 0) return true
  return false
}

export const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'out',
  'build',
  'release',
  '.next',
  '.venv',
  '__pycache__',
  'target',
  '.idea',
  '.vscode'
])

export interface WalkEntry {
  abs: string
  rel: string // slash-normalized, relative to root
  size: number
}

/** Recursively walk `root`, skipping junk dirs. Depth-capped. */
export function walk(root: string, opts: { maxFiles?: number; maxDepth?: number } = {}): WalkEntry[] {
  const maxFiles = opts.maxFiles ?? 4000
  const maxDepth = opts.maxDepth ?? 12
  const out: WalkEntry[] = []
  const visit = (dir: string, depth: number) => {
    if (out.length >= maxFiles || depth > maxDepth) return
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (out.length >= maxFiles) return
      const abs = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue
        if (e.name.startsWith('.') && e.name !== '.github') continue
        visit(abs, depth + 1)
      } else if (e.isFile()) {
        let size = 0
        try {
          size = fs.statSync(abs).size
        } catch {
          /* ignore */
        }
        out.push({ abs, rel: toRel(root, abs), size })
      }
    }
  }
  visit(root, 0)
  return out
}

/**
 * Tiny glob matcher: supports `**`, `*`, `?` and literal path separators.
 * Pattern is matched against slash-normalized relative paths.
 */
export function globToRegExp(pattern: string): RegExp {
  let re = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        // `**` — any path segment(s), eats surrounding slashes
        re += '(?:.*)'
        i++
        if (pattern[i + 1] === '/') i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if ('\\^$.|+()[]{}'.includes(c)) {
      re += '\\' + c
    } else {
      re += c
    }
  }
  return new RegExp('^' + re + '$', 'i')
}

export function safeStat(file: string): fs.Stats | null {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}
