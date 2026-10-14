// Вызов OpenAI Responses API со структурированным ответом (JSON Schema, strict).
// Ключ берётся только из секрета воркера env.OPENAI_API_KEY и никогда не уходит клиенту.

// $ за 1M токенов: вход / кэшированный вход / выход (developers.openai.com/api/docs/pricing, 14.10.2026)
export const PRICES = {
  'gpt-6.1-sol': [2.0, 0.1, 10.0],
  'gpt-6-luna': [0.1, 0.01, 0.5],
};

export function costUsd(model, usage) {
  const p = PRICES[model];
  if (!p || !usage) return 0;
  const cached = usage.input_tokens_details?.cached_tokens || 0;
  const fresh = Math.max(0, (usage.input_tokens || 0) - cached);
  return (fresh * p[0] + cached * p[1] + (usage.output_tokens || 0) * p[2]) / 1e6;
}

export async function respond(env, { instructions, input, schema, name }, fetchImpl = fetch) {
  const model = env.AI_MODEL || 'gpt-6.1-sol';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(env.AI_TIMEOUT_MS || 45000));
  try {
    const res = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.OPENAI_API_KEY}` },
      body: JSON.stringify({
        model, instructions, input,
        reasoning: { effort: env.AI_REASONING || 'low' },
        max_output_tokens: 4000,
        store: false,
        text: { format: { type: 'json_schema', name, strict: true, schema } },
      }),
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`openai ${res.status}: ${body?.error?.message || 'no body'}`);
    if (body.status && body.status !== 'completed') throw new Error(`openai status ${body.status}`);
    const msg = (body.output || []).find(o => o.type === 'message');
    const part = msg?.content?.find(c => c.type === 'output_text');
    if (!part) {
      const refusal = msg?.content?.find(c => c.type === 'refusal');
      throw new Error(refusal ? 'openai refusal' : 'openai: empty output');
    }
    return { text: part.text, model, usage: body.usage, cost: costUsd(model, body.usage) };
  } finally {
    clearTimeout(timer);
  }
}
