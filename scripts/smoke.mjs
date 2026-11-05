// Engine smoke test — runs the real agent loop with the mock provider in a temp workspace.
// No Electron, no network, no API keys needed.

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runAgent } from '../src/main/agent/loop.ts'
import { mockClient } from '../src/main/providers/mock.ts'
import { TOOLS, executeTool } from '../src/main/agent/tools/registry.ts'
import { buildSystemPrompt } from '../src/main/agent/prompt.ts'
import { createSession, saveSession, loadSession, listSessions, autoTitle } from '../src/main/sessions.ts'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ult-smoke-'))
const failures = []

function check(name, cond, extra = '') {
  if (cond) {
    console.log(`  ✓ ${name}`)
  } else {
    failures.push(name)
    console.log(`  ✗ ${name} ${extra}`)
  }
}

// ---------- 1. direct tool checks ----------
console.log('tools:')
fs.writeFileSync(path.join(tmp, 'hello.txt'), 'alpha\nbeta\ngamma\n')

let r = await executeTool('read_file', { path: 'hello.txt' }, { workspace: tmp, signal: new AbortController().signal })
check('read_file ok', r.ok && r.output.includes('1| alpha') && r.output.includes('3| gamma'), r.output)

r = await executeTool('read_file', { path: '../outside.txt' }, { workspace: tmp, signal: new AbortController().signal })
check('read_file jailed', !r.ok && r.output.includes('outside the workspace'), r.output)

r = await executeTool('write_file', { path: 'sub/deep/new.md', content: '# hi\n' }, { workspace: tmp, signal: new AbortController().signal })
check('write_file creates dirs', r.ok && fs.existsSync(path.join(tmp, 'sub', 'deep', 'new.md')), r.output)

r = await executeTool('edit_file', { path: 'hello.txt', old_string: 'beta', new_string: 'BETA' }, { workspace: tmp, signal: new AbortController().signal })
check('edit_file replaces', r.ok && fs.readFileSync(path.join(tmp, 'hello.txt'), 'utf8').includes('BETA'), r.output)

r = await executeTool('edit_file', { path: 'hello.txt', old_string: 'nope-not-there', new_string: 'x' }, { workspace: tmp, signal: new AbortController().signal })
check('edit_file not-found error', !r.ok && r.output.includes('not found'), r.output)

r = await executeTool('glob', { pattern: '**/*.txt' }, { workspace: tmp, signal: new AbortController().signal })
check('glob finds hello.txt', r.ok && r.output.includes('hello.txt'), r.output)

r = await executeTool('grep', { pattern: 'BETA', path: '.' }, { workspace: tmp, signal: new AbortController().signal })
check('grep finds BETA', r.ok && r.output.includes('hello.txt:2: BETA'), r.output)

r = await executeTool('run_command', { command: process.platform === 'win32' ? 'echo smoke-ok' : 'echo smoke-ok' }, { workspace: tmp, signal: new AbortController().signal })
check('run_command echoes', r.ok && r.output.includes('smoke-ok'), JSON.stringify(r.output))

r = await executeTool('definitely_not_a_tool', {}, { workspace: tmp, signal: new AbortController().signal })
check('unknown tool handled', !r.ok && r.output.includes('unknown tool'), r.output)

// ---------- 2. agent loop with mock provider ----------
console.log('agent loop:')
const events = []
const session = createSession(tmp, tmp, 'mock', 'mock-1')
session.messages.push({ id: 'u1', role: 'user', content: 'Show me what you can do' })
const approved = []
const result = await runAgent({
  sessionId: session.id,
  client: mockClient(),
  model: 'mock-1',
  system: buildSystemPrompt(tmp),
  messages: session.messages,
  tools: TOOLS,
  workspace: tmp,
  onEvent: (ev) => events.push(ev),
  requestApproval: async (call) => {
    approved.push(call.name)
    return 'once'
  },
  alwaysAllowed: new Set(),
  signal: new AbortController().signal
})

check('loop completed without error', !result.error, result.error ?? '')
check('assistant produced text', events.some((e) => e.type === 'delta' && e.text), '')
check('mock asked approval for write_file', approved.includes('write_file'), '')
const toolEnd = events.find((e) => e.type === 'tool_end')
check('write_file executed ok', toolEnd && toolEnd.ok, toolEnd ? toolEnd.result : 'no tool_end')
check('demo file written', fs.existsSync(path.join(tmp, 'demo-ult.md')), '')
check('usage tokens reported', result.inTokens > 0 && result.outTokens > 0, `${result.inTokens}/${result.outTokens}`)
check('tool result fed back to model', session.messages.some((m) => m.role === 'tool' && m.content.includes('created demo-ult.md')), '')

// ---------- 3. sessions ----------
console.log('sessions:')
autoTitle(session)
saveSession(tmp, session)
const loaded = loadSession(tmp, session.id)
check('session save/load roundtrip', loaded && loaded.id === session.id && loaded.messages.length === session.messages.length, '')
check('auto title set', loaded && loaded.title === 'Show me what you can do', loaded?.title)
const metas = listSessions(tmp, tmp)
check('listSessions finds it', metas.length === 1 && metas[0].messageCount === session.messages.length, '')
check('listSessions filters other workspaces', listSessions(tmp, path.join(tmp, 'elsewhere')).length === 0, '')

// cleanup
fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`\nSMOKE FAILED: ${failures.length} check(s)`)
  process.exit(1)
} else {
  console.log('\nSMOKE OK — all checks passed')
}
