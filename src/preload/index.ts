import { contextBridge, ipcRenderer } from 'electron'

const api = {
  invoke: (channel: string, payload?: unknown): Promise<unknown> => ipcRenderer.invoke(channel, payload),
  onEvent: (cb: (ev: unknown) => void): (() => void) => {
    const listener = (_e: unknown, ev: unknown): void => cb(ev)
    ipcRenderer.on('ult:event', listener as never)
    return () => ipcRenderer.removeListener('ult:event', listener as never)
  }
}

contextBridge.exposeInMainWorld('ult', api)

export type UltApi = typeof api
