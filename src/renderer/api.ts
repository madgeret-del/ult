// Typed bridge to the main process.

export interface UltBridge {
  invoke(channel: string, payload?: unknown): Promise<any>
  onEvent(cb: (ev: any) => void): () => void
}

declare global {
  interface Window {
    ult: UltBridge
  }
}

export const bridge = (): UltBridge => window.ult
