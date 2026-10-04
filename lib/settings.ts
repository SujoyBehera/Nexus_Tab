import { browser } from 'wxt/browser';
import type { Config, LlmSettings, ProviderId } from './types';

export const PROVIDERS: Record<
  ProviderId,
  { label: string; baseUrl: string; model: string; needsKey: boolean; hint: string }
> = {
  gemini: {
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    model: 'gemini-3.5-flash-lite',
    needsKey: true,
    hint: 'Free key at aistudio.google.com/apikey',
  },
  openai: {
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsKey: true,
    hint: 'platform.openai.com/api-keys',
  },
  anthropic: {
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-5',
    needsKey: true,
    hint: 'console.anthropic.com/settings/keys',
  },
  ollama: {
    label: 'Ollama (local)',
    baseUrl: 'http://localhost:11434/v1',
    model: 'llama3.1',
    needsKey: false,
    hint: 'Run Ollama with OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*',
  },
  openrouter: {
    label: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'google/gemini-2.5-flash',
    needsKey: true,
    hint: 'openrouter.ai/keys',
  },
  groq: {
    label: 'Groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'llama-3.1-8b-instant',
    needsKey: true,
    hint: 'console.groq.com/keys',
  },
};

export function defaultConfig(): Config {
  const profiles = {} as Config['profiles'];
  (Object.keys(PROVIDERS) as ProviderId[]).forEach((id) => {
    profiles[id] = {
      model: PROVIDERS[id].model,
      apiKey: '',
      baseUrl: PROVIDERS[id].baseUrl,
    };
  });
  return { provider: 'gemini', profiles, requireApproval: true, maxSteps: 15 };
}

export async function loadConfig(): Promise<Config> {
  const base = defaultConfig();
  const stored = (await browser.storage.local.get('config')).config as
    | Partial<Config>
    | undefined;
  if (!stored) return base;
  const profiles = { ...base.profiles };
  (Object.keys(profiles) as ProviderId[]).forEach((id) => {
    profiles[id] = { ...profiles[id], ...(stored.profiles?.[id] ?? {}) };
  });
  return {
    provider: stored.provider ?? base.provider,
    profiles,
    requireApproval: stored.requireApproval ?? base.requireApproval,
    maxSteps: stored.maxSteps ?? base.maxSteps,
  };
}

export async function saveConfig(config: Config): Promise<void> {
  await browser.storage.local.set({ config });
}

export function resolveLlm(config: Config): LlmSettings {
  return { provider: config.provider, ...config.profiles[config.provider] };
}
