// Формы глаголов на сервере: тот же движок, что js/modes.js (vbCards / vbFormAvail / vbText),
// на тех же данных (server/data/verbs.json генерирует tools/gen_verbs.py).
// Совпадение с приложением проверяет server/test/verbs.test.mjs.
import DATA from '../data/verbs.json' with { type: 'json' };

export const { VERB_CH, VERB_RULES, VERB_BANK } = DATA;
export const RULE = Object.fromEntries(VERB_RULES.map(r => [r.id, r]));
export const VERB = Object.fromEntries(VERB_BANK.map(v => [v.id, v]));

const STEM = { BASE: 'base', NEGBASE: 'neg', DICT_M: 'dm', DICT_H: 'dh', MASU_LINK: 'ml', NAI_LINK: 'nl',
  BA_M: 'bam', BA_H: 'bah', TE_M: 'tem', TE_H: 'teh', TA_M: 'tam', TA_H: 'tah', POT_M: 'potm', POT_H: 'poth',
  PASS_M: 'pasm', PASS_H: 'pash', CAUSE_M: 'caum', CAUSE_H: 'cauh', CAUSEPASS_M: 'cpm', CAUSEPASS_H: 'cph',
  IMP_M: 'impm', IMP_H: 'imph', VOL_M: 'volm', VOL_H: 'volh', RANUKI_M: 'ranm', RANUKI_H: 'ranh' };

const gateOk = (v, r) => !(r.g && v.x && v.x.includes(r.g));

export function formAvail(v, r, lvl = 'm') {
  if (!gateOk(v, r)) return false;
  for (const card of (r[lvl] || r.m).split('|')) for (let t of card.split('+')) {
    t = t.trim();
    if (STEM[t] != null && !v.cj[STEM[t]]) return false;
  }
  return true;
}

// карточки формы: первая — основа, дальше — куски, которые собирает ученик
export function cards(v, r, lvl = 'm') {
  const out = [];
  (r[lvl] || r.m).split('|').forEach(card => {
    let jp = '';
    card.split('+').forEach(t => {
      t = t.trim();
      const x = STEM[t] != null ? (v.cj[STEM[t]] || '') : (VERB_CH[t] ? VERB_CH[t].j : '');
      if (x && x !== '∅') jp += x;
    });
    jp.split('|').forEach(p => { if (p && p !== '∅') out.push(p); });
  });
  return out;
}

export const surface = (v, r) => cards(v, r).join('');
export const text = (v, tmpl) => String(tmpl || '').replace(/\{ru_([a-z0-9_]+)\}/g, (m, k) => v.ru[k] || ('{' + k + '}'));
export const textOk = t => !!t && !t.includes('∅') && !/\{/.test(t);

// форма доступна глаголу и в задании нет пустых слотов
export const usable = (v, r) => formAvail(v, r) && cards(v, r).length >= 2 && textOk(text(v, r.tp));
