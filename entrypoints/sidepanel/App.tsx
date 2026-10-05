import { useEffect, useRef, useState } from 'react';
import { browser } from 'wxt/browser';
import { loadConfig, defaultConfig, PROVIDERS, saveConfig } from '@/lib/settings';
import { loadMacros, saveMacros } from '@/lib/macros';
import type {
  BgToPanel,
  ChatMsg,
  Config,
  ExecutionState,
  Macro,
  MacroStep,
  Mode,
  PanelToBg,
  ProviderId,
  StepStatus,
} from '@/lib/types';
import { RichText, type ApplyResult } from './RichText';
import Settings from './Settings';

interface Step {
  id: number;
  text: string;
  status: StepStatus;
  thought?: string;
  action?: string;
  target?: string;
  timestamp?: number;
}

interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  steps: Step[];
  streaming: boolean;
  error?: boolean;
}

interface PendingMacro {
  goal: string;
  startUrl: string;
  steps: MacroStep[];
}

const PLACEHOLDER: Record<Mode, string> = {
  ask: 'Transmit query regarding page content…',
  act: 'Issue autonomous directive for this page…',
  dev: 'Describe style modification, script, or bug…',
};

const MODEL_SHORT_NAMES: Record<ProviderId, { short: string; icon: string }> = {
  gemini: { short: 'Gemini 1.5 Flash', icon: '✦' },
  openai: { short: 'GPT-4o Mini', icon: '⚡' },
  anthropic: { short: 'Claude 3.5 Sonnet', icon: '◈' },
  ollama: { short: 'Ollama Llama 3', icon: '🦙' },
  openrouter: { short: 'OpenRouter', icon: '❖' },
  groq: { short: 'Groq Llama 3.3', icon: '⚡' },
};

const PROVIDER_NEEDS_KEY = new Set(['gemini', 'openai', 'anthropic', 'openrouter', 'groq']);

type Port = ReturnType<typeof browser.runtime.connect>;

let uid = 0;
const newId = () => `m${Date.now()}-${uid++}`;

