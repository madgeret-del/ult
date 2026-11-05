// System prompt builder.

import fs from 'node:fs'
import path from 'node:path'
import { TOOLS } from './tools/registry.ts'
import { readTextCapped } from '../util/fsutil.ts'

const AGENTS_FILES = ['AGENTS.md', 'agents.md', 'CLAUDE.md', 'claude.md']
const AGENTS_MAX = 6000

export function findAgentsMd(workspace: string): string | undefined {
  for (const name of AGENTS_FILES) {
    const p = path.join(workspace, name)
    try {
      if (fs.statSync(p).isFile()) {
        const { text } = readTextCapped(p, AGENTS_MAX * 4)
        return text.slice(0, AGENTS_MAX)
      }
    } catch {
      /* not there */
    }
  }
  return undefined
}

function topLevelListing(workspace: string): string {
  try {
    const entries = fs.readdirSync(workspace, { withFileTypes: true })
    const names = entries
      .filter((e) => !['node_modules', '.git', 'out', 'dist', 'release'].includes(e.name) && !e.name.startsWith('.'))
      .slice(0, 40)
      .map((e) => (e.isDirectory() ? e.name + '/' : e.name))
    return names.join('  ')
  } catch {
    return '(unreadable)'
  }
}

export function buildSystemPrompt(workspace: string, agentsMd?: string): string {
  const toolLines = TOOLS.map((t) => `- ${t.name}: ${t.description}`).join('\n')
  return `You are ult, an AI coding agent working inside the ult desktop app on the user's machine.

# Environment
- Workspace root: ${workspace}
- Platform: ${process.platform} (Windows uses cmd.exe for shell commands)
- Today: ${new Date().toISOString().slice(0, 10)}
- Workspace top level: ${topLevelListing(workspace)}

# Tools
You can call these tools (schemas provided separately):
${toolLines}

# How to work
- Be concise and direct. Skip preamble and pleasantries. Show personality only briefly.
- Before editing a file, read it so your edits use exact text.
- Prefer edit_file with a unique old_string over rewriting whole files with write_file.
- Paths are relative to the workspace root; you cannot access files outside it.
- After writing code, verify when practical (run tests/builds with run_command).
- Use markdown. Put code in fenced blocks with a language tag.
- If the user asks something unrelated to code, just answer helpfully.
- Never invent tool results. If a tool fails, read the error and adjust.
- When you finish a multi-step task, end with a 1–3 sentence summary of what changed.
${agentsMd ? `\n# Project instructions (AGENTS.md)\n${agentsMd}` : ''}`
}
