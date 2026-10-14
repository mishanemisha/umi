import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import worker from '../src/index.js';
import { signInitData, verifyInitData } from '../src/telegram.js';
import { candidates, assemble, SCHEMA } from '../src/explain.js';
import { VERB_RULES, VERB_BANK, cards, formAvail, text } from '../src/verbs.js';
import { costUsd } from '../src/openai.js';
import { d1 } from './d1-shim.mjs';

const here = p => fileURLToPath(new URL(p, import.meta.url));
const BOT = '123456:TEST-bot-token';
const ORIGIN = 'https://mishanemisha.github.io';

// подделка OpenAI: отвечает по правилам — 3 разных кандидата, по 3 неверных варианта
function fakeOpenAI({ log = [], broken = 0 } = {}) {
  return async (url, init) => {
    const req = JSON.parse(init.body);
    log.push(req);
    assert.equal(init.headers.authorization, 'Bearer sk-test');
    const cands = JSON.parse(req.input).candidates;
    const out = broken-- > 0
      ? { title: 'x', summary: 'x', pattern: 'x', steps: ['a', 'b'], notes: [], groups: [], sentences: [], exercises: [] }
      : { title: 'Каузатив', summary: 'Заставить или разрешить.', pattern: 'V + させる', steps: ['Шаг 1', 'Шаг 2'], notes: ['<b>Осторожно</b>'],
          sentences: [{ jp: '子[こ]どもに野菜[やさい]を食[た]べさせませんでした。', ru: 'Я не заставил ребёнка есть овощи.' }],
          groups: JSON.parse(req.input).examples.map(e => ({ key: e.key, how: 'Как образуется у ' + e.group })),
          exercises: cands.slice(0, 3).map(c => ({ candidate_id: c.id, question: 'Выберите: ' + c.task_ru, wrong_ids: c.wrong.slice(0, 3).map(w => w.id), why: 'Потому что.' })) };
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(out) }] }],
      usage: { input_tokens: 2000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 1200 } }), { status: 200 });
  };
}
function env(extra = {}) {
  return { DB: d1(here('../schema.sql')), OPENAI_API_KEY: 'sk-test', TELEGRAM_BOT_TOKEN: BOT, ALLOWED_ORIGINS: ORIGIN, AI_MAX_VARIANTS: '2', ...extra };
}
async function call(e, path, body, { user = 42, init } = {}) {
  const initData = init ?? await signInitData({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: user, first_name: 'T' }) }, BOT);
  const res = await worker.fetch(new Request('https://ai.example' + path, { method: 'POST', headers: { origin: ORIGIN, 'content-type': 'application/json', 'x-telegram-init-data': initData }, body: JSON.stringify(body) }), e);
  return { status: res.status, body: await res.json(), headers: res.headers };
}

test('Telegram initData: valid signature passes, tampered, foreign-bot and stale ones fail', async () => {
  const now = Math.floor(Date.now() / 1000);
  const good = await signInitData({ auth_date: String(now), user: JSON.stringify({ id: 7 }) }, BOT);
  assert.equal((await verifyInitData(good, BOT)).id, '7');
  assert.equal(await verifyInitData(good.replace('%22id%22%3A7', '%22id%22%3A8'), BOT), null, 'changed user id');
  assert.equal(await verifyInitData(good, '999:other'), null, 'signed by another bot');
  const old = await signInitData({ auth_date: String(now - 3 * 86400), user: JSON.stringify({ id: 7 }) }, BOT);
  assert.equal(await verifyInitData(old, BOT), null, 'stale');
});

test('requests without valid Telegram signature are rejected and never reach OpenAI', async () => {
  const log = [];
  const e = env({ fetch: fakeOpenAI({ log }) });
  const r = await call(e, '/v1/explain', { form: 'masu_past' }, { init: 'user=%7B%22id%22%3A1%7D&auth_date=1&hash=' + '0'.repeat(64) });
  assert.equal(r.status, 401);
  assert.equal(log.length, 0);
});

test('explain: generates once, then serves from the database; unseen variants first; key never leaks', async () => {
  const log = [];
  const e = env({ fetch: fakeOpenAI({ log }) });
  const a = await call(e, '/v1/explain', { form: 'causative_masu_negative_past', seen: [] });
  assert.equal(a.status, 200);
  assert.equal(a.headers.get('access-control-allow-origin'), ORIGIN);
  assert.equal(a.body.data.exercises.length, 3);
  assert.doesNotMatch(JSON.stringify(a.body), /sk-test/);
  assert.doesNotMatch(a.body.data.notes[0], /</, 'markup stripped');
  // правильный ответ каждого задания — настоящая форма из нашего движка
  const rule = VERB_RULES.find(r => r.id === 'causative_masu_negative_past');
  for (const x of a.body.data.exercises) {
    const v = VERB_BANK.find(v => v.d === x.verb);
    assert.equal(x.answer, cards(v, rule).join(''));
    assert.equal(new Set(x.options).size, 4);
  }
  assert.equal(log[0].text.format.strict, true);
  assert.equal(log[0].store, false);
  assert(a.body.data.examples.length >= 2 && a.body.data.examples.every(x => x.form && x.reading), 'engine-built examples');
  assert.equal(a.body.data.sentences[0].ru, 'Я не заставил ребёнка есть овощи.');
  assert.deepEqual(a.body.data.groups.map(g => g.key), ['ru', 'u', 'suru', 'kuru'], 'table by conjugation group');
  assert.equal(a.body.data.groups[0].form, '食べさせませんでした', 'table examples come from the engine');
  assert.doesNotMatch(log[0].input + log[0].instructions.replace(/НЕ используй слова «итидан», «годан»/, ''), /итидан|годан|ichidan|godan/, 'no ichidan/godan terms reach the model');
  const b = await call(e, '/v1/explain', { form: 'causative_masu_negative_past', seen: [a.body.prompt_v + ':' + a.body.variant, '1:1'] });
  assert.notEqual(b.body.variant, a.body.variant, 'second variant for a learner who saw the first');
  const c = await call(e, '/v1/explain', { form: 'causative_masu_negative_past', seen: ['3:0', '3:1'] });
  assert.equal(c.status, 200);
  assert.equal(log.length, 2, 'max variants reached → served from the database');
  const d = await call(e, '/v1/explain', { form: 'causative_masu_negative_past', seen: [] }, { user: 99 });
  assert.equal(d.status, 200);
  assert.equal(log.length, 2, 'other users get cached content');
  const spent = e.DB.raw.prepare('SELECT cost_usd, calls FROM ai_budget').get();
  assert.equal(spent.calls, 2);
  assert(Math.abs(spent.cost_usd - 2 * costUsd('gpt-6.1-sol', { input_tokens: 2000, input_tokens_details: { cached_tokens: 1000 }, output_tokens: 1200 })) < 1e-9);
});

