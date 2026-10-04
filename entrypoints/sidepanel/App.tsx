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

const DIRECTIVES: Record<Mode, string[]> = {
  ask: [
    'Synthesize full summary of page',
    'Extract key takeaways & actionable items',
    'Draft a tactical reply to this content',
    'Find anomalies or missing information',
  ],
  act: [
    'Scroll to bottom and summarize findings',
    'Locate primary action button and activate',
    'Fill in the main search input with "test"',
  ],
  dev: [
    'Inject dark cybernetic mode into page',
    'Neutralize all ads, popups and overlays',
    'Inspect DOM tree and diagnose layout errors',
    'Audit page for console errors and failures',
  ],
};

const PLACEHOLDER: Record<Mode, string> = {
  ask: 'Transmit query regarding page content…',
  act: 'Issue autonomous directive for this page…',
  dev: 'Describe style modification, script, or bug…',
};

const MODEL_SHORT_NAMES: Record<ProviderId, { short: string; icon: string }> = {
  gemini: { short: 'Gemini 3.5 Flash', icon: '✦' },
  openai: { short: 'GPT-4o Mini', icon: '⚡' },
  anthropic: { short: 'Claude 3.5', icon: '◈' },
  ollama: { short: 'Ollama Llama3', icon: '🦙' },
  openrouter: { short: 'OpenRouter', icon: '❖' },
  groq: { short: 'Groq Instant', icon: '⚡' },
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

  // Global keyboard shortcuts: Ctrl+1 (Ask), Ctrl+2 (Act), Ctrl+3 (Dev)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        if (e.key === '1') {
          e.preventDefault();
          setMode('ask');
        } else if (e.key === '2') {
          e.preventDefault();
          setMode('act');
        } else if (e.key === '3') {
          e.preventDefault();
          setMode('dev');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Smart auto-scroll: only scrolls down if user hasn't scrolled up
  useEffect(() => {
    if (!userScrolledUp) {
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [messages, approval, pending, userScrolledUp]);

  const onScroll = () => {
    if (!mainRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = mainRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 80;
    setUserScrolledUp(!isNearBottom);
  };

  const scrollToBottom = () => {
    setUserScrolledUp(false);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3500);
  };

  const patchLast = (fn: (m: UIMessage) => UIMessage) =>
    setMessages((all) => {
      if (!all.length) return all;
      const copy = all.slice();
      const last = copy[copy.length - 1];
      if (last) copy[copy.length - 1] = fn(last);
      return copy;
    });

  handlerRef.current = (m) => {
    switch (m.type) {
      case 'token':
        patchLast((x) => ({ ...x, content: x.content + m.text }));
        break;
      case 'step':
        if (m.status === 'running') {
          setExecutionState(m.text.includes('Thinking') ? 'thinking' : 'executing');
        }
        patchLast((x) => {
          const steps = x.steps.slice();
          const i = steps.findIndex((s) => s.id === m.id);
          const step: Step = {
            id: m.id,
            text: m.text,
            status: m.status,
            thought: m.thought,
            action: m.action,
            target: m.target,
            timestamp: m.timestamp || Date.now(),
          };
          if (i >= 0) steps[i] = step;
          else steps.push(step);
          return { ...x, steps };
        });
        if (m.status === 'ok') {
          setTelemetry((t) => ({ ...t, actionCount: t.actionCount + 1 }));
        }
        break;
      case 'approval':
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
          download('ultron-extracted-tables.csv', m.csv, 'text/csv;charset=utf-8');
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
          message: 'Lost connection to ULTRON neural core. Reconnecting…',
        });
      }
    });
    portRef.current = p;
    return p;
  };

  const post = (m: PanelToBg) => getPort().postMessage(m);

  const activeTabId = async (): Promise<number | undefined> => {
    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    return tab?.id;
  };

  const startRun = (userText: string) => {
    setPending(null);
    setMessages((all) => [
      ...all,
      { id: newId(), role: 'user', content: userText, steps: [], streaming: false },
      { id: newId(), role: 'assistant', content: '', steps: [], streaming: true },
    ]);
    setRunning(true);
    setExecutionState('thinking');
    setUserScrolledUp(false);

    // Start live telemetry elapsed counter
    startTimeRef.current = Date.now();
    setTelemetry({ elapsed: 0, actionCount: 0 });
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setTelemetry((t) => ({
        ...t,
        elapsed: Math.floor((Date.now() - startTimeRef.current) / 1000),
      }));
    }, 1000);
  };

  const send = async (text?: string) => {
    const prompt = (text ?? input).trim();
    if (!prompt || running) return;
    const tabId = await activeTabId();
    const history: ChatMsg[] = messages
      .filter((m) => m.content && !m.error)
      .slice(-10)
      .map((m) => ({ role: m.role, content: m.content }));
    setInput('');
    startRun(prompt);
    if (tabId === undefined) {
      handlerRef.current({ type: 'error', message: 'No target browser tab detected.' });
      return;
    }
    post({ type: 'run', mode, prompt, history, tabId });
  };

  const runMacro = async (macro: Macro) => {
    if (running) return;
    const tabId = await activeTabId();
    setMode('act');
    startRun(`▶ Replaying Directive: ${macro.name}`);
    if (tabId === undefined) {
      handlerRef.current({ type: 'error', message: 'No target browser tab detected.' });
      return;
    }
    post({ type: 'replay', macro, tabId });
  };

  const saveMacro = async () => {
    if (!pending) return;
    const macro: Macro = {
      id: newId(),
      name: macroName.trim() || pending.goal.slice(0, 50) || 'Directive',
      goal: pending.goal,
      startUrl: pending.startUrl,
      steps: pending.steps,
      created: Date.now(),
    };
    const next = [macro, ...macros];
    await saveMacros(next);
    setMacros(next);
    setPending(null);
    flash('Directive recorded. Replay anytime with 0 tokens.');
  };

  const deleteMacro = async (id: string) => {
    const next = macros.filter((m) => m.id !== id);
    await saveMacros(next);
    setMacros(next);
  };

  const exportTables = async () => {
    const tabId = await activeTabId();
    if (tabId === undefined) return flash('No target browser tab detected.');
    post({ type: 'tables', tabId });
  };

  const exportChat = () => {
    const md = messages
      .filter((m) => m.content)
      .map((m) => `**${m.role === 'user' ? 'Operator' : 'ULTRON'}:**\n\n${m.content}`)
      .join('\n\n---\n\n');
    download('ultron-operational-log.md', md, 'text/markdown;charset=utf-8');
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
    flash('Operational directive halted.');
  };

  const togglePause = () => {
    if (executionState === 'paused') {
      post({ type: 'resume' });
      setExecutionState('executing');
      flash('Resumed directive execution.');
    } else if (executionState === 'executing' || executionState === 'thinking') {
      post({ type: 'pause' });
      setExecutionState('paused');
      flash('Directive paused. Review current state.');
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
            <img className="logo" src="/icon/32.png" alt="Ultron Emblem" />
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
            <span className="brand-name">ULTRON</span>
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
          <button className="icon" title="Neural Core Settings" onClick={() => setShowSettings(true)}>
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
                <div className="empty-hero">
                  <div className="hero-emblem-halo">
                    <img className="hero-emblem" src="/icon/48.png" alt="Ultron" />
                  </div>
                  <h2>ULTRON TACTICAL MATRIX</h2>
                  <p className="hero-desc">
                    Autonomous cybernetic browser intelligence and DOM synthesizer
                  </p>
                </div>

                {!hasKey && (
                  <button className="primary init-key-btn" onClick={() => setShowSettings(true)}>
                    ⚠ INITIALIZE NEURAL LINK (ADD API KEY)
                  </button>
                )}

                <div className="section-label">PRIMARY DIRECTIVES</div>
                <div className="suggestions-grid">
                  {DIRECTIVES[mode].map((s) => (
                    <button key={s} className="suggest" onClick={() => send(s)}>
                      <span className="suggest-chevron">›</span>
                      <span className="suggest-text">{s}</span>
                    </button>
                  ))}
                </div>

                {mode === 'ask' && (
                  <button className="suggest cyber-action" onClick={exportTables}>
                    <span className="suggest-chevron">⤓</span>
                    <span className="suggest-text">Export tables on this page as CSV</span>
                  </button>
                )}

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
                      <span className="agent-pill">ULTRON // PROTOCOL</span>
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

            <div ref={bottomRef} />
          </main>

          {/* Floating jump to latest button if user scrolled up */}
          {userScrolledUp && (
            <button className="jump-latest-btn" onClick={scrollToBottom}>
              ↓ Jump to latest
            </button>
          )}

          {/* Unified Bottom Dock: Mode Tabs seamlessly connected to Input Console */}
          <div className="bottom-dock">
            <div className="modes">
              {(['ask', 'act', 'dev'] as Mode[]).map((m, idx) => (
                <button
                  key={m}
                  className={m === mode ? 'active' : ''}
                  disabled={running}
                  onClick={() => setMode(m)}
                >
                  <span className="mode-tag">{m.toUpperCase()}</span>
                  <span className="mode-desc">
                    {m === 'ask' ? 'Intel' : m === 'act' ? 'Operate' : 'Synthesize'}
                  </span>
                  <span className="hotkey-hint">Ctrl+{idx + 1}</span>
                </button>
              ))}
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
                    <button className="send stop abort-btn" onClick={stop} title="Abort Directive">
                      <span className="stop-icon">⏹</span>
                      <span className="stop-text">Abort</span>
                    </button>
                  </>
                ) : (
                  <button
                    className="send"
                    onClick={() => void send()}
                    disabled={!input.trim()}
                    title="Execute Directive"
                  >
                    ➤
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
