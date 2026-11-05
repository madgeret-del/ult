import { app, BrowserWindow } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { registerIpc, demoSend, demoApprove, setWorkspace } from './ipc.ts'

const dirname = path.dirname(fileURLToPath(import.meta.url))

let win: BrowserWindow | null = null

function createWindow(): void {
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  const iconPath = isDev ? path.join(app.getAppPath(), 'build/icon.ico') : undefined

  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 880,
    minHeight: 600,
    backgroundColor: '#0b0e14',
    show: false,
    ...(iconPath ? { icon: iconPath } : {}),
    title: 'ult',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false
    }
  })

  win.once('ready-to-show', () => win?.show())

  win.on('closed', () => {
    win = null
  })

  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  if (isDev) {
    void win.loadURL(process.env.ELECTRON_RENDERER_URL!)
    if (process.env.ULT_DEVTOOLS) win.webContents.openDevTools()
  } else {
    void win.loadFile(path.join(dirname, '../renderer/index.html'))
  }

  if (process.env.ULT_LOG_EVENTS) {
    win.webContents.on('console-message', (_e, level, message, line, source) => {
      console.log(`[renderer:${level}] ${message} (${source}:${line})`)
    })
  }

  registerIpc(win)
  scheduleAutomation(win)
}

// ---------- screenshot / demo automation (dev + verification only) ----------

function scheduleAutomation(w: BrowserWindow): void {
  const shots = (process.env.ULT_SCREENSHOT ?? '').split('|').filter(Boolean)
  if (!shots.length) return
  const demo = process.env.ULT_DEMO === '1'
  const quit = process.env.ULT_QUIT === '1'
  const approve = process.env.ULT_APPROVE === '1'
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

  async function capture(file: string): Promise<void> {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const img = await w.webContents.capturePage()
        const png = img.toPNG()
        if (png.length > 0) {
          fs.writeFileSync(file, png)
          console.log(`[ult] screenshot: ${file}`)
          return
        }
      } catch (e) {
        console.error('[ult] capture failed:', e)
      }
      await sleep(500)
    }
    console.error('[ult] capture gave up:', file)
  }

  void (async () => {
    // wait for the renderer to actually be up before capturing / sending
    await new Promise<void>((resolve) => {
      if (w.webContents.isLoading()) {
        w.webContents.once('did-finish-load', () => resolve())
      } else {
        resolve()
      }
    })
    await sleep(1200)
    await capture(shots[0])
    if (demo && shots[1]) {
      setWorkspace(process.cwd())
      demoSend('Show me what you can do 👀')
      await sleep(4000)
      await capture(shots[1])
      await sleep(3500) // mock provider asks approval for write_file by now
      if (shots[2]) await capture(shots[2])
      if (approve && shots[3]) {
        demoApprove()
        await sleep(6000) // mock finishes the demo turn
        await capture(shots[3])
      }
    }
    if (quit) app.quit()
  })()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  void app.whenReady().then(createWindow)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}

app.on('window-all-closed', () => {
  app.quit()
})
