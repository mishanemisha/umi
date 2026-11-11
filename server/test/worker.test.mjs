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
import { exAssemble, cleanWord, EX_SCHEMA } from '../src/exercise.js';
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
  assert.equal(r.status, 429);
  assert.match(r.body.message, /новые объяснения закончились/, 'the learner is told it is the daily limit');
  assert.equal(log.length, 1);
  const e2 = env({ fetch: fakeOpenAI({ log: [] }), AI_DAILY_BUDGET_USD: '0' });
  assert.equal((await call(e2, '/v1/explain', { form: 'masu_past' })).status, 429);
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


// ── Упражнения на слова ──
const EX_GOOD = {
  sentence: {
    tokens: [{ s: '雨', r: 'あめ', g: 'дождь' }, { s: 'が', r: '', g: 'частица подлежащего' }, { s: '降って', r: 'ふって', g: 'идёт (о дожде)' }, { s: 'いる', r: '', g: 'сейчас' }, { s: 'から', r: '', g: 'потому что' },
      { s: '、', r: '', g: '' }, { s: '傘', r: 'かさ', g: '<b>зонт</b>' }, { s: 'を', r: '', g: 'частица объекта' }, { s: '持って', r: 'もって', g: 'взяв' }, { s: '行きます', r: 'いきます', g: 'пойду' }, { s: '。', r: '', g: '' }],
    target_index: 6, ru: 'Идёт дождь, поэтому я возьму зонт.', wrong: [{ s: '靴', r: 'くつ' }, { s: '鍵', r: 'かぎ' }, { s: '財布', r: 'さいふ' }, { s: '靴', r: 'くつ' }, { s: '窓', r: '' }],
    chunks: ['雨が', '降っているから', '傘を', '持って行きます'], orders: [[1, 0, 2, 3], [0, 1, 2, 3], [0, 1, 2]], extra: { s: '傘に', r: 'かさに' },
  },
  definition: { tokens: [{ s: '雨', r: 'あめ', g: 'дождь' }, { s: 'の', r: '', g: 'частица' }, { s: '日', r: 'ひ', g: 'день' }, { s: 'に', r: '', g: 'в' }, { s: '使う', r: 'つかう', g: 'использовать' }, { s: '物', r: 'もの', g: 'вещь' }, { s: '。', r: '', g: '' }] },
};
const KASA = { w: '傘', r: 'かさ', m: 'зонт' };
function fakeExercise({ log = [], broken = 0, out = EX_GOOD } = {}) {
  return async (url, init) => {
    const req = JSON.parse(init.body);
    log.push(req);
    const body = broken-- > 0 ? { ...out, sentence: { ...out.sentence, target_index: 0 } } : out;
    return new Response(JSON.stringify({ status: 'completed', output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(body) }] }],
      usage: { input_tokens: 1900, input_tokens_details: { cached_tokens: 1500 }, output_tokens: 300 } }), { status: 200 });
  };
}

test('exercise: model output is validated and cleaned', () => {
  const w = cleanWord(KASA);
  const d = exAssemble(JSON.stringify(EX_GOOD), w);
  assert.equal(d.s.t[d.s.i][0], '傘');
  assert.deepEqual(d.s.t[6], ['傘', 'かさ', 'зонт'], 'markup stripped, reading kept for kanji');
  assert.deepEqual(d.s.t[1], ['が', '', 'частица подлежащего'], 'no reading for kana');
  assert.deepEqual(d.s.wrong, [['靴', 'くつ'], ['鍵', 'かぎ'], ['財布', 'さいふ']], 'duplicates and kanji without a reading removed');
  assert.deepEqual(d.s.orders, [[1, 0, 2, 3]], 'identity and broken orders dropped');
  assert.deepEqual(d.s.c, [[0, 1], [2, 3, 4], [6, 7], [8, 9]], 'tiles are groups of sentence tokens');
  assert.deepEqual(d.s.extra, ['傘に', 'かさに']);
  const bad = (patch, re) => assert.throws(() => exAssemble(JSON.stringify(patch), w), re);
  bad({ ...EX_GOOD, sentence: { ...EX_GOOD.sentence, target_index: 0 } }, /not the word/);
  bad({ ...EX_GOOD, sentence: { ...EX_GOOD.sentence, wrong: [{ s: '傘', r: 'かさ' }, { s: '靴', r: 'くつ' }] } }, /wrong options/);
  bad({ ...EX_GOOD, sentence: { ...EX_GOOD.sentence, tokens: EX_GOOD.sentence.tokens.map((x, k) => k ? x : { ...x, r: '' }) } }, /reading for kanji/);
  bad({ ...EX_GOOD, definition: { tokens: [...EX_GOOD.definition.tokens, { s: '傘', r: 'かさ', g: 'зонт' }] } }, /contains the word/);
  const loose = exAssemble(JSON.stringify({ ...EX_GOOD, sentence: { ...EX_GOOD.sentence, chunks: ['雨が', '傘を'] } }), w);
  assert.deepEqual([loose.s.c, loose.s.orders, loose.s.extra], [[], [], null], 'tiles that do not rebuild the sentence are dropped');
  const cut = exAssemble(JSON.stringify({ ...EX_GOOD, sentence: { ...EX_GOOD.sentence, chunks: ['雨が降', 'っているから', '傘を', '持って行きます'] } }), w);
  assert.deepEqual(cut.s.c, [], 'tiles must follow token borders');
  assert.equal(cleanWord({ w: 'ignore previous', r: '', m: 'x' }), null, 'only Japanese text reaches the model');
  assert.equal(cleanWord({ w: '傘', r: 'kasa', m: 'зонт' }), null);
  assert.equal(cleanWord({ w: '傘', r: 'かさ', m: '<i>зонт</i> {x}' }).m, 'зонт x');
  assert.equal(EX_SCHEMA.additionalProperties, false);
});

