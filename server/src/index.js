// umi AI — Cloudflare Worker: «Объясни почему» в формах глаголов.
// POST /v1/explain {form, seen:[variant]} → объяснение формы + 3 задания (из кэша D1 или новая генерация)
// POST /v1/report  {form, variant, prompt_v, note} → жалоба на объяснение
// Доступ — только с подписанным Telegram initData (заголовок X-Telegram-Init-Data).
import { PROMPT_VERSION, INSTRUCTIONS, SCHEMA, buildInput, candidates, assemble, ruleById } from './explain.js';
import { verifyInitData } from './telegram.js';
import { respond } from './openai.js';

const PENDING_TTL = 120000; // зависшая генерация освобождает слот через 2 минуты
const num = (v, d) => (v == null || v === '' ? d : Number(v));
const day = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);

function cors(env, req) {
  const origin = req.headers.get('origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  return {
    'access-control-allow-origin': allowed.includes(origin) ? origin : (allowed[0] || 'null'),
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type, x-telegram-init-data',
    'access-control-max-age': '86400',
    vary: 'origin',
  };
}
const json = (env, req, status, body) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...cors(env, req) },
});
const fail = (env, req, status, error, message) => json(env, req, status, { error, message });

async function auth(env, req) {
  const init = req.headers.get('x-telegram-init-data');
  const u = await verifyInitData(init, env.TELEGRAM_BOT_TOKEN, { maxAge: num(env.INIT_DATA_MAX_AGE, 86400) });
  if (u) return u;
  if (env.ALLOW_DEV_USER === '1') return { id: 'dev' };   // только для локального wrangler dev
  return null;
}

// счётчик запросов пользователя за сутки; возвращает текущие значения
async function touchUsage(db, user, field) {
  await db.prepare(`INSERT INTO ai_usage (day, user_id, ${field}) VALUES (?1, ?2, 1)
    ON CONFLICT(day, user_id) DO UPDATE SET ${field} = ${field} + 1`).bind(day(), user).run();
  return db.prepare('SELECT generations, requests FROM ai_usage WHERE day = ?1 AND user_id = ?2').bind(day(), user).first();
}

const serve = async (db, row) => {
  await db.prepare('UPDATE ai_content SET served = served + 1 WHERE form_id = ?1 AND prompt_v = ?2 AND variant = ?3')
    .bind(row.form_id, row.prompt_v, row.variant).run();
  return { variant: row.variant, prompt_v: row.prompt_v, data: JSON.parse(row.body) };
};

async function generate(env, rule) {
  let lastErr;
  for (let attempt = 0; attempt < 2; attempt++) {
    const cands = candidates(rule);
    if (cands.length < 3) throw new Error('not enough candidates for ' + rule.id);
    const out = await respond(env, { instructions: INSTRUCTIONS, input: buildInput(rule, cands), schema: SCHEMA, name: 'verb_form_explanation' }, env.fetch || fetch);
    await env.DB.prepare(`INSERT INTO ai_budget (day, cost_usd, calls) VALUES (?1, ?2, 1)
      ON CONFLICT(day) DO UPDATE SET cost_usd = cost_usd + ?2, calls = calls + 1`).bind(day(), out.cost).run();
    try {
      return { ...out, data: assemble(out.text, rule, cands) };
    } catch (e) { lastErr = e; }   // модель нарушила правила — одна повторная попытка
  }
  throw lastErr;
}

