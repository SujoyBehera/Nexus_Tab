import { useEffect, useRef, useState } from 'react';

export interface ApplyResult {
  ok: boolean;
  message: string;
}

export type Part =
  | { t: 'text'; v: string }
  | { t: 'code'; lang: string; v: string; closed: boolean };

/** Splits markdown-ish text into prose and fenced code parts (tolerates an unclosed fence mid-stream). */
export function splitParts(text: string): Part[] {
  const parts: Part[] = [];
  const re = /```([\w+-]*)[ \t]*\n?([\s\S]*?)(```|$)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ t: 'text', v: text.slice(last, m.index) });
    parts.push({ t: 'code', lang: m[1] ?? '', v: (m[2] ?? '').replace(/\n$/, ''), closed: m[3] === '```' });
    last = re.lastIndex;
    if (m[3] === '') break;
  }
  if (last < text.length) parts.push({ t: 'text', v: text.slice(last) });
  return parts;
}

/**
 * Reveals `target` progressively so code appears to be typed live, even when
 * the model streams in large bursts. Speeds up automatically if it falls behind.
 */
export function useTypewriter(target: string): string {
  const [n, setN] = useState(0);
  const state = useRef({ n: 0, target });
  state.current.target = target;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const s = state.current;
      if (s.n < s.target.length) {
        const backlog = s.target.length - s.n;
        s.n = Math.min(s.target.length, s.n + Math.max(2, Math.ceil(backlog / 14)));
        setN(s.n);
        raf = requestAnimationFrame(tick);
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  return target.slice(0, Math.min(n, target.length));
}

function Inline({ text }: { text: string }) {
  const bits = text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g);
  return (
    <>
      {bits.map((b, i) =>
        b.startsWith('`') && b.endsWith('`') && b.length > 2 ? (
          <code key={i} className="inline-code">{b.slice(1, -1)}</code>
        ) : b.startsWith('**') && b.endsWith('**') && b.length > 4 ? (
          <strong key={i}>{b.slice(2, -2)}</strong>
        ) : (
          <span key={i}>{b}</span>
        ),
      )}
    </>
  );
}

const APPLIABLE = new Set(['css', 'js', 'javascript']);

function CodeBlock(props: {
  id: string;
  lang: string;
  code: string;
  typing: boolean;
  onApply: (key: string, lang: string, code: string) => Promise<ApplyResult>;
  onUndo: (key: string) => Promise<ApplyResult>;
}) {
  const { id, lang, code, typing, onApply, onUndo } = props;
  const [status, setStatus] = useState<{ text: string; ok: boolean } | null>(null);
  const [applied, setApplied] = useState(false);
  const [copied, setCopied] = useState(false);
  const canApply = APPLIABLE.has(lang.toLowerCase());
  const isCss = lang.toLowerCase() === 'css';

  return (
    <div className="code">
      <div className="code-head">
        <span className="code-lang">{lang || 'code'}</span>
        <span className="code-actions">
          <button
            onClick={async () => {
              await navigator.clipboard.writeText(code);
              setCopied(true);
              setTimeout(() => setCopied(false), 1200);
            }}
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
          {canApply && !applied && (
            <button
              className="primary"
              disabled={typing}
              onClick={async () => {
                const r = await onApply(id, lang, code);
                setApplied(r.ok && isCss);
                setStatus({ text: r.message, ok: r.ok });
              }}
            >
              Apply to page
            </button>
          )}
          {applied && (
            <button
              onClick={async () => {
                const r = await onUndo(id);
                if (r.ok) setApplied(false);
                setStatus({ text: r.message, ok: r.ok });
              }}
            >
              Undo
            </button>
          )}
        </span>
      </div>
      <pre>
        <code>{code}</code>
        {typing && <span className="cursor" />}
      </pre>
      {status && <div className={`code-status ${status.ok ? 'ok' : 'bad'}`}>{status.text}</div>}
    </div>
  );
}

export function RichText(props: {
  msgId: string;
  content: string;
  streaming: boolean;
  onApply: (key: string, lang: string, code: string) => Promise<ApplyResult>;
  onUndo: (key: string) => Promise<ApplyResult>;
}) {
  const shown = useTypewriter(props.content);
  const typing = props.streaming || shown.length < props.content.length;
  const parts = splitParts(shown);
  return (
    <div className="rich">
      {parts.map((p, i) =>
        p.t === 'text' ? (
          <p key={i}>
            <Inline text={p.v} />
          </p>
        ) : (
          <CodeBlock
            key={i}
            id={`${props.msgId}-${i}`}
            lang={p.lang}
            code={p.v}
            typing={typing && i === parts.length - 1}
            onApply={props.onApply}
            onUndo={props.onUndo}
          />
        ),
      )}
      {typing && parts[parts.length - 1]?.t !== 'code' && <span className="cursor" />}
    </div>
  );
}