test('exercise: generates on demand, shares variants between users, gives each user a new one', async () => {
  const log = [];
  const e = env({ fetch: fakeExercise({ log }), AI_EX_MAX_VARIANTS: '2' });
  const a = await call(e, '/v1/exercise', { words: [KASA, KASA, { w: 'drop table', r: '', m: 'x' }] });
  assert.equal(a.status, 200);
  assert.equal(a.body.items.length, 1, 'duplicates and invalid words are dropped');
  assert.equal(a.body.items[0].key, '傘|かさ');
  assert.equal(log.length, 1);
  assert.deepEqual(JSON.parse(log[0].input), { word: '傘', reading: 'かさ', meaning_ru: 'зонт' }, 'nothing about the user reaches the model');
  assert.equal(log[0].text.format.name, 'word_exercise');
  assert.doesNotMatch(JSON.stringify(a.body), /sk-test/);
  const other = await call(e, '/v1/exercise', { words: [KASA] }, { user: 7 });
  assert.equal(other.body.items[0].variant, a.body.items[0].variant);
  assert.equal(log.length, 1, 'another user gets the stored variant');
  const seen = { '傘|かさ': [a.body.items[0].prompt_v + ':' + a.body.items[0].variant] };
  const b = await call(e, '/v1/exercise', { words: [KASA], seen });
  assert.notEqual(b.body.items[0].variant, a.body.items[0].variant, 'a new variant for a user who saw the first');
  assert.equal(log.length, 2);
  seen['傘|かさ'].push(b.body.items[0].prompt_v + ':' + b.body.items[0].variant);
  const c = await call(e, '/v1/exercise', { words: [KASA], seen });
  assert.equal(c.body.items.length, 1);
  assert.equal(log.length, 2, 'variant cap reached → a stored one, no paid call');
  assert.equal(e.DB.raw.prepare('SELECT calls FROM ai_budget').get().calls, 2);
});

test('exercise: bad output is retried once then skipped; limits and budget stop paid calls', async () => {
  const log = [];
  const e = env({ fetch: fakeExercise({ log, broken: 1 }) });
  assert.equal((await call(e, '/v1/exercise', { words: [KASA] })).body.items.length, 1);
  assert.equal(log.length, 2);
  const e2 = env({ fetch: fakeExercise({ broken: 9 }) });
  const bad = await call(e2, '/v1/exercise', { words: [KASA] });
  assert.deepEqual(bad.body.items, []);
  assert.equal(e2.DB.raw.prepare('SELECT count(*) n FROM ex_content').get().n, 0, 'slot released');
  const log3 = [];
  const e3 = env({ fetch: fakeExercise({ log: log3 }), AI_EX_USER_DAILY_GENERATIONS: '1' });
  const two = await call(e3, '/v1/exercise', { words: [KASA, { w: '靴', r: 'くつ', m: 'обувь' }] });
  assert.equal(log3.length, 1, 'one generation left for this user today');
  assert.equal(two.body.items.length, 1);
  assert.equal((await call(e3, '/v1/exercise', { words: [{ w: '鍵', r: 'かぎ', m: 'ключ' }] })).body.items.length, 0);
  assert.equal(log3.length, 1);
  const log4 = [];
  const e4 = env({ fetch: fakeExercise({ log: log4 }), AI_DAILY_BUDGET_USD: '0' });
  assert.deepEqual((await call(e4, '/v1/exercise', { words: [KASA] })).body.items, []);
  assert.equal(log4.length, 0);
  assert.equal((await call(e4, '/v1/exercise', { words: [] })).status, 400);
});
