// Упражнения на слова: новое предложение и толкование слова на простом японском.
// Контент не персональный: на слово хранится до AI_EX_MAX_VARIANTS вариантов, ученик получает
// тот, которого ещё не видел. Модель получает только слово, чтение и значение.
// Всё, что вернула модель, проверяется здесь: слово стоит в предложении, плитки складываются
// в то же предложение, неверные варианты не совпадают с ответом, в толковании нет самого слова.

export const EX_PROMPT_VERSION = 1;

const JP = /^[぀-ヿ㐀-鿿々ー0-9０-９]+$/;
const KANA = /^[぀-ヿー]+$/;
const KANJI = /[㐀-鿿々]/;
const PUNCT = /[、。？！!?「」]/g;
const clean = s => String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();

// слово от клиента: только японские знаки в слове и чтении, короткое значение без разметки
export function cleanWord(x) {
  const w = clean(x && x.w), r = clean(x && x.r);
  const m = clean(x && x.m).replace(/[^\p{L}\p{N} ,.()\-]/gu, '').slice(0, 60);
  if (!w || [...w].length > 12 || !JP.test(w)) return null;
  if (r && ([...r].length > 24 || !KANA.test(r))) return null;
  if (!m) return null;
  return { w, r, m, key: `${w}|${r}` };
}

export const EX_INSTRUCTIONS = `Ты — 海先生 (Уми-сэнсэй), преподаватель японского для русскоязычных учеников уровня N5–N3 в приложении umi.
Для одного японского слова подготовь материал для двух упражнений: предложение и толкование.

Вход — JSON: word (слово), reading (чтение), meaning_ru (значение, в котором слово учат; если оно явно не подходит слову, опирайся на само слово).

sentence — одно естественное предложение, каким говорят в жизни, 8–28 знаков, простая лексика и грамматика.
- Слово встречается ровно один раз, в значении meaning_ru. Глагол или прилагательное можно поставить в нужную форму.
- Контекст должен подсказывать слово: без него предложение теряет смысл.
- tokens: предложение по словам и частицам, по порядку. Знаки препинания — отдельными токенами.
  s — как написано в предложении; r — чтение всего токена хираганой, если в s есть кандзи (обязательно), иначе пустая строка;
  g — короткий русский перевод слова или роль частицы (2–5 слов), у знаков препинания пустая строка.
- target_index — номер токена (с нуля), в котором стоит слово.
- ru — естественный русский перевод предложения.
- wrong — три слова той же части речи и в той же грамматической форме, что слово в предложении, которые по смыслу в это предложение явно не подходят. Не синонимы. У каждого s (слово) и r (чтение хираганой, если в слове есть кандзи, иначе пустая строка).
- chunks — то же предложение без знаков препинания, разрезанное на 3–6 плиток по смысловым группам (слово вместе со своей частицей). Склеенные подряд плитки дают предложение, границы плиток совпадают с границами токенов.
- orders — другие порядки плиток, которые тоже грамматичны и значат то же самое: массивы номеров плиток. Если таких нет, пустой массив.
- extra — одна лишняя плитка: похожа на одну из плиток, но с неверной частицей или формой; s и r как у wrong.

definition — толкование слова на простом японском, как в словаре для изучающих: 1–2 коротких предложения, 10–40 знаков.
- Нельзя использовать само слово и его кандзи.
- tokens — в том же формате, что у предложения.

Темы спокойные и бытовые: без насилия, политики, религии, болезней и грубости. Никакой разметки и HTML.`;

const PAIR = { type: 'object', additionalProperties: false, required: ['s', 'r'], properties: { s: { type: 'string' }, r: { type: 'string' } } };
const TOKEN = { type: 'object', additionalProperties: false, required: ['s', 'r', 'g'],
  properties: { s: { type: 'string' }, r: { type: 'string' }, g: { type: 'string' } } };
export const EX_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['sentence', 'definition'],
  properties: {
    sentence: {
      type: 'object', additionalProperties: false, required: ['tokens', 'target_index', 'ru', 'wrong', 'chunks', 'orders', 'extra'],
      properties: {
        tokens: { type: 'array', items: TOKEN },
        target_index: { type: 'integer' },
        ru: { type: 'string' },
        wrong: { type: 'array', items: PAIR },
        chunks: { type: 'array', items: { type: 'string' } },
        orders: { type: 'array', items: { type: 'array', items: { type: 'integer' } } },
        extra: PAIR,
      },
    },
    definition: { type: 'object', additionalProperties: false, required: ['tokens'], properties: { tokens: { type: 'array', items: TOKEN } } },
  },
};

