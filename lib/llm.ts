import type { ChatMsg, LlmSettings } from './types';

/** Yields the payload of each `data:` line in a Server-Sent-Events response. */
async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data && data !== '[DONE]') yield data;
      }
    }
  }
}

async function ensureOk(res: Response, s: LlmSettings): Promise<void> {
  if (res.ok) return;
  let body = '';
  try {
    body = (await res.text()).slice(0, 400);
  } catch {
    /* ignore */
  }
  let hint = '';
  if (s.provider === 'ollama' && res.status === 403) {
    hint =
      '\nOllama rejected the extension origin. Restart Ollama with OLLAMA_ORIGINS=chrome-extension://*,moz-extension://*';
  } else if (res.status === 401 || res.status === 403) {
    hint = '\nCheck your API key in Settings.';
  }
  throw new Error(`${s.provider} error ${res.status}: ${body || res.statusText}${hint}`);
}

async function doFetch(
  url: string,
  init: RequestInit,
  s: LlmSettings,
): Promise<Response> {
  let attempts = 0;
  while (attempts < 3) {
    attempts++;
    try {
      const res = await fetch(url, init);
      if ((res.status === 503 || res.status === 429) && attempts < 3) {
        await new Promise((r) => setTimeout(r, 1500 * attempts));
        continue;
      }
      return res;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      if (attempts >= 3) {
        throw new Error(
          `Could not reach ${new URL(url).origin}. ${
            s.provider === 'ollama' ? 'Is Ollama running?' : 'Check your connection and base URL.'
          }`,
        );
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return fetch(url, init);
}

/**
 * Streams a chat completion from any supported provider.
 * Calls `onToken` for each text chunk and resolves with the full text.
 */
export async function streamChat(
  s: LlmSettings,
  system: string,
  messages: ChatMsg[],
  onToken: (text: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  let full = '';
  const emit = (t: string | undefined) => {
    if (t) {
      full += t;
      onToken(t);
    }
  };
  const base = s.baseUrl.replace(/\/+$/, '');

  if (s.provider === 'gemini') {
    const res = await doFetch(
      `${base}/models/${encodeURIComponent(s.model)}:streamGenerateContent?alt=sse`,
      {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
        }),
      },
      s,
    );
    await ensureOk(res, s);
    for await (const data of sseData(res)) {
      try {
        const j = JSON.parse(data);
        const parts = j.candidates?.[0]?.content?.parts as { text?: string }[] | undefined;
        parts?.forEach((p) => emit(p.text));
      } catch {
        /* skip malformed chunk */
      }
    }
    return full;
  }

  if (s.provider === 'anthropic') {
    const res = await doFetch(
      `${base}/messages`,
      {
        method: 'POST',
        signal,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': s.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: s.model,
          max_tokens: 8192,
          system,
          stream: true,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      },
      s,
    );
    await ensureOk(res, s);
    for await (const data of sseData(res)) {
      try {
        const j = JSON.parse(data);
        if (j.type === 'content_block_delta') emit(j.delta?.text);
      } catch {
        /* skip */
      }
    }
    return full;
  }

  // OpenAI-compatible: OpenAI, Ollama, OpenRouter, Groq.
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (s.apiKey) headers.Authorization = `Bearer ${s.apiKey}`;
  const res = await doFetch(
    `${base}/chat/completions`,
    {
      method: 'POST',
      signal,
      headers,
      body: JSON.stringify({
        model: s.model,
        stream: true,
        messages: [{ role: 'system', content: system }, ...messages],
      }),
    },
    s,
  );
  await ensureOk(res, s);
  for await (const data of sseData(res)) {
    try {
      const j = JSON.parse(data);
      emit(j.choices?.[0]?.delta?.content);
    } catch {
      /* skip */
    }
  }
  return full;
}
