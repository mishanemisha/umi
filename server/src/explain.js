// Объяснение формы + 3 задания на закрепление.
// Модель пишет только русский текст и выбирает задания из готовых кандидатов по id:
// японские ответы и неверные варианты строит наш движок, поэтому правильный ответ
// в задании всегда верный, даже если модель ошибётся.
import { RULE, VERB, VERB_BANK, VERB_RULES, cards, surface, text, usable } from './verbs.js';

// 2 — формула ответа: шаги сборки → примеры → проверка; японский текст с чтениями 漢字[かな]
// 3 — таблица «как образуется» по группам спряжения (-iru/-eru, -u, する, 来る) без терминов итидан/годан
export const PROMPT_VERSION = 3;

// группы спряжения так, как их называем ученику; пример — первый глагол группы, у которого есть форма
export const GROUPS = [
  { key: 'ru', label: 'на -iru / -eru', ids: ['taberu', 'miru', 'okiru', 'neru'] },
  { key: 'u', label: 'на -u', ids: ['kaku', 'nomu', 'kau', 'matsu', 'yomu'] },
  { key: 'suru', label: 'する и 〜する', ids: ['suru', 'benkyousuru'] },
  { key: 'kuru', label: '来る', ids: ['kuru'] },
];

function groupExamples(rule) {
  const out = [];
  for (const g of GROUPS) {
    const v = g.ids.map(id => VERB[id]).find(v => v && usable(v, rule));
    if (!v) continue;
    out.push({ key: g.key, group: g.label, verb: v.d, reading: v.r, meaning: v.m, form: surface(v, rule), task_ru: text(v, rule.tp) });
  }
  return out;
}
export const examples = groupExamples;

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

export const INSTRUCTIONS = `Ты — 海先生 (Уми-сэнсэй), преподаватель японского для русскоязычных учеников уровня N5–N3 в приложении umi.
Объясни одну грамматическую форму глагола строго по формуле: 1) что значит форма и как её собрать по шагам, 2) примеры, 3) короткая проверка.
Схему преобразований для конкретного глагола с карточки приложение рисует само — ты объясняешь правило в целом.

Термины: НЕ используй слова «итидан», «годан», «ру-глаголы/у-глаголы» и номера групп. Называй группы так:
«глаголы на -iru/-eru» (食[た]べる, 見[み]る), «глаголы на -u» (書[か]く, 飲[の]む), «する и 〜する», «来[く]る».
Если важно, предупреди об исключениях: некоторые глаголы выглядят как -iru/-eru, но спрягаются как глаголы на -u (帰[かえ]る, 入[はい]る, 走[はし]る).

Правила:
- Пиши по-русски, коротко и просто, без воды, без приветствий и без обращения по имени.
- Японские формы глаголов бери ТОЛЬКО из присланных examples и candidates, не меняй их написание.
- Чтения: после каждого слова или части слова с кандзи сразу пиши чтение этих кандзи в квадратных скобках:
  書[か]かせる, 食[た]べる, 来[こ]ない, 勉強[べんきょう]する. Чтение — только для кандзи, кану не дублируй.
- summary — 1–2 предложения: что значит форма и когда её используют.
- pattern — схема в одну строку, например «V-ない-основа + させ + ませんでした» (без чтений).
- steps — 2–4 коротких шага сборки из словарной формы: от какой формы идём, что меняем, что добавляем.
  В каждом шаге — мини-пример на одном из examples (например «書[か]く → 書[か]か»).
- groups — по одной строке таблицы на каждую группу из examples (key — как в examples): how — как образуется форма
  у этой группы, коротко, без примера (пример приложение подставит само).
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
  required: ['title', 'summary', 'pattern', 'steps', 'notes', 'groups', 'sentences', 'exercises'],
  properties: {
    title: str(80), summary: str(400), pattern: str(120),
    steps: { type: 'array', minItems: 2, maxItems: 4, items: str(260) },
    notes: { type: 'array', minItems: 0, maxItems: 2, items: str(240) },
    groups: { type: 'array', minItems: 1, maxItems: 4, items: {
      type: 'object', additionalProperties: false, required: ['key', 'how'],
      properties: { key: { type: 'string', enum: GROUPS.map(g => g.key) }, how: str(200) },
    } },
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
  const gx = groupExamples(rule);
  const ex = gx.map(e => ({ verb: e.verb, reading: e.reading, meaning: e.meaning, form: e.form, ru: e.task_ru }));
  // таблица по группам: текст модели + пример из движка; группы без формы у примера отбрасываем
  const how = Object.fromEntries((o.groups || []).map(g => [g.key, clean(g.how)]));
  const groups = gx.filter(e => how[e.key]).map(e => ({ key: e.key, label: e.group, how: how[e.key], verb: e.verb, reading: e.reading, form: e.form }));
  need(groups.length >= Math.min(2, gx.length), 'groups table');
  return { form: rule.id, title: clean(o.title) || rule.gl, summary: clean(o.summary), pattern: clean(o.pattern),
    steps: o.steps.map(clean), notes: (o.notes || []).map(clean).filter(Boolean), groups, examples: ex, sentences, exercises };
}

export const ruleById = id => RULE[id] || null;