export const exInput = word => JSON.stringify({ word: word.w, reading: word.r, meaning_ru: word.m });

function tokens(list, min, max, what) {
  const need = (c, m) => { if (!c) throw new Error(`invalid model output: ${what}: ${m}`); };
  need(Array.isArray(list) && list.length >= min && list.length <= max, 'token count');
  return list.map(t => {
    const s = clean(t.s), r = clean(t.r), g = clean(t.g).slice(0, 80);
    need(s && [...s].length <= 14 && JP.test(s.replace(PUNCT, '') || 'あ'), 'token text');
    const isPunct = !s.replace(PUNCT, '');
    // без чтения кандзи нельзя показать слово каной тем, кто этих кандзи не знает
    need(!KANJI.test(s) || KANA.test(r), 'reading for kanji');
    return [s, KANJI.test(s) ? r : '', isPunct ? '' : g];
  });
}

// ответ модели → данные для приложения: { s: предложение, d: толкование }
export function exAssemble(text, word) {
  const need = (c, m) => { if (!c) throw new Error('invalid model output: ' + m); };
  let o;
  try { o = JSON.parse(text); } catch { need(false, 'not json'); }
  need(o && o.sentence && o.definition, 'shape');
  const s = o.sentence;

  const t = tokens(s.tokens, 3, 22, 'sentence');
  const jp = t.map(x => x[0]).join('');
  need([...jp].length <= 44, 'sentence too long');
  const i = s.target_index;
  need(Number.isInteger(i) && i >= 0 && i < t.length, 'target index');
  const target = t[i][0];
  const stem = [...word.w].find(c => KANJI.test(c)) || [...word.w].slice(0, 2).join('');
  need(target.includes(stem), 'target token is not the word');
  need(t.every((x, k) => k === i || !x[0].includes(word.w)), 'word used twice');

  const ru = clean(s.ru);
  need(ru.length >= 2 && ru.length <= 200 && /[а-яё]/i.test(ru), 'translation');

  // слово с чтением: [слово, чтение]; с кандзи без чтения не годится
  const flat = x => x.replace(PUNCT, '');
  const pair = x => {
    const w = flat(clean(x && x.s)), r = clean(x && x.r);
    if (!w || [...w].length > 14 || !JP.test(w) || (KANJI.test(w) && !KANA.test(r))) return null;
    return [w, KANJI.test(w) ? r : ''];
  };
  const wrong = [...new Map((Array.isArray(s.wrong) ? s.wrong : []).map(pair).filter(x => x && x[0] !== target).map(x => [x[0], x])).values()];
  need(wrong.length >= 3, 'wrong options');

  // плитки для «Собери предложение» — группы соседних токенов. Необязательная часть:
  // если плитки не складываются в предложение по границам токенов, остаётся пустой
  const strs = (Array.isArray(s.chunks) ? s.chunks : []).map(c => flat(clean(c))).filter(Boolean);
  const words = t.map((x, k) => k).filter(k => flat(t[k][0]));
  let c = [], p = 0;
  if (strs.length >= 3 && strs.length <= 7 && new Set(strs).size === strs.length) {
    for (const str of strs) {
      let acc = ''; const group = [];
      while (p < words.length && acc.length < str.length) { acc += flat(t[words[p]][0]); group.push(words[p++]); }
      if (acc !== str) { c = []; p = -1; break; }
      c.push(group);
    }
    if (p !== words.length) c = [];
  }
  const n = c.length, seen = new Set([[...Array(n).keys()].join(',')]), orders = [];
  for (const ord of Array.isArray(s.orders) ? s.orders : []) {
    if (!n || !Array.isArray(ord) || ord.length !== n || [...ord].sort((a, b) => a - b).some((v, k) => v !== k)) continue;
    const id = ord.join(',');
    if (!seen.has(id) && orders.length < 5) { seen.add(id); orders.push(ord); }
  }
  let extra = n ? pair(s.extra) : null;
  if (extra && ([...extra[0]].length > 10 || strs.includes(extra[0]))) extra = null;

  const d = tokens(o.definition.tokens, 3, 28, 'definition');
  const def = d.map(x => x[0]).join('');
  need([...def].length <= 60, 'definition too long');
  need(!def.includes(word.w) && !(KANJI.test(stem) && def.includes(stem)), 'definition contains the word');

  return { s: { t, i, ru, wrong: wrong.slice(0, 3), c, orders, extra }, d: { t: d } };
}