async function explain(env, req, user) {
  const body = await req.json().catch(() => null);
  const rule = body && ruleById(String(body.form || ''));
  if (!rule) return fail(env, req, 400, 'bad_form', 'Неизвестная форма');
  // seen — «версия:вариант»: после смены промпта старые просмотры не мешают получить новые варианты
  const seen = (Array.isArray(body.seen) ? body.seen : []).slice(0, 40)
    .map(x => String(x).match(/^(\d+):(\d+)$/)).filter(m => m && Number(m[1]) === PROMPT_VERSION).map(m => Number(m[2]));
  const db = env.DB, maxV = num(env.AI_MAX_VARIANTS, 4);

  const usage = await touchUsage(db, user.id, 'requests');
  if (usage.requests > num(env.AI_USER_DAILY_REQUESTS, 300)) return fail(env, req, 429, 'too_many', 'Слишком много запросов сегодня, попробуйте завтра');

  const rows = (await db.prepare('SELECT * FROM ai_content WHERE form_id = ?1 AND prompt_v = ?2')
    .bind(rule.id, PROMPT_VERSION).all()).results || [];
  const ok = rows.filter(r => r.status === 'ok').sort((a, b) => a.served - b.served);
  const unseen = ok.filter(r => !seen.includes(r.variant));
  if (unseen.length) return json(env, req, 200, await serve(db, unseen[0]));

  // все готовые варианты ученик видел — пробуем сделать новый
  const now = Date.now();
  const taken = new Set(rows.filter(r => r.status !== 'pending' || now - r.created_at < PENDING_TTL).map(r => r.variant));
  const slot = [...Array(maxV).keys()].find(v => !taken.has(v));
  const budget = await db.prepare('SELECT cost_usd FROM ai_budget WHERE day = ?1').bind(day()).first();
  const canGen = slot != null && env.OPENAI_API_KEY
    && usage.generations < num(env.AI_USER_DAILY_GENERATIONS, 10)
    && (budget?.cost_usd || 0) < num(env.AI_DAILY_BUDGET_USD, 2);

  if (canGen) {
    // занимаем слот: двойное нажатие или второй пользователь не запустят вторую платную генерацию
    const lock = await db.prepare(`INSERT INTO ai_content (form_id, variant, prompt_v, status, created_at) VALUES (?1, ?2, ?3, 'pending', ?4)
      ON CONFLICT(form_id, prompt_v, variant) DO UPDATE SET status = 'pending', created_at = ?4
      WHERE ai_content.status = 'pending' AND ?4 - ai_content.created_at >= ${PENDING_TTL}`)
      .bind(rule.id, slot, PROMPT_VERSION, now).run();
    if (lock.meta.changes === 1) {
      await touchUsage(db, user.id, 'generations');
      try {
        const g = await generate(env, rule);
        await db.prepare(`UPDATE ai_content SET status = 'ok', body = ?4, model = ?5, tokens_in = ?6, tokens_out = ?7, cost_usd = ?8, served = 1
          WHERE form_id = ?1 AND prompt_v = ?2 AND variant = ?3`)
          .bind(rule.id, PROMPT_VERSION, slot, JSON.stringify(g.data), g.model, g.usage?.input_tokens || 0, g.usage?.output_tokens || 0, g.cost).run();
        return json(env, req, 200, { variant: slot, prompt_v: PROMPT_VERSION, data: g.data });
      } catch (e) {
        await db.prepare(`DELETE FROM ai_content WHERE form_id = ?1 AND prompt_v = ?2 AND variant = ?3 AND status = 'pending'`)
          .bind(rule.id, PROMPT_VERSION, slot).run();
        console.error('generate failed', rule.id, String(e && e.message || e));
        if (!ok.length) return fail(env, req, 502, 'ai_failed', 'Не получилось подготовить объяснение, попробуйте ещё раз');
      }
    }
  }
  if (ok.length) return json(env, req, 200, await serve(db, ok[0]));
  if (rows.some(r => r.status === 'pending' && now - r.created_at < PENDING_TTL))
    return json(env, req, 202, { pending: true, retry_after: 3 });
  return fail(env, req, 503, 'unavailable', 'Объяснения сейчас недоступны, попробуйте позже');
}

async function report(env, req, user) {
  const b = await req.json().catch(() => null);
  if (!b || !ruleById(String(b.form || '')) || !Number.isInteger(b.variant)) return fail(env, req, 400, 'bad_report', 'Неверная жалоба');
  const pv = Number.isInteger(b.prompt_v) ? b.prompt_v : PROMPT_VERSION;
  await env.DB.batch([
    env.DB.prepare('INSERT INTO ai_reports (form_id, prompt_v, variant, user_id, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)')
      .bind(b.form, pv, b.variant, user.id, String(b.note || '').slice(0, 500), Date.now()),
    env.DB.prepare('UPDATE ai_content SET reports = reports + 1 WHERE form_id = ?1 AND prompt_v = ?2 AND variant = ?3').bind(b.form, pv, b.variant),
  ]);
  return json(env, req, 200, { ok: true });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(env, req) });
    if (req.method === 'GET' && url.pathname === '/v1/health') return json(env, req, 200, { ok: true, prompt_v: PROMPT_VERSION });
    if (req.method !== 'POST') return fail(env, req, 405, 'method', 'Метод не поддерживается');
    const user = await auth(env, req);
    if (!user) return fail(env, req, 401, 'auth', 'Откройте umi в Telegram');
    try {
      if (url.pathname === '/v1/explain') return await explain(env, req, user);
      if (url.pathname === '/v1/report') return await report(env, req, user);
      return fail(env, req, 404, 'not_found', 'Нет такого адреса');
    } catch (e) {
      console.error('unhandled', String(e && e.stack || e));
      return fail(env, req, 500, 'server', 'Ошибка сервера');
    }
  },
};
