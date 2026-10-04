export type Mode = 'ask' | 'act' | 'dev';

export type ProviderId =
  | 'gemini'
  | 'openai'
  | 'anthropic'
  | 'ollama'
  | 'openrouter'
  | 'groq';

export interface Profile {
  model: string;
  apiKey: string;
  baseUrl: string;
}

export interface Config {
  provider: ProviderId;
  profiles: Record<ProviderId, Profile>;
  requireApproval: boolean;
  maxSteps: number;
}

/** Resolved settings handed to the LLM client. */
export interface LlmSettings extends Profile {
  provider: ProviderId;
}

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
}

export interface ElementInfo {
  i: number;
  role: string;
  type?: string;
  label: string;
  value?: string;
  href?: string;
  extra?: string;
}

export interface Snapshot {
  url: string;
  title: string;
  elements: ElementInfo[];
  /** Compact, model-ready element list: one line per element. */
  lines: string;
  /** Short digest of visible page text. */
  text: string;
  scrollY: number;
  scrollMax: number;
}

export type PageAction =
  | { type: 'click'; index: number }
  | { type: 'type'; index: number; text: string; clear?: boolean; submit?: boolean }
  | { type: 'select'; index: number; option: string }
  | { type: 'press'; key: string; index?: number }
  | { type: 'scroll'; direction: 'up' | 'down' | 'top' | 'bottom' };

export interface ActionResult {
  ok: boolean;
  note?: string;
  error?: string;
}

export interface LogEntry {
  kind: 'console.error' | 'console.warn' | 'error' | 'rejection' | 'fetch' | 'xhr';
  text: string;
  t: number;
}

/** Messages: background -> content script. */
export type ContentRequest =
  | { kind: 'ping' }
  | { kind: 'snapshot' }
  | { kind: 'page'; max: number }
  | { kind: 'dev'; max: number }
  | { kind: 'tables' }
  | { kind: 'act'; action: PageAction };

/**
 * One recorded step. Elements are described by role + visible label (not by
 * index), so a macro can find them again on a later visit to the page.
 */
export interface MacroStep {
  type: 'click' | 'type' | 'select' | 'press' | 'scroll' | 'navigate';
  role?: string;
  label?: string;
  text?: string;
  submit?: boolean;
  option?: string;
  key?: string;
  direction?: 'up' | 'down' | 'top' | 'bottom';
  url?: string;
}

export interface Macro {
  id: string;
  name: string;
  goal: string;
  startUrl: string;
  steps: MacroStep[];
  created: number;
}

export type ExecutionState = 'idle' | 'thinking' | 'executing' | 'paused' | 'aborted';

/** Messages: side panel -> background. */
export type PanelToBg =
  | { type: 'run'; mode: Mode; prompt: string; history: ChatMsg[]; tabId: number }
  | { type: 'replay'; macro: Macro; tabId: number }
  | { type: 'tables'; tabId: number }
  | { type: 'stop' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'approve'; id: number; ok: boolean }
  | { type: 'apply'; key: string; tabId: number; lang: string; code: string }
  | { type: 'undo'; key: string };

export type StepStatus = 'running' | 'ok' | 'error' | 'denied';

/** Messages: background -> side panel. */
export type BgToPanel =
  | { type: 'token'; text: string }
  | {
      type: 'step';
      id: number;
      text: string;
      status: StepStatus;
      thought?: string;
      action?: string;
      target?: string;
      timestamp?: number;
    }
  | { type: 'approval'; id: number; text: string }
  | { type: 'macro'; goal: string; startUrl: string; steps: MacroStep[] }
  | { type: 'tables'; csv: string; count: number; error?: string }
  | { type: 'applied'; key: string; ok: boolean; message: string }
  | { type: 'undone'; key: string; ok: boolean; message: string }
  | { type: 'done' }
  | { type: 'error'; message: string };

