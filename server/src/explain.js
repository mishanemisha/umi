// Объяснение формы + 3 задания на закрепление.
// Модель пишет только русский текст и выбирает задания из готовых кандидатов по id:
// японские ответы и неверные варианты строит наш движок, поэтому правильный ответ
// в задании всегда верный, даже если модель ошибётся.
import { RULE, VERB, VERB_BANK, VERB_RULES, cards, surface, text, usable } from './verbs.js';

// 2 — формула ответа: шаги сборки → примеры → проверка; японский текст с чтениями 漢字[かな]
export const PROMPT_VERSION = 2;

// примеры для объяснения: по одному глаголу каждого типа, где форма существует
const EXAMPLE_TYPES = [['ichidan', 'taberu'], ['godan-ku', 'kaku'], ['godan-u', 'kau'], ['godan-mu', 'yomu'],
  ['godan-ru', 'toru'], ['suru', 'suru'], ['kuru', 'kuru']];

export function examples(rule) {
  const out = [];
  for (const [type, id] of EXAMPLE_TYPES) {
    const v = VERB[id] || VERB_BANK.find(x => x.t === type && usable(x, rule));
    if (!v || !usable(v, rule)) continue;
    const c = cards(v, rule);
    out.push({ verb: v.d, reading: v.r, type: v.t, meaning: v.m, form: c.join(''), parts: c, task_ru: text(v, rule.tp) });
    if (out.length >= 4) break;
  }
  return out;
}

const shuffle = (a, rnd) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// кандидаты для заданий: глагол, задание, правильная форма и неверные формы того же глагола.
// Неверные — другие формы этого глагола с другим заданием (иначе вариант тоже верен).
export function candidates(rule, { exclude = [], rnd = Math.random, n = 6 } = {}) {
  const pool = shuffle(VERB_BANK.filter(v => !exclude.includes(v.id) && /N[45]/.test(v.j) && usable(v, rule)), rnd);
  const out = [];
  for (const v of pool) {
    const task = text(v, rule.tp), right = surface(v, rule);
    const seen = new Set([right]), wrong = [];
    // сначала близкие формы (общие теги формы), потом любые
    const near = VERB_RULES.filter(r => r.id !== rule.id && r.ff.some(t => rule.ff.includes(t)));
    for (const r of [...shuffle(near, rnd), ...shuffle(VERB_RULES, rnd)]) {
      if (wrong.length >= 5) break;
      if (!r.mb || !usable(v, r) || text(v, r.tp) === task) continue;
      const s = surface(v, r);
      if (seen.has(s)) continue;
      seen.add(s); wrong.push({ id: 'w' + wrong.length, form: s, task_ru: text(v, r.tp) });
    }
    if (wrong.length < 3) continue;
    out.push({ id: 'c' + out.length, verb_id: v.id, verb: v.d, reading: v.r, meaning: v.m, task_ru: task, right, wrong });
    if (out.length >= n) break;
  }
  return out;
}

export const INSTRUCTIONS = `Ты — преподаватель японского для русскоязычных учеников уровня N5–N3 в приложении umi.
Объясни одну грамматическую форму глагола строго по формуле: 1) как собрать форму по шагам, 2) примеры, 3) короткая проверка.

Правила:
- Пиши по-русски, коротко и просто, без воды, без приветствий и без обращения по имени.
- Японские формы глаголов бери ТОЛЬКО из присланных examples и candidates, не меняй их написание.
- Чтения: после каждого слова или части слова с кандзи сразу пиши чтение этих кандзи в квадратных скобках:
  書[か]かせる, 食[た]べる, 来[こ]ない, 勉強[べんきょう]する. Чтение — только для кандзи, кану не дублируй.
- summary — 1–2 предложения: что значит форма и когда её используют.
- pattern — схема в одну строку, например «V-ない-основа + させ + ませんでした» (без чтений).
- steps — 2–4 шага сборки из словарной формы: какую основу взять, что добавить. В каждом шаге — мини-пример
  на одном из examples (например «書[か]く → 書[か]か»). Покажи разницу для разных типов глаголов из examples.
- notes — 0–2 коротких замечания: оттенок смысла, вежливость или частая ошибка.
- sentences — 1–2 коротких естественных предложения уровня N5–N4 с этой формой (глагол — из examples), jp с чтениями
  для всех кандзи и ru — перевод.
- exercises — ровно 3 задания из разных candidates. question — что выбрать, по-русски (опирайся на task_ru, укажи глагол
  с переводом); wrong_ids — ровно 3 неверных варианта из wrong этого кандидата, самые правдоподобные; why — одно
  предложение, почему верен правильный ответ.
- Не используй Markdown, HTML и эмодзи.`;

