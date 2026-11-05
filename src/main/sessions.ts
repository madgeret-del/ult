// Session persistence — one JSON file per session under <dir>/sessions/.

import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ChatMessage } from './types.ts'

export interface SessionData {
  id: string
  title: string
  workspace: string
  createdAt: number
  updatedAt: number
  providerId: string
  model: string
  messages: ChatMessage[]
}

export interface SessionMeta {
  id: string
  title: string
  workspace: string
  createdAt: number
  updatedAt: number
  providerId: string
  model: string
  messageCount: number
}

function sessionsDir(dir: string): string {
  const p = path.join(dir, 'sessions')
  fs.mkdirSync(p, { recursive: true })
  return p
}

function fileFor(dir: string, id: string): string {
  // id is a uuid — safe as a filename
  return path.join(sessionsDir(dir), `${id}.json`)
}

function toMeta(s: SessionData): SessionMeta {
  return {
    id: s.id,
    title: s.title,
    workspace: s.workspace,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    providerId: s.providerId,
    model: s.model,
    messageCount: s.messages.length
  }
}

export function autoTitle(s: SessionData): void {
  if (s.title !== 'New chat') return
  const firstUser = s.messages.find((m) => m.role === 'user')
  if (firstUser) {
    const t = firstUser.content.replace(/\s+/g, ' ').trim()
    s.title = t.length > 60 ? t.slice(0, 60) + '…' : t || 'New chat'
  }
}

export function listSessions(dir: string, workspace?: string): SessionMeta[] {
  const root = path.join(dir, 'sessions')
  let metas: SessionMeta[] = []
  try {
    for (const f of fs.readdirSync(root)) {
      if (!f.endsWith('.json')) continue
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(root, f), 'utf8')) as SessionData
        if (!raw?.id) continue
        if (workspace && path.resolve(raw.workspace) !== path.resolve(workspace)) continue
        metas.push(toMeta(raw))
      } catch {
        /* skip corrupt file */
      }
    }
  } catch {
    /* no sessions yet */
  }
  metas.sort((a, b) => b.updatedAt - a.updatedAt)
  return metas
}

export function createSession(dir: string, workspace: string, providerId: string, model: string): SessionData {
  const now = Date.now()
  return {
    id: randomUUID(),
    title: 'New chat',
    workspace,
    createdAt: now,
    updatedAt: now,
    providerId,
    model,
    messages: []
  }
}

export function saveSession(dir: string, s: SessionData): void {
  s.updatedAt = Date.now()
  autoTitle(s)
  fs.writeFileSync(fileFor(dir, s.id), JSON.stringify(s), 'utf8')
}

export function loadSession(dir: string, id: string): SessionData | undefined {
  try {
    const raw = JSON.parse(fs.readFileSync(fileFor(dir, id), 'utf8')) as SessionData
    if (!raw || raw.id !== id) return undefined
    return raw
  } catch {
    return undefined
  }
}

export function renameSession(dir: string, id: string, title: string): SessionMeta | undefined {
  const s = loadSession(dir, id)
  if (!s) return undefined
  s.title = title.trim() || s.title
  saveSession(dir, s)
  return toMeta(s)
}

export function deleteSession(dir: string, id: string): boolean {
  try {
    fs.rmSync(fileFor(dir, id))
    return true
  } catch {
    return false
  }
}