function download(filename: string, text: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------- SVG Icons
function SchemaIllustration() {
  return (
    <div className="schema-card-wrapper">
      <svg className="schema-svg" viewBox="0 0 280 150" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Card Background */}
        <rect width="280" height="150" rx="10" fill="#FFFFFF" />

        {/* Top Header Tags */}
        <g transform="translate(14, 14)">
          {/* Tag 1: Date */}
          <rect x="0" y="0" width="46" height="18" rx="4" fill="#FEE2E2" stroke="#FECACA" />
          <text x="23" y="12.5" fill="#DC2626" fontSize="9.5" fontWeight="600" textAnchor="middle" fontFamily="system-ui, sans-serif">Date</text>

          {/* Tag 2: Text */}
          <rect x="52" y="0" width="46" height="18" rx="4" fill="#DCFCE7" stroke="#BBF7D0" />
          <text x="75" y="12.5" fill="#16A34A" fontSize="9.5" fontWeight="600" textAnchor="middle" fontFamily="system-ui, sans-serif">Text</text>

          {/* Tag 3: Date */}
          <rect x="104" y="0" width="46" height="18" rx="4" fill="#E0F2FE" stroke="#BAE6FD" />
          <text x="127" y="12.5" fill="#0284C7" fontSize="9.5" fontWeight="600" textAnchor="middle" fontFamily="system-ui, sans-serif">Date</text>

          {/* Tag 4: Table */}
          <rect x="156" y="0" width="46" height="18" rx="4" fill="#F3E8FF" stroke="#E9D5FF" />
          <text x="179" y="12.5" fill="#9333EA" fontSize="9.5" fontWeight="600" textAnchor="middle" fontFamily="system-ui, sans-serif">Table</text>
        </g>

        {/* Left Column Tags */}
        <g transform="translate(14, 40)">
          <rect x="0" y="0" width="48" height="16" rx="3" fill="#FEF08A" stroke="#FDE047" />
          <text x="24" y="11.5" fill="#854D0E" fontSize="8.5" fontWeight="600" textAnchor="middle" fontFamily="system-ui, sans-serif">Picked</text>

          <rect x="0" y="20" width="48" height="16" rx="3" fill="#F1F5F9" stroke="#E2E8F0" />
          <text x="24" y="31.5" fill="#475569" fontSize="8.5" fontWeight="600" textAnchor="middle" fontFamily="system-ui, sans-serif">Text</text>

          <rect x="0" y="40" width="48" height="16" rx="3" fill="#E0F2FE" stroke="#BAE6FD" />
          <text x="24" y="51.5" fill="#0369A1" fontSize="8.5" fontWeight="600" textAnchor="middle" fontFamily="system-ui, sans-serif">Table</text>
        </g>

        {/* Right Content Area */}
        <g transform="translate(72, 40)">
          {/* Blue Header Bar */}
          <rect x="0" y="0" width="60" height="7" rx="3" fill="#0284C7" />

          {/* Text Bars */}
          <rect x="0" y="12" width="186" height="4" rx="2" fill="#CBD5E1" />
          <rect x="0" y="20" width="160" height="4" rx="2" fill="#E2E8F0" />
          <rect x="0" y="28" width="130" height="4" rx="2" fill="#E2E8F0" />

          {/* Table Grid */}
          <g transform="translate(0, 38)">
            {/* Table Header */}
            <rect x="0" y="0" width="186" height="14" rx="2" fill="#F8FAFC" stroke="#E2E8F0" />
            <line x1="62" y1="0" x2="62" y2="14" stroke="#E2E8F0" />
            <line x1="124" y1="0" x2="124" y2="14" stroke="#E2E8F0" />

            {/* Table Row 1 */}
            <rect x="0" y="14" width="186" height="14" fill="#FFFFFF" stroke="#E2E8F0" />
            <line x1="62" y1="14" x2="62" y2="28" stroke="#E2E8F0" />
            <line x1="124" y1="14" x2="124" y2="28" stroke="#E2E8F0" />
            <rect x="8" y="19" width="40" height="4" rx="2" fill="#CBD5E1" />
            <rect x="70" y="19" width="35" height="4" rx="2" fill="#E2E8F0" />
            <rect x="132" y="19" width="42" height="4" rx="2" fill="#CBD5E1" />

            {/* Table Row 2 */}
            <rect x="0" y="28" width="186" height="14" rx="2" fill="#FFFFFF" stroke="#E2E8F0" />
            <line x1="62" y1="28" x2="62" y2="42" stroke="#E2E8F0" />
            <line x1="124" y1="28" x2="124" y2="42" stroke="#E2E8F0" />
            <rect x="8" y="33" width="36" height="4" rx="2" fill="#E2E8F0" />
            <rect x="70" y="33" width="45" height="4" rx="2" fill="#CBD5E1" />
            <rect x="132" y="33" width="30" height="4" rx="2" fill="#E2E8F0" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function DocIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
      <polyline points="14 2 14 8 20 8"></polyline>
      <line x1="16" y1="13" x2="8" y2="13"></line>
      <line x1="16" y1="17" x2="8" y2="17"></line>
      <polyline points="10 9 9 9 8 9"></polyline>
    </svg>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
      <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
      <path d="M9 14l2 2 4-4"></path>
    </svg>
  );
}

function ReplyIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 10 4 15 9 20"></polyline>
      <path d="M20 4v7a4 4 0 0 1-4 4H4"></path>
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"></circle>
      <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
    </svg>
  );
}

function TableIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"></rect>
      <line x1="3" y1="9" x2="21" y2="9"></line>
      <line x1="3" y1="15" x2="21" y2="15"></line>
      <line x1="12" y1="3" x2="12" y2="21"></line>
    </svg>
  );
}

function ChevronRight() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"></polyline>
    </svg>
  );
}

