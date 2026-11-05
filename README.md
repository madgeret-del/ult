# ult.

**ULT — a desktop AI coding agent for Windows.**

ult is a sleek Electron + React app that puts an agentic coding assistant on your desktop:
streaming chat, real file tools (read / write / edit / glob / grep / shell), an approval flow
with diff previews, sessions, themes, and multi-provider support — all local, no middleman.

![ult](build/icon.png)

## Highlights

- **Streaming chat** with markdown, syntax-highlighted code blocks and copy buttons
- **Agent tools** — `read_file`, `write_file`, `edit_file`, `glob`, `grep`, `run_command`
- **Approval flow** — every write/edit/command shows a colored diff (or the command) before it runs:
  **Allow once / Always this session / Deny** (keyboard: `A` / `S` / `D` / `Esc`)
- **Workspace jail** — file tools can't touch anything outside the folder you pick
- **Multi-provider** out of the box, via OpenAI-compatible *or* Anthropic protocols:

  | Provider | Notes |
  | --- | --- |
  | Z.ai (GLM) | pay-as-you-go + Coding Plan endpoints |
  | Anthropic (Claude) | |
  | OpenAI | |
  | OpenRouter | any model on the router |
  | DeepSeek, Moonshot (Kimi), Groq | |
  | Ollama | fully local, no key needed |
  | Custom | any base URL, OpenAI-compatible or Anthropic |
  | **Mock** | built-in scripted demo — works with zero setup |

- **Sessions** — persisted per workspace, resume / rename / delete from the sidebar
- **AGENTS.md support** — dropped in your workspace root, it's injected into the system prompt
- **Slash commands** — `/help` `/new` `/model` `/provider` `/theme` `/tools`
- **Themes** — midnight (default), carbon, synthwave, solar — switched live
- **Token counter** in the status bar; **Esc** stops a running turn at any point
- **API keys** are encrypted at rest with DPAPI (Electron `safeStorage`)

## Quick start

### Use it (installer)

1. Run `release/ult-setup-0.1.0.exe` and follow the wizard
2. Launch **ult** — the **Mock** provider works immediately for a demo
3. Open **⚙ Settings**, pick a real provider, paste an API key
4. Pick a workspace folder (top-left), ask for something, approve the changes

### Develop it

```bash
npm install        # if electron's postinstall is blocked: node node_modules/electron/install.js
npm run dev        # dev app with HMR
npm run typecheck  # tsc
npm run smoke      # engine smoke test (no keys needed)
npm run dist       # build NSIS installer -> release/ult-setup-<version>.exe
```

Dev-only env flags:

| Flag | Effect |
| --- | --- |
| `ULT_DEVTOOLS=1` (with `npm run dev`) | open DevTools |
| `ULT_LOG_EVENTS=1` | log agent IPC events to stdout |
| `ULT_SCREENSHOT=a.png\|b.png` | capture window screenshots for CI/manual verification |
| `ULT_DEMO=1` + `ULT_APPROVE=1` | scripted demo conversation with auto-approval |

## How it works

```
┌────────────┐  IPC (contextBridge)  ┌─────────────────────────────┐
│  Renderer  │ ◄───────────────────► │  Main process               │
│  React UI  │   invoke + events     │  • providers (SSE streaming)│
│  themes,   │                       │  • agent loop               │
│  markdown, │                       │  • tools (fs / shell)       │
│  approvals │                       │  • sessions (userData)      │
└────────────┘                       └─────────────────────────────┘
```

- The agent engine (`src/main/agent`, `src/main/providers`, `src/main/sessions.ts`, `src/main/config.ts`)
  is **Electron-free** — importable from plain Node, which is what `npm run smoke` exercises.
- Every tool call that mutates your disk or runs a command goes through the approval gate
  (`src/main/agent/tools/registry.ts` → `requestApproval`).
- The renderer is sandboxed: `contextIsolation: true`, `nodeIntegration: false`.

## Configuration

Stored in `%APPDATA%/ult/config.json` — keys are DPAPI-encrypted (`enc:b64:…`).
Environment fallbacks: `ZAI_API_KEY`, `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`,
`OPENROUTER_API_KEY`, `DEEPSEEK_API_KEY`, `MOONSHOT_API_KEY`, `GROQ_API_KEY`.

Sessions live in `%APPDATA%/ult/sessions/*.json`.

## Security notes

- File tools resolve and jail every path against the workspace root
- `run_command` spawns with a timeout (default 120s, max 600s), kills the process tree on stop,
  and caps captured output
- Approvals are session-scoped: "Always this session" is forgotten when the app restarts
- The bundled **Mock** provider never touches the network

## Roadmap ideas

Plan mode · todo tracking · @-file mentions · diff-revert per tool call · MCP tool plugins