test('explain: invalid model output is retried once, then the slot is released', async () => {
  const log = [];
  const e = env({ fetch: fakeOpenAI({ log, broken: 1 }) });
  const ok = await call(e, '/v1/explain', { form: 'masu_past' });
  assert.equal(ok.status, 200);
  assert.equal(log.length, 2);
  const e2 = env({ fetch: fakeOpenAI({ broken: 5 }) });
  const bad = await call(e2, '/v1/explain', { form: 'masu_past' });
  assert.equal(bad.status, 502);
  assert.equal(e2.DB.raw.prepare('SELECT count(*) n FROM ai_content').get().n, 0);
});

test('explain: per-user generation limit and the daily budget stop paid calls', async () => {
  const log = [];
  const e = env({ fetch: fakeOpenAI({ log }), AI_USER_DAILY_GENERATIONS: '1', AI_MAX_VARIANTS: '4' });
  assert.equal((await call(e, '/v1/explain', { form: 'masu_past' })).status, 200);
  const r = await call(e, '/v1/explain', { form: 'te_form' });
  assert.equal(r.status, 503);
  assert.equal(log.length, 1);
  const e2 = env({ fetch: fakeOpenAI({ log: [] }), AI_DAILY_BUDGET_USD: '0' });
  assert.equal((await call(e2, '/v1/explain', { form: 'masu_past' })).status, 503);
});

test('report stores a complaint against the served variant', async () => {
  const e = env({ fetch: fakeOpenAI() });
  const a = await call(e, '/v1/explain', { form: 'te_form' });
  const r = await call(e, '/v1/report', { form: 'te_form', variant: a.body.variant, prompt_v: a.body.prompt_v, note: 'неверный шаг' });
  assert.equal(r.status, 200);
  assert.equal(e.DB.raw.prepare('SELECT reports FROM ai_content').get().reports, 1);
});

test('every mode-B form has enough exercise candidates; wrong options never answer the same task', () => {
  for (const rule of VERB_RULES.filter(r => r.mb)) {
    const cs = candidates(rule);
    assert(cs.length >= 3, rule.id + ': ' + cs.length + ' candidates');
    for (const c of cs) for (const w of c.wrong) {
      assert.notEqual(w.form, c.right);
      assert.notEqual(w.task_ru, c.task_ru, rule.id + ' ' + c.verb + ': wrong option has the same task');
    }
  }
  assert.throws(() => assemble({ title: '', summary: 's', pattern: 'p', steps: ['a', 'b'], notes: [], exercises: [{ candidate_id: 'zz', question: 'q', wrong_ids: ['w0', 'w1', 'w2'], why: 'w' }] }, VERB_RULES[0], []));
  assert.equal(SCHEMA.additionalProperties, false);
});

test('server verb engine matches the app engine for every verb × form', () => {
  const root = here('../../');
  const ctx = vm.createContext({});
  vm.runInContext(readFileSync(root + 'js/data/verbs.js', 'utf8') + ';this.B=VERB_BANK;this.R=VERB_RULES;this.C=VERB_CH;', ctx);
  const src = readFileSync(root + 'js/modes.js', 'utf8');
  const grab = name => src.slice(src.indexOf('function ' + name), src.indexOf('\n}\n', src.indexOf('function ' + name)) + 2);
  vm.runInContext(['const VERB_STEM=' + src.match(/const VERB_STEM=(\{[\s\S]*?\});/)[1] + ';',
    grab('vbResolve'), grab('vbGateOk'), grab('vbFormAvail'), grab('vbCards'), grab('vbText')].join('\n') + ';this.app={vbCards,vbFormAvail,vbText};', ctx);
  let n = 0;
  for (const v of ctx.B) for (const r of ctx.R) for (const lvl of ['e', 'm', 'h']) {
    const a = ctx.app.vbFormAvail(v, r, lvl);
    assert.equal(formAvail(v, r, lvl), a, `${v.id} ${r.id} ${lvl}`);
    if (!a) continue;
    assert.equal(cards(v, r, lvl).join('|'), ctx.app.vbCards(v, r, lvl).map(c => c.jp).join('|'));
    n++;
  }
  for (const v of ctx.B.slice(0, 50)) for (const r of ctx.R) assert.equal(text(v, r.tp), ctx.app.vbText(v, r.tp));
  assert(n > 90000);
});