export default function App() {
  const [mode, setMode] = useState<Mode>('ask');
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [executionState, setExecutionState] = useState<ExecutionState>('idle');
  const [expandedStepIds, setExpandedStepIds] = useState<Set<number>>(new Set());
  const [telemetry, setTelemetry] = useState<{ elapsed: number; actionCount: number }>({ elapsed: 0, actionCount: 0 });
  const [userScrolledUp, setUserScrolledUp] = useState(false);

  const [config, setConfig] = useState<Config>(defaultConfig());
  const [showSettings, setShowSettings] = useState(false);
  const [approval, setApproval] = useState<{ id: number; text: string } | null>(null);
  const [macros, setMacros] = useState<Macro[]>([]);
  const [pending, setPending] = useState<PendingMacro | null>(null);
  const [macroName, setMacroName] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const modeBtnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const portRef = useRef<Port | null>(null);
  const runningRef = useRef(false);
  const handlerRef = useRef<(m: BgToPanel) => void>(() => {});
  const callbacks = useRef(new Map<string, (r: ApplyResult) => void>());
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);

  runningRef.current = running;

  useEffect(() => {
    loadConfig().then((c) => {
      setConfig(c);
      const p = c.profiles[c.provider];
      if (PROVIDER_NEEDS_KEY.has(c.provider) && !p.apiKey) setShowSettings(true);
    });
    loadMacros().then(setMacros);
  }, []);

  // Close mode popover on outside click
  useEffect(() => {
    if (!modeMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        !modeBtnRef.current?.contains(e.target as Node)
      ) {
        setModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [modeMenuOpen]);

  // Global keyboard shortcuts: Ctrl+1 (Ask), Ctrl+2 (Act), Ctrl+3 (Dev)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setMode('ask');
          setModeMenuOpen(false);
        } else if (e.key === '2') {
          e.preventDefault();
          setMode('act');
          setModeMenuOpen(false);
        } else if (e.key === '3') {
          e.preventDefault();
          setMode('dev');
          setModeMenuOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Stop running execution when switching modes
  const prevMode = useRef(mode);
  useEffect(() => {
    if (prevMode.current !== mode) {
      prevMode.current = mode;
      if (runningRef.current) stop();
    }
  }, [mode]);

  const onScroll = () => {
    const el = mainRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setUserScrolledUp(!isAtBottom);
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    setUserScrolledUp(false);
  };

  useEffect(() => {
    if (!userScrolledUp) {
      bottomRef.current?.scrollIntoView({ behavior: 'auto' });
    }
  }, [messages, executionState]);

  const patchLast = (fn: (m: UIMessage) => UIMessage) => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const copy = [...prev];
      copy[copy.length - 1] = fn(copy[copy.length - 1]);
      return copy;
    });
  };

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice((n) => (n === msg ? null : n)), 3500);
  };

  handlerRef.current = (m: BgToPanel) => {
    switch (m.type) {
      case 'token':
        patchLast((x) => ({ ...x, content: x.content + m.text }));
        break;
      case 'step':
        setExecutionState('executing');
        setTelemetry((t) => ({ ...t, actionCount: t.actionCount + 1 }));
        setMessages((prev) => {
          if (prev.length === 0) return prev;
          const copy = [...prev];
          const last = copy[copy.length - 1];
          const exists = last.steps.some((s) => s.id === m.id);
          const nextSteps = exists
            ? last.steps.map((s) => (s.id === m.id ? { ...s, ...m } : s))
            : [
                ...last.steps,
                {
                  id: m.id,
                  text: m.text,
                  status: m.status,
                  thought: m.thought,
                  action: m.action,
                  target: m.target,
                  timestamp: m.timestamp || Date.now(),
                },
              ];
          copy[copy.length - 1] = { ...last, steps: nextSteps };
          return copy;
        });
        break;
      case 'approval':
        setExecutionState('paused');
        setApproval({ id: m.id, text: m.text });
        break;
      case 'macro':
        setPending({ goal: m.goal, startUrl: m.startUrl, steps: m.steps });
        setMacroName(m.goal.slice(0, 50));
        break;
      case 'tables':
        if (m.error) flash(m.error);
        else if (m.count === 0) flash('No tabular data detected on page.');
        else {
          download('nexus-extracted-tables.csv', m.csv, 'text/csv;charset=utf-8');
          flash(`Extracted ${m.count} table${m.count > 1 ? 's' : ''} to CSV.`);
        }
        break;
      case 'applied':
      case 'undone':
        callbacks.current.get(m.key)?.({ ok: m.ok, message: m.message });
        callbacks.current.delete(m.key);
        break;
      case 'done':
        patchLast((x) => ({ ...x, streaming: false }));
        setApproval(null);
        setRunning(false);
        setExecutionState('idle');
        if (timerRef.current) clearInterval(timerRef.current);
        break;
      case 'error':
        patchLast((x) => ({
          ...x,
          streaming: false,
          error: true,
          content: (x.content ? x.content + '\n\n' : '') + m.message,
        }));
        setApproval(null);
        setRunning(false);
        setExecutionState('idle');
        if (timerRef.current) clearInterval(timerRef.current);
        break;
    }
  };

  const getPort = (): Port => {
    if (portRef.current) return portRef.current;
    const p = browser.runtime.connect({ name: 'webpilot' });
    p.onMessage.addListener((m) => handlerRef.current(m as BgToPanel));
    p.onDisconnect.addListener(() => {
      portRef.current = null;
      if (runningRef.current) {
        handlerRef.current({
          type: 'error',
          message: 'Lost connection to Nexus Tab core. Reconnecting…',
        });
      }
    });
    portRef.current = p;
    return p;
  };

  const post = (m: PanelToBg) => getPort().postMessage(m);

  const activeTabId = async (): Promise<number | undefined> => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs[0]?.id;
  };

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || running) return;

    if (!textOverride) setInput('');
    setApproval(null);
    setPending(null);
    setUserScrolledUp(false);

    startTimeRef.current = Date.now();
    setTelemetry({ elapsed: 0, actionCount: 0 });
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTelemetry((t) => ({ ...t, elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000) }));
    }, 1000);

    const userMsg: UIMessage = {
      id: newId(),
      role: 'user',
      content: text,
      steps: [],
      streaming: false,
    };
    const assistantMsg: UIMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
      steps: [],
      streaming: true,
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setRunning(true);
    setExecutionState('thinking');

    const tabId = await activeTabId();
    if (tabId === undefined) {
      patchLast((x) => ({
        ...x,
        streaming: false,
        error: true,
        content: 'No active browser tab detected to inspect.',
      }));
      setRunning(false);
      setExecutionState('idle');
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const history: ChatMsg[] = messages
      .filter((m) => m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    post({ type: 'run', mode, prompt: text, history, tabId });
  };

  const exportTables = async () => {
    const tabId = await activeTabId();
    if (tabId === undefined) {
      flash('No active tab detected.');
      return;
    }
    flash('Extracting tabular data from active page…');
    post({ type: 'tables', tabId });
  };

  const runMacro = async (m: Macro) => {
    if (running) return;
    const tabId = await activeTabId();
    if (tabId === undefined) {
      flash('No active tab detected.');
      return;
    }
    const userMsg: UIMessage = {
      id: newId(),
      role: 'user',
      content: `▶ Replay Protocol: ${m.name} (${m.steps.length} ops)`,
      steps: [],
      streaming: false,
    };
    const assistantMsg: UIMessage = {
      id: newId(),
      role: 'assistant',
      content: '',
      steps: [],
      streaming: true,
    };
    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setRunning(true);
    setExecutionState('executing');
    post({ type: 'replay', macro: m, tabId });
  };

  const saveMacro = async () => {
    if (!pending || !macroName.trim()) return;
    const item: Macro = {
      id: `m_${Date.now()}`,
      name: macroName.trim(),
      goal: pending.goal,
      startUrl: pending.startUrl,
      steps: pending.steps,
      created: Date.now(),
    };
    const next = [...macros, item];
    setMacros(next);
    await saveMacros(next);
    setPending(null);
    setMacroName('');
    flash(`Stored Protocol: "${item.name}"`);
  };

  const deleteMacro = async (id: string) => {
    const next = macros.filter((m) => m.id !== id);
    setMacros(next);
    await saveMacros(next);
    flash('Protocol purged.');
  };

  const exportChat = () => {
    const md = messages
      .filter((m) => m.content)
      .map((m) => `**${m.role === 'user' ? 'Operator' : 'Nexus Tab'}:**\n\n${m.content}`)
      .join('\n\n---\n\n');
    download('nexus-operational-log.md', md, 'text/markdown;charset=utf-8');
  };

  const onApply = async (key: string, lang: string, code: string): Promise<ApplyResult> => {
    const tabId = await activeTabId();
    if (tabId === undefined) return { ok: false, message: 'No target tab.' };
    return new Promise((resolve) => {
      callbacks.current.set(key, resolve);
      post({ type: 'apply', key, tabId, lang, code });
    });
  };

  const onUndo = (key: string): Promise<ApplyResult> =>
    new Promise((resolve) => {
      callbacks.current.set(key, resolve);
      post({ type: 'undo', key });
    });

  const stop = () => {
    if (portRef.current) post({ type: 'stop' });
    setExecutionState('aborted');
    if (timerRef.current) clearInterval(timerRef.current);
    flash('Directive halted.');
  };

  const togglePause = () => {
    if (executionState === 'paused') {
      post({ type: 'resume' });
      setExecutionState('executing');
      flash('Resumed execution.');
    } else if (executionState === 'executing' || executionState === 'thinking') {
      post({ type: 'pause' });
      setExecutionState('paused');
      flash('Execution paused.');
    }
  };

  const toggleStep = (id: number) => {
    setExpandedStepIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const answerApproval = (ok: boolean) => {
    if (!approval) return;
    post({ type: 'approve', id: approval.id, ok });
    setApproval(null);
  };

  const switchProvider = async (p: ProviderId) => {
    const next: Config = { ...config, provider: p };
    setConfig(next);
    await saveConfig(next);
    flash(`Provider: ${PROVIDERS[p].label} (${next.profiles[p].model})`);
  };

  const hasKey =
    !PROVIDER_NEEDS_KEY.has(config.provider) || !!config.profiles[config.provider].apiKey;

  const isExecutionActive = executionState === 'executing' || executionState === 'thinking';
  const dynamicPlaceholder = isExecutionActive
    ? "Intervene or steer agent (e.g. 'Skip to next step')..."
    : executionState === 'paused'
    ? 'Agent is paused. Enter feedback or click Resume...'
    : PLACEHOLDER[mode];

  return (
    <div className="app">
      <header>
        <div className="brand">
          <div className="logo-wrapper">
            <img className="logo" src="/icon/32.png" alt="Nexus Tab Emblem" />
            <span
              className={`status-indicator ${
                isExecutionActive
                  ? 'running'
                  : executionState === 'paused'
                  ? 'warn'
                  : approval
                  ? 'warn'
                  : 'online'
              }`}
            />
          </div>
          <div className="brand-text">
            <span className="brand-name">NEXUS TAB</span>
            <span className="brand-sub">
              {isExecutionActive
                ? 'EXECUTING'
                : executionState === 'paused'
                ? 'PAUSED'
                : approval
                ? 'OVERRIDE REQ'
                : 'CORE ONLINE'}
            </span>
          </div>
        </div>

        <div className="header-actions">
          <div
            className="model-select-wrapper"
            title={`Active Provider: ${PROVIDERS[config.provider].label} | Model: ${
              config.profiles[config.provider]?.model || PROVIDERS[config.provider].model
            }`}
          >
            <span className="model-icon-indicator">
              {MODEL_SHORT_NAMES[config.provider]?.icon || '✦'}
            </span>
            <select
              className="quick-model-select"
              value={config.provider}
              onChange={(e) => switchProvider(e.target.value as ProviderId)}
            >
              {(Object.keys(PROVIDERS) as ProviderId[]).map((id) => (
                <option key={id} value={id}>
                  {MODEL_SHORT_NAMES[id]?.short || PROVIDERS[id].label}
                </option>
              ))}
            </select>
          </div>

          {messages.length > 0 && (
            <button className="icon" title="Export Operational Log (Markdown)" onClick={exportChat}>
              ⬇
            </button>
          )}
          <button
            className="icon"
            title="New chat"
            onClick={() => {
              stop();
              setMessages([]);
              setPending(null);
            }}
          >
            ＋
          </button>
          <button className="icon" title="Settings" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
        </div>
      </header>

      {notice && <div className="notice">{notice}</div>}

      {showSettings ? (
        <Settings
          config={config}
          onChange={setConfig}
          onClose={() => setShowSettings(false)}
        />
      ) : (
        <>
          <main ref={mainRef} onScroll={onScroll}>
            {messages.length === 0 ? (
              <div className="empty">
                {/* Central Schema Illustration matching the shared UI */}
                <SchemaIllustration />

                <div className="empty-hero">
                  <h2>Nexus Tab Page Assistant</h2>
                  <p className="hero-desc">
                    Autonomous DOM and content intelligence synthesizer
                  </p>
                </div>

                {!hasKey && (
                  <button className="primary init-key-btn" onClick={() => setShowSettings(true)}>
                    ⚠ INITIALIZE NEURAL LINK (ADD API KEY)
                  </button>
                )}

                <div className="section-label">PRIMARY DIRECTIVES</div>

                <div className="directives-list">
                  {mode === 'ask' ? (
                    <>
                      <button className="directive-card suggest" onClick={() => send('Synthesize full summary of page')}>
                        <span className="directive-icon"><DocIcon /></span>
                        <span className="directive-text">Synthesize full summary of page</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card suggest" onClick={() => send('Extract key takeaways & actionable items')}>
                        <span className="directive-icon"><ClipIcon /></span>
                        <span className="directive-text">Extract key takeaways & actionable items</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card suggest" onClick={() => send('Draft a tactical reply to this content')}>
                        <span className="directive-icon"><ReplyIcon /></span>
                        <span className="directive-text">Draft a tactical reply to this content</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card suggest" onClick={() => send('Find anomalies or missing information')}>
                        <span className="directive-icon"><SearchIcon /></span>
                        <span className="directive-text">Find anomalies or missing information</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card suggest cyber-action" onClick={exportTables}>
                        <span className="directive-icon"><TableIcon /></span>
                        <span className="directive-text">Export tables on this page as CSV</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                    </>
                  ) : mode === 'act' ? (
                    <>
                      <button className="directive-card" onClick={() => send('Scroll to bottom and summarize findings')}>
                        <span className="directive-icon"><DocIcon /></span>
                        <span className="directive-text">Scroll to bottom and summarize findings</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card" onClick={() => send('Locate primary action button and activate')}>
                        <span className="directive-icon"><ClipIcon /></span>
                        <span className="directive-text">Locate primary action button and activate</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card" onClick={() => send('Fill in the main search input with "test"')}>
                        <span className="directive-icon"><SearchIcon /></span>
                        <span className="directive-text">Fill in the main search input with "test"</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button className="directive-card" onClick={() => send('Inject dark cybernetic mode into page')}>
                        <span className="directive-icon"><DocIcon /></span>
                        <span className="directive-text">Inject dark mode theme into page</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card" onClick={() => send('Neutralize all ads, popups and overlays')}>
                        <span className="directive-icon"><ClipIcon /></span>
                        <span className="directive-text">Neutralize all ads, popups and overlays</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card" onClick={() => send('Inspect DOM tree and diagnose layout errors')}>
                        <span className="directive-icon"><SearchIcon /></span>
                        <span className="directive-text">Inspect DOM tree and diagnose layout errors</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                      <button className="directive-card" onClick={() => send('Audit page for console errors and failures')}>
                        <span className="directive-icon"><TableIcon /></span>
                        <span className="directive-text">Audit page for console errors and failures</span>
                        <span className="directive-chevron"><ChevronRight /></span>
                      </button>
                    </>
                  )}
                </div>

                {mode === 'act' && macros.length > 0 && (
                  <>
                    <div className="section-label">RECORDED PROTOCOLS · 0 TOKENS</div>
                    <div className="macro-list">
                      {macros.map((m) => (
                        <div key={m.id} className="macro">
                          <button className="suggest" onClick={() => runMacro(m)} title={m.goal}>
                            <span className="suggest-chevron">▶</span>
                            <span className="suggest-text">
                              {m.name} <small>({m.steps.length} ops)</small>
                            </span>
                          </button>
                          <button
                            className="icon delete-macro"
                            title="Purge Protocol"
                            onClick={() => deleteMacro(m.id)}
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            ) : (
              messages.map((m) => (
                <div key={m.id} className={`msg ${m.role}${m.error ? ' error' : ''}`}>
                  {m.role === 'assistant' && (
                    <div className="agent-badge">
                      <span className="agent-pill">NEXUS // PROTOCOL</span>
                      {m.streaming && <span className="agent-stream-indicator">SYNTHESIZING</span>}
                    </div>
                  )}

                  {m.steps.length > 0 && (
                    <div className="steps-container">
                      <div className="steps-header">
                        <div className="steps-title">
                          <span>DIRECTIVE PROGRESSION</span>
                          <span className="steps-count">[{m.steps.length}]</span>
                        </div>
                        <div className="telemetry-chip">
                          <span>⏱ {telemetry.elapsed}s</span>
                          <span className="telemetry-sep">•</span>
                          <span>{m.steps.filter((s) => s.status === 'ok').length} actions</span>
                        </div>
                      </div>
                      <ul className="steps">
                        {m.steps.map((s, idx) => {
                          const isExpanded = expandedStepIds.has(s.id);
                          return (
                            <li
                              key={s.id}
                              className={`step-item ${s.status} ${isExpanded ? 'expanded' : ''}`}
                              onClick={() => toggleStep(s.id)}
                              title="Click to toggle tactical inspector details"
                            >
                              <div className="step-main-row">
                                <span className="step-idx">{String(idx + 1).padStart(2, '0')}</span>
                                <span className="dot" />
                                <span className="step-text">{s.text}</span>
                                <span className="step-tag">
                                  {s.status === 'running'
                                    ? 'EXEC'
                                    : s.status === 'ok'
                                    ? 'DONE'
                                    : s.status === 'error'
                                    ? 'FAIL'
                                    : 'HALT'}
                                </span>
                                <span className="step-expand-icon">{isExpanded ? '▾' : '▸'}</span>
                              </div>

                              {isExpanded && (
                                <div className="step-details" onClick={(e) => e.stopPropagation()}>
                                  {s.thought && (
                                    <div className="step-detail-row">
                                      <span className="detail-tag">REASONING</span>
                                      <p className="detail-content">{s.thought}</p>
                                    </div>
                                  )}
                                  {s.target && (
                                    <div className="step-detail-row">
                                      <span className="detail-tag">TARGET DOM</span>
                                      <code className="detail-content mono">{s.target}</code>
                                    </div>
                                  )}
                                  <div className="step-detail-meta">
                                    <span>
                                      TIMESTAMP: {s.timestamp ? new Date(s.timestamp).toLocaleTimeString() : 'Recorded'}
                                    </span>
                                    <span>STATUS: {s.status.toUpperCase()}</span>
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}

                  {m.role === 'user' ? (
                    <p>{m.content}</p>
                  ) : m.content || m.streaming ? (
                    <RichText
                      msgId={m.id}
                      content={m.content}
                      streaming={m.streaming}
                      onApply={onApply}
                      onUndo={onUndo}
                    />
                  ) : null}
                </div>
              ))
            )}

            {approval && (
              <div className="approval">
                <div className="approval-banner">
                  <span className="alert-icon">⚠</span>
                  <strong>TACTICAL OVERRIDE REQUIRED</strong>
                </div>
                <p className="approval-sub">This action alters external browser state or sends data:</p>
                <pre>{approval.text}</pre>
                <div className="settings-actions">
                  <button className="primary" onClick={() => answerApproval(true)}>
                    Allow
                  </button>
                  <button className="danger" onClick={() => answerApproval(false)}>
                    Deny
                  </button>
                </div>
              </div>
            )}

            {pending && !running && (
              <div className="save-macro">
                <div className="save-macro-header">
                  <strong>STORE SEQUENCE AS ZERO-TOKEN PROTOCOL?</strong>
                </div>
                <small>{pending.steps.length} actions logged · replays deterministically without model latency</small>
                <input
                  value={macroName}
                  onChange={(e) => setMacroName(e.target.value)}
                  placeholder="Protocol designation"
                />
                <div className="settings-actions">
                  <button className="primary" onClick={saveMacro}>
                    STORE PROTOCOL
                  </button>
                  <button onClick={() => setPending(null)}>DISMISS</button>
                </div>
              </div>
            )}

            <div ref={bottomRef} style={{ height: 20, flexShrink: 0 }} />
          </main>

          {/* Floating jump to latest button if user scrolled up */}
          {userScrolledUp && (
            <button className="jump-latest-btn" type="button" onClick={scrollToBottom}>
              ↓ Jump to latest
            </button>
          )}

          {/* Bottom Dock: Styled after the shared UI */}
          <div className="bottom-dock">
            <div className="dock-top-row">
              <div className="mode-selector-container">
                <button
                  type="button"
                  ref={modeBtnRef}
                  className={`mode-selector-btn ${modeMenuOpen ? 'open' : ''}`}
                  disabled={running}
                  onClick={() => setModeMenuOpen(!modeMenuOpen)}
                >
                  <span className="mode-selector-label">Current Mode</span>
                  <span className="mode-selector-title">
                    <span>{mode.toUpperCase()}</span>
                    <span className="caret-icon">▾</span>
                  </span>
                  <span className="mode-selector-sub">
                    {mode === 'ask'
                      ? 'Intel (Ctrl+1)'
                      : mode === 'act'
                      ? 'Update (Ctrl+2)'
                      : 'Synthesize (Ctrl+3)'}
                  </span>
                </button>

                {/* Accessible Mode Tabs for Quick Switching & Automation */}
                <div className={`mode-popover modes ${modeMenuOpen ? 'open' : ''}`} ref={popoverRef}>
                  <button
                    type="button"
                    data-mode="ask"
                    className={`popover-item ${mode === 'ask' ? 'active' : ''}`}
                    onClick={() => {
                      setMode('ask');
                      setModeMenuOpen(false);
                    }}
                  >
                    <div className="popover-item-title">
                      {mode === 'ask' && <span className="active-tag">[Active] </span>}ASK
                    </div>
                    <div className="popover-item-sub">Intel (Ctrl+1)</div>
                  </button>

                  <button
                    type="button"
                    data-mode="act"
                    className={`popover-item ${mode === 'act' ? 'active' : ''}`}
                    onClick={() => {
                      setMode('act');
                      setModeMenuOpen(false);
                    }}
                  >
                    <div className="popover-item-title">
                      {mode === 'act' && <span className="active-tag">[Active] </span>}ACT
                    </div>
                    <div className="popover-item-sub">Update (Ctrl+2)</div>
                  </button>

                  <button
                    type="button"
                    data-mode="dev"
                    className={`popover-item ${mode === 'dev' ? 'active' : ''}`}
                    onClick={() => {
                      setMode('dev');
                      setModeMenuOpen(false);
                    }}
                  >
                    <div className="popover-item-title">
                      {mode === 'dev' && <span className="active-tag">[Active] </span>}DEV
                    </div>
                    <div className="popover-item-sub">Synthesize (Ctrl+3)</div>
                  </button>
                </div>
              </div>

              {/* Sparkle watermark on right */}
              <div className="dock-sparkle-container">
                <svg className="dock-sparkle-icon" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2L14.2 9.8L22 12L14.2 14.2L12 22L9.8 14.2L2 12L9.8 9.8L12 2Z" />
                </svg>
              </div>
            </div>

            <div className="composer">
              <textarea
                rows={1}
                value={input}
                placeholder={dynamicPlaceholder}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />

              <div className="composer-actions">
                {isExecutionActive || executionState === 'paused' ? (
                  <>
                    {mode === 'act' && (
                      <button
                        className={`pause-btn ${executionState === 'paused' ? 'resume' : ''}`}
                        onClick={togglePause}
                        title={executionState === 'paused' ? 'Resume execution' : 'Pause execution'}
                      >
                        {executionState === 'paused' ? '▶' : '⏸'}
                      </button>
                    )}
                    <button className="send stop abort-btn round-send-btn" onClick={stop} title="Abort Directive">
                      <span className="stop-icon">⏹</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="send round-send-btn"
                    onClick={() => void send()}
                    disabled={!input.trim()}
                    title="Transmit directive"
                  >
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12"></line>
                      <polyline points="12 5 19 12 12 19"></polyline>
                    </svg>
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
