// Provider presets and client factory.

import type { ProviderClient } from '../types.ts'
import { openaiCompatClient } from './openai-compat.ts'
import { anthropicClient } from './anthropic.ts'
import { mockClient } from './mock.ts'

export interface ProviderPreset {
  id: string
  label: string
  kind: 'openai' | 'anthropic' | 'mock'
  baseUrl: string
  models: string[]
  needsKey: boolean
  envKey?: string
  note?: string
}

export const PRESETS: ProviderPreset[] = [
  { id: 'mock', label: 'Mock — demo, no key needed', kind: 'mock', baseUrl: '', models: ['mock-1'], needsKey: false },
  {
    id: 'zai',
    label: 'Z.ai (GLM)',
    kind: 'openai',
    baseUrl: 'https://api.z.ai/api/paas/v4',
    models: ['glm-4.6', 'glm-4.5-air', 'glm-4.5-flash'],
    needsKey: true,
    envKey: 'ZAI_API_KEY',
    note: 'Keys: https://z.ai/manage-api-key/apikey-list'
  },
  {
    id: 'zai-coding',
    label: 'Z.ai Coding Plan (GLM)',
    kind: 'openai',
    baseUrl: 'https://api.z.ai/api/coding/paas/v4',
    models: ['glm-4.6', 'glm-4.5'],
    needsKey: true,
    envKey: 'ZAI_API_KEY',
    note: 'Uses your GLM Coding Plan subscription key'
  },
  {
    id: 'anthropic',
    label: 'Anthropic (Claude)',
    kind: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    models: ['claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-opus-4-1'],
    needsKey: true,
    envKey: 'ANTHROPIC_API_KEY'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    kind: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-5.1', 'gpt-5', 'gpt-4.1', 'gpt-4o-mini'],
    needsKey: true,
    envKey: 'OPENAI_API_KEY'
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    kind: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: ['openrouter/auto', 'anthropic/claude-sonnet-4.5', 'openai/gpt-5.1', 'deepseek/deepseek-chat-v3.1'],
    needsKey: true,
    envKey: 'OPENROUTER_API_KEY'
  },
  {
    id: 'deepseek',
    label: 'DeepSeek',
    kind: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    needsKey: true,
    envKey: 'DEEPSEEK_API_KEY'
  },
  {
    id: 'kimi',
    label: 'Moonshot (Kimi)',
    kind: 'openai',
    baseUrl: 'https://api.moonshot.ai/v1',
    models: ['kimi-k2-0905-preview', 'moonshot-v1-128k'],
    needsKey: true,
    envKey: 'MOONSHOT_API_KEY'
  },
  {
    id: 'groq',
    label: 'Groq',
    kind: 'openai',
    baseUrl: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile', 'qwen/qwen3-32b'],
    needsKey: true,
    envKey: 'GROQ_API_KEY'
  },
  {
    id: 'ollama',
    label: 'Ollama (local)',
    kind: 'openai',
    baseUrl: 'http://localhost:11434/v1',
    models: ['qwen2.5-coder:7b', 'llama3.2'],
    needsKey: false,
    note: 'Run `OLLAMA_ORIGINS=* ollama serve` first'
  }
]

export function presetById(id: string, custom: ProviderPreset[] = []): ProviderPreset | undefined {
  return [...PRESETS, ...custom].find((p) => p.id === id)
}

export function makeClient(preset: ProviderPreset): ProviderClient {
  if (preset.kind === 'mock') return mockClient()
  if (preset.kind === 'anthropic') return anthropicClient(preset.baseUrl, preset.label)
  return openaiCompatClient(preset.baseUrl, preset.label)
}