export function buildInput(rule, cands) {
  return JSON.stringify({
    form: { id: rule.id, name: rule.nm, grammar: rule.gl, style: rule.st === 'polite' ? 'вежливая' : rule.st === 'plain' ? 'простая' : 'нейтральная' },
    examples: examples(rule),
    candidates: cands.map(c => ({ id: c.id, verb: c.verb, reading: c.reading, meaning: c.meaning, task_ru: c.task_ru, right: c.right, wrong: c.wrong })),
  });
}

const str = (max) => ({ type: 'string', maxLength: max });
export const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['title', 'summary', 'pattern', 'steps', 'notes', 'sentences', 'exercises'],
  properties: {
    title: str(80), summary: str(400), pattern: str(120),
    steps: { type: 'array', minItems: 2, maxItems: 4, items: str(260) },
    notes: { type: 'array', minItems: 0, maxItems: 2, items: str(240) },
    sentences: { type: 'array', minItems: 1, maxItems: 2, items: {
      type: 'object', additionalProperties: false, required: ['jp', 'ru'], properties: { jp: str(160), ru: str(200) },
    } },
    exercises: { type: 'array', minItems: 3, maxItems: 3, items: {
      type: 'object', additionalProperties: false, required: ['candidate_id', 'question', 'wrong_ids', 'why'],
      properties: { candidate_id: str(8), question: str(240), wrong_ids: { type: 'array', minItems: 3, maxItems: 3, items: str(8) }, why: str(300) },
    } },
  },
};

// ответ модели → готовое тело для приложения; бросает ошибку, если ответ нельзя показать
export function assemble(raw, rule, cands) {
  const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const clean = s => String(s || '').replace(/[<>]/g, '').trim();
  const need = (c, m) => { if (!c) throw new Error('invalid model output: ' + m); };
  need(o && Array.isArray(o.steps) && Array.isArray(o.exercises), 'shape');
  need(o.exercises.length === 3, '3 exercises');
  const byId = Object.fromEntries(cands.map(c => [c.id, c]));
  const used = new Set();
  const exercises = o.exercises.map(e => {
    const c = byId[e.candidate_id];
    need(c && !used.has(c.verb_id), 'candidate ' + e.candidate_id);
    used.add(c.verb_id);
    const wrong = [...new Set(e.wrong_ids)].map(id => c.wrong.find(w => w.id === id)).filter(Boolean);
    need(wrong.length === 3, 'wrong ids for ' + e.candidate_id);
    return { verb: c.verb, reading: c.reading, meaning: c.meaning, question: clean(e.question),
      options: [c.right, ...wrong.map(w => w.form)], answer: c.right, why: clean(e.why) };
  });
  need(clean(o.summary) && clean(o.pattern) && o.steps.every(clean), 'empty text');
  const sentences = (o.sentences || []).map(x => ({ jp: clean(x && x.jp), ru: clean(x && x.ru) })).filter(x => x.jp && x.ru).slice(0, 2);
  // примеры форм — из нашего движка (верные всегда), модель их только объясняет
  const ex = examples(rule).map(e => ({ verb: e.verb, reading: e.reading, meaning: e.meaning, form: e.form, ru: e.task_ru }));
  return { form: rule.id, title: clean(o.title) || rule.gl, summary: clean(o.summary), pattern: clean(o.pattern),
    steps: o.steps.map(clean), notes: (o.notes || []).map(clean).filter(Boolean), examples: ex, sentences, exercises };
}

export const ruleById = id => RULE[id] || null;
