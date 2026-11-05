// App configuration persisted in the user data dir. Electron-free core; the
// main process wraps apiKeys with safeStorage encryption.

import fs from 'node:fs'
import path from 'node:path'

export interface CustomProvider {
  id: string // 'custom-<slug>'
  label: string
  kind: 'openai' | 'anthropic'
  baseUrl: string
  models: string[]
  needsKey: boolean
}

export interface AppConfig {
  providerId: string
  model: string
  /** providerId -> encrypted/plain key material */
  apiKeys: Record<string, string>
  customProviders: CustomProvider[]
  theme: string
  lastWorkspace?: string
}

export const THEMES = ['midnight', 'carbon', 'synthwave', 'solar']

export function defaultConfig(): AppConfig {
  return {
    providerId: 'mock',
    model: 'mock-1',
    apiKeys: {},
    customProviders: [],
    theme: 'midnight'
  }
}

function configPath(dir: string): string {
  return path.join(dir, 'config.json')
}

export function loadConfig(dir: string): AppConfig {
  try {
    const raw = JSON.parse(fs.readFileSync(configPath(dir), 'utf8')) as Partial<AppConfig>
    return { ...defaultConfig(), ...raw, apiKeys: raw.apiKeys ?? {}, customProviders: raw.customProviders ?? [] }
  } catch {
    return defaultConfig()
  }
}

export function saveConfig(dir: string, cfg: AppConfig): void {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(configPath(dir), JSON.stringify(cfg, null, 2), 'utf8')
}
