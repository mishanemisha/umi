/* Local original practice; no model calls. The full static bank is loaded at boot. */
'use strict';
const UMI = window.UMI_BANK;
/* Слова и кандзи учим только во фразах: прямые задания «выбери значение / чтение» в тренировки
 * не попадают (остаются в банке ради старой истории). Вместо них — «подставь слово»: из готовых
 * фраз урока делаем пропуск на месте слова темы, отдельно кана и кандзи. */
function uDirect(e) {
  return e.focus === 'vocabulary' && e.type === 'choice';
}
(function uWordGaps() {
  const words = Object.fromEntries(UMI.words.map(w => [w.id, w])),
    lessonNo = Object.fromEntries(UMI.lessons.map(l => [l.id, l.number])),
    wordLesson = Object.fromEntries(UMI.lessons.flatMap(l => l.wordIds.map(id => [id, l.number]))),
    byId = Object.fromEntries(UMI.exercises.map(e => [e.id, e]));
  // стабильный порядок дистракторов: id заданий и вариантов не меняются между загрузками
  const hash = s => {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    return h >>> 0;
  };
  const text = (e, id) => e.options.find(o => o.id === id).text;
  const sentence = e =>
    e.type === 'order'
      ? e.acceptedSequences[0].map(id => text(e, id)).join('')
      : e.prompt
          .map(t => t.text)
          .join('')
          .replace(/\{\{([^}]+)\}\}/g, (_, s) => text(e, e.slots.find(x => x.id === s).acceptedOptionIds[0]));
  // слово целиком: до него начало, пробел, знак или частица; после — конец, знак, частица или связка
  const find = (s, reading) =>
    new RegExp(
      '(^|[\\s　、。「]|[はがのをにでともへやか])' + reading + '(?=$|[\\s　、。？！?!」]|[はがのをにでともへやかよね]|です|でし|じゃ|だ|こと)'
    ).exec(s);
  const distractors = (w, lesson, key, kanji) =>
    UMI.words
      .filter(x => x.id !== w.id && x.reading !== w.reading && (!kanji || (x.surface !== x.reading && x.surface !== w.surface)))
      .map(x => [
        x,
        (x.partOfSpeech === w.partOfSpeech ? 0 : 4) +
          (wordLesson[x.id] === lessonNo[lesson] ? 0 : wordLesson[x.id] < lessonNo[lesson] ? 1 : 2),
        hash(key + x.id)
      ])
      .sort((a, b) => a[1] - b[1] || a[2] - b[2])
      .slice(0, 3)
      .map(([x]) => x);
  const made = [];
  for (const l of UMI.lessons) {
    const used = new Set(),
      count = {};
    // готовые «Слово в контексте» не повторяем
    for (const id of l.exerciseIds) {
      const e = byId[id];
      if (e?.focus === 'vocabulary' && e.type === 'gap') used.add(sentence(e).replace(/\s/g, '') + e.targetWordIds[0]);
    }
    const sources = l.exerciseIds
      .map(id => byId[id])
      .filter(
        e =>
          e &&
          e.focus !== 'vocabulary' &&
          !e.mixedText &&
          (e.type === 'gap' || e.type === 'order') &&
          e.translationRu &&
          !e.translationRu.includes('\n')
      )
      .sort((a, b) => (a.type === 'gap' ? 0 : 1) - (b.type === 'gap' ? 0 : 1));
    for (const src of sources) {
      const s = sentence(src);
      for (const wid of l.wordIds) {
        const w = words[wid],
          key = s.replace(/\s/g, '') + wid,
          m = w && find(s, w.reading);
        if (!m || used.has(key)) continue;
        used.add(key);
        const prompt = s.slice(0, m.index) + m[1] + '{{answer}}' + s.slice(m.index + m[0].length);
        for (const kanji of [false, true]) {
          const kind = kanji ? 'kanji' : 'kana';
          if ((kanji && w.surface === w.reading) || (count[wid + kind] = (count[wid + kind] || 0) + 1) > (kanji ? 2 : 4))
            continue;
          const id = `${src.id}.${wid}.${kind}`,
            answer = kanji ? w.surface : w.reading,
            others = distractors(w, l.id, id, kanji);
          if (others.length < 3) continue;
          const gloss = `${w.surface === w.reading ? w.reading : w.surface + '（' + w.reading + '）'} — ${w.meaningsRu.join(', ')}.`;
          made.push({
            id,
            version: 1,
            status: 'draft',
            type: 'gap',
            focus: 'vocabulary',
            lessonId: l.id,
            skillIds: [`${wid}.${kanji ? 'kanji' : 'usage'}`],
            targetWordIds: [wid],
            prerequisiteSkillIds: [],
            instructionRu: kanji ? 'Подставь слово кандзи' : 'Подставь недостающее слово',
            prompt: [{ text: prompt, reading: null }],
            translationRu: src.translationRu,
            options: [answer, ...others.map(x => (kanji ? x.surface : x.reading))].map((t, i) => ({
              id: 'o' + i,
              text: t,
              feedbackRu: i ? `«${t}» — другое слово.` : 'Верно. ' + gloss,
              misconceptionId: i ? 'context.form' : null
            })),
            slots: [{ id: 'answer', acceptedOptionIds: ['o0'] }],
            acceptedChoiceIds: [],
            acceptedSequences: [],
            allowOptionReuse: false,
            explanationRu: gloss,
            display: { hideReadings: false },
            difficulty: kanji ? 'challenge' : 'basic',
            familyId: `${wid}.${kind}.${key}`,
            labelRu: kanji ? 'Кандзи в контексте' : 'Слово в контексте',
            optionAliases: {},
            removedOptionIds: [],
            conditionsRu: [],
            provenance: src.provenance,
            generated: true
          });
          l.exerciseIds.push(id);
        }
      }
    }
  }
  UMI.exercises.push(...made);
})();
const UEX = Object.assign(Object.create(null), Object.fromEntries(UMI.exercises.map(e => [e.id, e])));
const UWORDS = Object.assign(Object.create(null), Object.fromEntries(UMI.words.map(w => [w.id, w])));
const ULESSONS = Object.assign(Object.create(null), Object.fromEntries(UMI.lessons.map(l => [l.id, l])));
const UKEY = 'umi.practice.v1';
const uDefault = () => ({
  version: 1,
  selectedLessons: [],
  count: '20',
  difficulty: 'all',
  sessions: {},
  history: [],
  mode: 'mixed',
  volume: '1',
  display: 'kana',
  lessonId: null,
  view: 'menu',
  openRule: null,
  session: null,
  attempts: [],
  skills: {},
  mistakes: {},
  wordLinks: {}
});
let UP = uDefault();
let uStorageError = '';
let uPendingImport = null;
function uScope(id) {
  return id === 'all' ? UMI.lessons.map(l => l.id) : id.startsWith('mix,') ? id.slice(4).split(',') : [id];
}
function uScopeValid(id) {
  if (typeof id !== 'string') return false;
  const ids = uScope(id);
  return ids.length > 0 && new Set(ids).size === ids.length && ids.every(x => ULESSONS[x]);
}
function uScopeTitle(id, mode) {
  if (mode === 'mistakes') return 'Ошибки';
  return id.startsWith('mix,') ? 'Смешанная тренировка' : ULESSONS[id]?.titleRu || 'Все темы';
}
function uScopeBack(id) {
  return id.startsWith('mix,') ? 'mix' : ULESSONS[id] ? 'lesson:' + id : 'catalog';
}
function uMixKey() {
  return (
    'mix,' +
    UMI.lessons
      .filter(l => UP.selectedLessons.includes(l.id))
      .map(l => l.id)
      .join(',')
  );
}
function uUnits(e, attempt) {
  if (attempt.slotResults) return attempt.slotResults;
  const slots = e.type === 'gap' ? e.slots : [{ id: 'answer', skillIds: e.skillIds }];
  return slots.map(slot => {
    const correct =
      e.type === 'gap'
        ? !attempt.revealedAnswer && slot.acceptedOptionIds.includes(attempt.selection?.[slot.id])
        : attempt.firstAnswerCorrect;
    return {
      id: slot.id,
      skillIds: slot.skillIds || e.skillIds,
      correct,
      independent: correct && !attempt.hintUsed && !attempt.revealedAnswer
    };
  });
}
function uCleanUnits(a) {
  return a ? uUnits(UEX[a.exerciseId], a).filter(x => x.independent).length : 0;
}
function uValidSession(s) {
  return (
    s &&
    typeof s.id === 'string' &&
    Array.isArray(s.exerciseIds) &&
    s.exerciseIds.length > 0 &&
    s.exerciseIds.length <= UMI.exercises.length &&
    s.exerciseIds.every(id => UEX[id]) &&
    new Set(s.exerciseIds).size === s.exerciseIds.length &&
    Number.isInteger(s.position) &&
    s.position >= 0 &&
    s.position <= s.exerciseIds.length &&
    s.answers &&
    typeof s.answers === 'object' &&
    s.optionOrders &&
    s.exerciseIds.every(
      id =>
        Array.isArray(s.optionOrders[id]) &&
        s.optionOrders[id].length === UEX[id].options.length &&
        new Set(s.optionOrders[id]).size === UEX[id].options.length &&
        s.optionOrders[id].every(oid => UEX[id].options.some(o => o.id === oid))
    )
  );
}
function uSessionDone(s) {
  return Boolean(s && (s.endedAt || s.position >= s.exerciseIds.length));
}
function uValidateProgress(d) {
  const record = x => x && typeof x === 'object' && !Array.isArray(x);
  if (
    !record(d) ||
    d.version !== 1 ||
    !Array.isArray(d.attempts) ||
    !record(d.skills) ||
    !record(d.mistakes) ||
    !record(d.wordLinks)
  )
    throw Error('Это не файл прогресса umi версии 1.');
  const attemptIds = new Set(),
    skillIds = new Set(UMI.exercises.flatMap(e => e.skillIds));
  for (const a of d.attempts) {
    if (
      !record(a) ||
      typeof a.id !== 'string' ||
      attemptIds.has(a.id) ||
      !UEX[a.exerciseId] ||
      typeof a.firstAnswerCorrect !== 'boolean' ||
      typeof a.hintUsed !== 'boolean' ||
      typeof a.revealedAnswer !== 'boolean'
    )
      throw Error('В файле есть некорректные результаты.');
    if (a.slotResults) {
      const e = UEX[a.exerciseId],
        slots = e.type === 'gap' ? e.slots : [{ id: 'answer', skillIds: e.skillIds }];
      if (
        !Array.isArray(a.slotResults) ||
        a.slotResults.length !== slots.length ||
        !a.slotResults.every(
          (unit, i) =>
            record(unit) &&
            unit.id === slots[i].id &&
            typeof unit.correct === 'boolean' &&
            typeof unit.independent === 'boolean' &&
            (!unit.independent || unit.correct) &&
            Array.isArray(unit.skillIds) &&
            seqEq(unit.skillIds, slots[i].skillIds || e.skillIds)
        )
      )
        throw Error('Повреждена оценка отдельных ответов.');
    }
    attemptIds.add(a.id);
  }
  for (const [id, s] of Object.entries(d.skills))
    if (
      !skillIds.has(id) ||
      !record(s) ||
      !['independentCorrect', 'errors', 'hinted'].every(k => Number.isInteger(s[k]) && s[k] >= 0)
    )
      throw Error('Повреждена статистика навыков.');
  for (const [id, m] of Object.entries(d.mistakes))
    if (
      !UEX[id] ||
      !record(m) ||
      !Array.isArray(m.skillIds) ||
      !m.skillIds.every(s => UEX[id].skillIds.includes(s)) ||
      !Number.isFinite(m.nextReviewAt)
    )
      throw Error('Повреждена очередь повторений.');
  for (const [id, link] of Object.entries(d.wordLinks))
    if (!UWORDS[id] || typeof link !== 'string') throw Error('Повреждены связи со словарём.');
  function validateSession(session) {
    if (session.endedAt !== undefined && (!Number.isFinite(session.endedAt) || session.endedAt <= 0))
      throw Error('Повреждена дата завершения тренировки.');
    // Keep old results while removing the redundant paraphrase from one assembly.
    for (const id of session.exerciseIds || []) {
      const e = UEX[id],
        old = e?.previousOrder,
        order = session.optionOrders?.[id],
        a = session.answers?.[id];
      if (
        old &&
        Array.isArray(order) &&
        order.length === old.ids.length &&
        new Set(order).size === old.ids.length &&
        order.every(oid => old.ids.includes(oid))
      ) {
        const migrate = ids => ids.filter(oid => !old.removed.includes(oid)).map(oid => old.aliases[oid] || oid);
        session.optionOrders[id] = migrate(order);
        if (a) {
          if (!Array.isArray(a.selection) || !a.selection.every(oid => old.ids.includes(oid)))
            throw Error('Повреждена сохранённая сборка.');
          a.selection = migrate(a.selection);
        }
      }
    }
    // Upgrade retained input IDs before checking the current option contract.
    for (const id of session.exerciseIds || []) {
      const e = UEX[id],
        a = session.answers?.[id];
      if (!e?.legacyInput) continue;
      if (Array.isArray(session.optionOrders?.[id]) && !session.optionOrders[id].length)
        session.optionOrders[id] = e.options.map(o => o.id);
      if (a && Object.hasOwn(a.selection || {}, 'text')) {
        if (typeof a.selection.text !== 'string') throw Error('Повреждён введённый ответ.');
        const o = e.options.find(o => uNormalize(o.text) === uNormalize(a.selection.text));
        a.selection = o ? { choice: o.id } : {};
      }
    }
    for (const id of session.exerciseIds || []) {
      const e = UEX[id],
        a = session.answers?.[id],
        order = session.optionOrders?.[id];
      if (!e || !Array.isArray(order)) continue;
      const aliases = e.optionAliases || {},
        removed = e.removedOptionIds || [],
        known = oid => e.options.some(o => o.id === oid) || Object.hasOwn(aliases, oid) || removed.includes(oid);
      if (order.every(known) && new Set(order).size === order.length) {
        const migrated = [...new Set(order.filter(oid => !removed.includes(oid)).map(oid => aliases[oid] || oid))];
        // Append newly introduced Japanese distractors only during a bank upgrade.
        if (order.some(oid => Object.hasOwn(aliases, oid) || removed.includes(oid)))
          session.optionOrders[id] = [...migrated, ...e.options.map(o => o.id).filter(oid => !migrated.includes(oid))];
      }
      if (a && e.type !== 'order' && a.selection && typeof a.selection === 'object')
        for (const [slot, oid] of Object.entries(a.selection)) {
          if (removed.includes(oid)) delete a.selection[slot];
          else if (Object.hasOwn(aliases, oid)) a.selection[slot] = aliases[oid];
        }
      // A previously checked wrong answer is now finished, keeping its first result.
      if (a?.first && !a.checked) {
        a.checked = true;
        a.correct = a.first.firstAnswerCorrect;
      }
    }
    if (!uValidSession(session) || !uScopeValid(session.lessonId))
      throw Error('Файл содержит несовместимый учебный блок.');
    for (const [id, a] of Object.entries(session.answers)) {
      const e = UEX[id];
      if (
        !session.exerciseIds.includes(id) ||
        !record(a) ||
        typeof a.checked !== 'boolean' ||
        typeof a.correct !== 'boolean' ||
        typeof a.hintUsed !== 'boolean' ||
        typeof a.revealedAnswer !== 'boolean'
      )
        throw Error('Повреждён ответ в учебном блоке.');
      if (e.type === 'input') {
        if (!record(a.selection) || typeof a.selection.text !== 'string') throw Error('Повреждён введённый ответ.');
      }
      const selections =
        e.type === 'input'
          ? []
          : e.type === 'order'
            ? a.selection
            : record(a.selection)
              ? Object.values(a.selection)
              : null;
      if (
        !Array.isArray(selections) ||
        !selections.every(oid => e.options.some(o => o.id === oid)) ||
        ((e.type === 'order' || !e.allowOptionReuse) && new Set(selections).size !== selections.length)
      )
        throw Error('Некорректные варианты ответа.');
      if (e.type === 'order' && selections.length > (e.requiredCount || e.acceptedSequences[0].length))
        throw Error('Некорректная сборка.');
      if (a.first && (!attemptIds.has(a.first.id) || a.first.exerciseId !== id))
        throw Error('Не найдена первая попытка.');
      if (a.checked && !a.first) throw Error('Ответ не связан с первой попыткой.');
    }
    for (const id of session.exerciseIds.slice(0, session.position)) {
      const a = session.answers[id];
      if (!a?.first || !a.checked) throw Error('Пропущен незавершённый вопрос.');
    }
    for (const [id, a] of Object.entries(session.answers)) {
      if (a.first) {
        a.first = d.attempts.find(item => item.id === a.first.id);
        const e = UEX[id];
        if (e.type === 'gap')
          a.lockedSlots = e.slots
            .filter(
              slot =>
                slot.acceptedOptionIds.includes(a.selection[slot.id]) &&
                (a.checked || uUnits(e, a.first).some(unit => unit.id === slot.id && unit.correct))
            )
            .map(slot => slot.id);
      }
    }
  }
  if (d.session) validateSession(d.session);
  if (d.sessions !== undefined && !record(d.sessions)) throw Error('Повреждены сохранённые тренировки.');
  if (d.history !== undefined && !Array.isArray(d.history)) throw Error('Повреждена история тренировок.');
  const result = { ...uDefault() };
  for (const key of Object.keys(result)) if (key in d) result[key] = d[key];
  result.sessions = record(d.sessions) ? d.sessions : {};
  result.history = Array.isArray(d.history) ? d.history : [];
  for (const [key, session] of Object.entries(result.sessions)) {
    if (key !== session.lessonId) throw Error('Повреждена сохранённая тренировка темы.');
    validateSession(session);
  }
  if (d.session) result.sessions[d.session.lessonId] = d.session;
  for (const item of result.history)
    if (
      !record(item) ||
      typeof item.id !== 'string' ||
      !uScopeValid(item.lessonId) ||
      !Array.isArray(item.exerciseIds) ||
      !item.exerciseIds.every(id => UEX[id])
    )
      throw Error('Повреждена история тренировок.');
  result.selectedLessons = Array.isArray(d.selectedLessons)
    ? [...new Set(d.selectedLessons.filter(id => ULESSONS[id]))]
    : [];
  if (result.attempts.some(a => UEX[a.exerciseId].slots.length > 1 && !a.slotResults)) {
    result.skills = {};
    for (const a of result.attempts) {
      const e = UEX[a.exerciseId];
      a.slotResults = uUnits(e, a);
      for (const unit of a.slotResults)
        for (const id of unit.skillIds) {
          const skill =
            result.skills[id] ||
            (result.skills[id] = {
              kind: e.focus === 'vocabulary' ? 'vocabulary' : 'grammar',
              independentCorrect: 0,
              errors: 0,
              hinted: 0
            });
          skill[unit.independent ? 'independentCorrect' : unit.correct ? 'hinted' : 'errors']++;
          skill.lastPracticedAt = a.answeredAt;
        }
      if (e.slots.length > 1 && result.mistakes[e.id]) {
        const failed = a.slotResults.filter(x => !x.independent).flatMap(x => x.skillIds);
        if (failed.length) result.mistakes[e.id].skillIds = [...new Set(failed)];
        else delete result.mistakes[e.id];
      }
    }
  }
  return {
    ...result,
    count: ['10', '20', '40', 'all'].includes(d.count) ? d.count : '20',
    difficulty: ['all', 'basic', 'challenge'].includes(d.difficulty) ? d.difficulty : 'all',
    mode: ['mixed', 'grammar', 'vocabulary', 'mistakes'].includes(d.mode) ? d.mode : 'mixed',
    volume: ['1', '2', 'active'].includes(d.volume) ? d.volume : '1',
    display: d.display === 'kanji' ? 'kanji' : 'kana',
    lessonId: ULESSONS[d.lessonId] ? d.lessonId : null,
    view: 'menu',
    openRule: null
  };
}
function uInit() {
  let raw = null;
  try {
    raw = localStorage.getItem(UKEY);
    if (raw) {
      UP = uValidateProgress(JSON.parse(raw));
      uFinish();
    }
  } catch (err) {
    // Копия нечитаемого сохранения: следующее действие перезапишет основной ключ
    try {
      if (raw && !localStorage.getItem(UKEY + '.backup')) localStorage.setItem(UKEY + '.backup', raw);
    } catch {}
    uStorageError = 'Не удалось прочитать сохранение практики. Копия сохранена в ' + UKEY + '.backup. ' + err.message;
  }
}
function uSave() {
  if (UP.session) UP.sessions[UP.session.lessonId] = UP.session;
  const write = () => {
    try {
      localStorage.setItem(UKEY, JSON.stringify(UP));
      return true;
    } catch {
      return false;
    }
  };
  if (write() || (uCompact() && write())) {
    uStorageError = '';
    return true;
  }
  uStorageError = 'Не удалось сохранить прогресс на устройстве. Экспортируйте его перед закрытием приложения.';
  return false;
}
// Нехватка места: у попыток завершённых тренировок убираем детали ответа.
// Оценка уже лежит в slotResults, статистика и история не меняются.
function uCompact() {
  const live = new Set(
    Object.values(UP.sessions)
      .concat(UP.session || [])
      .filter(s => s && !uSessionDone(s))
      .map(s => s.id)
  );
  let changed = false;
  for (const a of UP.attempts)
    if (a.slotResults && !live.has(a.sessionId) && (a.selection !== undefined || a.durationMs !== undefined)) {
      delete a.selection;
      delete a.durationMs;
      changed = true;
    }
  return changed;
}
function uShuffle(values) {
  const a = values.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const U_MODE_LABELS = { mixed: 'Вместе', vocabulary: 'Слова', grammar: 'Грамматика', mistakes: 'Ошибки' };
const U_LEVEL_LABELS = { all: 'Тренировка', basic: 'Базовый', challenge: 'Сложнее' };
function uBtn(label, action, cls = '', disabled = false) {
  const primary = cls.includes('primary'),
    wide = cls.includes('wide');
  return `<button class="${primary ? 'start-btn' : 'chip'} up-button ${wide ? 'wide' : ''}" data-a="up:${esc(action)}" ${disabled ? 'disabled' : ''}>${label}</button>`;
}
function uPlural(n, forms) {
  const last = n % 10,
    tail = n % 100;
  return forms[tail >= 11 && tail <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2];
}
function uTaskCount(n) {
  return `${n} ${uPlural(n, ['задание', 'задания', 'заданий'])}`;
}
function uHeader(title, action = 'catalog', subtitle = '') {
  return `<header class="cfg-hdr">${action ? `<button class="cfg-hdr-back" data-a="up:${esc(action)}" aria-label="Назад">←</button>` : ''}<span class="cfg-hdr-title">${esc(title)}</span>${subtitle ? `<span class="up-header-meta">${esc(subtitle)}</span>` : ''}</header>`;
}
function uChips(label, items, current, action) {
  return `<section class="cfg-card"><div class="cfg-lbl">${label}</div><div class="chips">${items.map(([id, title]) => `<button class="chip ${id === current ? 'on' : ''}" aria-pressed="${id === current}" data-a="up:${action}:${id}">${title}</button>`).join('')}</div></section>`;
}
function uModePills() {
  return uChips('Что тренируем', Object.entries(U_MODE_LABELS), UP.mode, 'mode');
}
function uSettings() {
  return (
    uModePills() +
    uChips(
      'Сложность',
      [
        ['basic', 'Базовый'],
        ['all', 'Тренировка'],
        ['challenge', 'Сложнее']
      ],
      UP.difficulty,
      'difficulty'
    ) +
    uChips(
      'Количество заданий',
      [
        ['10', '10'],
        ['20', '20'],
        ['40', '40'],
        ['all', 'Все']
      ],
      UP.count,
      'count'
    )
  );
}
// задания темы, которые попадают в тренировки (без прямых заданий на слова)
function uLessonIds(l) {
  return l.exerciseIds.filter(id => UEX[id] && !uDirect(UEX[id]));
}
function uProgress(l) {
  const ids = [...new Set(uLessonIds(l).flatMap(id => UEX[id].skillIds))];
  return Math.round((ids.filter(id => UP.skills[id]?.independentCorrect > 0).length / ids.length) * 100);
}
function uCounts() {
  const independent = new Set(
    UP.attempts.flatMap(a =>
      uUnits(UEX[a.exerciseId], a)
        .filter(unit => unit.independent)
        .map(unit => a.exerciseId + '.' + unit.id)
    )
  ).size;
  return { independent, total: UP.attempts.length };
}
function uStats(items) {
  return `<div class="nstats">${items.map(([value, label, tone]) => `<div class="nstat ${tone || ''}"><div class="n">${value}</div><div class="l">${label}</div></div>`).join('')}</div>`;
}
function uBar(percent, left, right) {
  return `<div class="nprog"><div class="nprog-bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(left)}"><i style="width:${percent}%"></i></div><div class="nprog-info"><span>${esc(left)}</span><span>${esc(right)}</span></div></div>`;
}
function uActiveSessions() {
  return Object.values(UP.sessions).filter(s => !uSessionDone(s));
}
function uSessionLabel(s) {
  return `${U_MODE_LABELS[s.mode] || 'Практика'} · ${U_LEVEL_LABELS[s.difficulty] || 'Тренировка'} · ${s.position + 1} / ${s.exerciseIds.length}`;
}
function uConditions(notes) {
  return notes?.length
    ? `<ul class="up-conditions" aria-label="Условия ответа">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>`
    : '';
}
function uRuleView(r, i) {
  const open = UP.openRule === r.id;
  return `<section class="cfg-card up-rule-card"><button class="up-rule" aria-expanded="${open}" ${open ? `aria-controls="${r.id}-detail"` : ''} data-a="up:rule:${r.id}"><span class="up-number">${String(i + 1).padStart(2, '0')}</span><span class="up-rule-heading"><span class="up-rule-title">${esc(r.titleRu)}</span><span class="up-rule-form">${esc(r.form)}</span></span><span class="up-arrow">${open ? '−' : '+'}</span></button>${open ? `<div class="up-rule-detail" id="${r.id}-detail"><section class="up-rule-meaning"><h3>Что выражает</h3><p>${esc(r.meaningRu)}</p></section><section class="up-rule-application"><h3>Как построить</h3><p>${esc(r.applicationRu)}</p></section><figure class="up-rule-example"><figcaption>Пример</figcaption><div class="up-example" lang="ja">${esc(r.example)}</div><p class="up-example-translation">${esc(r.translationRu)}</p>${uConditions(r.conditionsRu)}</figure><aside class="up-rule-nuance"><h3>Нюансы</h3><p>${esc(r.nuanceRu)}</p></aside></div>` : ''}</section>`;
}
function uPendingView(id) {
  const pending = UP.sessions[id];
  if (!pending || uSessionDone(pending)) return '';
  return `<section class="cfg-card up-help"><div class="cfg-lbl">Сохранённая тренировка</div><p>${esc(uSessionLabel(pending))}</p><div class="up-actions">${uBtn('Продолжить', 'resume:' + id)}${uBtn('Завершить', 'end:' + id)}</div><p class="up-muted">Продолжи с сохранённого места или заверши с итогом по отвеченным вопросам.</p></section>`;
}
function uLessonRuns(id) {
  return UP.history.filter(h => h.lessonId === id);
}
function buildPractice() {
  const error = uStorageError ? `<div class="cfg-card up-error" role="alert">${esc(uStorageError)}</div>` : '';
  const body =
    UP.view === 'menu'
      ? uMenuView()
      : UP.view === 'mix'
        ? uMixView()
        : UP.view === 'session' && UP.session
          ? uSessionView()
          : UP.view === 'lesson' && ULESSONS[UP.lessonId]
            ? uLessonView()
            : uCatalogView();
  return `<main class="up-page">${error}${body}<input class="up-file" id="up-import-file" type="file" accept="application/json,.json" aria-label="Импорт прогресса"></main>`;
}
function uMenuView() {
  return `${uHeader('Практика', null)}<div class="up-list up-inset"><button class="up-lesson" data-a="open-cfg:quiz-verbs"><span class="up-lesson-main"><span class="up-lesson-title">Формы глаголов</span><span class="up-lesson-meta">Сборка и тренировка форм</span></span><span class="up-arrow">›</span></button><button class="up-lesson" data-a="up:catalog"><span class="up-lesson-main"><span class="up-lesson-title">Уроки Genki</span><span class="up-lesson-meta">Грамматика, слова и чтение · уроки 1–23</span></span><span class="up-arrow">›</span></button></div>`;
}
/* Главная Genki (Figma «Главная Генки», «Главная Генки - Активные»): логотип, сегменты
 * Genki 1 / Genki 2 / Активные и карточки тем. Карточка открывает тему, кнопка — сразу тренировку. */
function uCatalogView() {
  const tab = UP.volume;
  const seg = `<div class="hseg ug-seg">${[
    ['1', 'Genki 1'],
    ['2', 'Genki 2'],
    ['active', 'Активные']
  ]
    .map(
      ([id, label]) =>
        `<button class="hseg-btn${tab === id ? ' on' : ''}" aria-pressed="${tab === id}" data-a="up:volume:${id}">${label}</button>`
    )
    .join('')}</div>`;
  return `<div class="ug-home"><div class="ug-head"><img class="hlogo" src="${ASSETS.logo}" alt="umi">${seg}</div><div class="ug-list">${tab === 'active' ? uActiveList() : uLessonList(tab)}</div></div>`;
}
function uCard(main, action, label) {
  return `<div class="ug-card">${main}<button class="ug-go" data-a="up:${esc(action)}">${label}</button></div>`;
}
function uLessonList(volume) {
  const tried = new Set(UP.attempts.map(a => a.exerciseId)),
    mistakes = Object.keys(UP.mistakes).filter(id => UEX[id]).length;
  const cards = UMI.lessons
    .filter(l => String(l.volume) === volume)
    .map(l => {
      const ids = uLessonIds(l),
        pending = UP.sessions[l.id] && !uSessionDone(UP.sessions[l.id]);
      return uCard(
        `<button class="ug-card-main" data-a="up:lesson:${l.id}"><span class="ug-num">${l.number}</span><span class="ug-txt"><span class="ug-t">${esc(l.titleRu)}</span><span class="ug-d">Пройдено: ${ids.filter(id => tried.has(id)).length}/${ids.length}</span><span class="ug-meta"><span>${l.rules.length} ${uPlural(l.rules.length, ['правило', 'правила', 'правил'])}</span><span>${uTaskCount(ids.length)}</span><span>${l.wordIds.length} ${uPlural(l.wordIds.length, ['слово', 'слова', 'слов'])}</span></span></span></button>`,
        'go:' + l.id,
        pending ? 'Продолжить' : 'Начать'
      );
    });
  const extra = [
    uCard(
      `<span class="ug-txt"><span class="ug-t">Несколько тем</span><span class="ug-d">Общая тренировка и смешанное чтение</span></span>`,
      'mix',
      'Выбрать'
    ),
    mistakes
      ? uCard(
          `<span class="ug-txt"><span class="ug-t">Ошибки</span><span class="ug-d">На повторение: ${mistakes}</span></span>`,
          'mistakes',
          'Повторить'
        )
      : ''
  ];
  return `${cards.join('')}${extra.join('')}<details class="cfg-card up-about"><summary>О практике и сохранении</summary><p class="up-sub">${UMI.words.length} слов, ${UMI.lessons.reduce((n, l) => n + l.rules.length, 0)} правил. Собственные примеры по темам Genki 3rd Edition; Представлены темы всех 23 уроков, но покрытие грамматики, лексики и чтения частичное; это не полный курс учебника. Локальный пилот, редакторская проверка ещё не выполнена.</p><div class="chips">${uBtn('Экспорт прогресса', 'export')}${uBtn('Импорт прогресса', 'import')}</div><p class="up-sub"><a href="${esc(UMI.sources[0].url)}" target="_blank" rel="noopener noreferrer">Программа тем Genki ↗</a></p></details>`;
}
function uActiveList() {
  const active = uActiveSessions().sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return `<div class="ug-bar">Активные тренировки</div>${
    active.length
      ? active
          .map(s =>
            uCard(
              `<span class="ug-txt ug-txt-wide"><span class="ug-t">${esc(uScopeTitle(s.lessonId, s.mode))}</span><span class="ug-d">Пройдено: ${s.position}/${s.exerciseIds.length}</span></span>`,
              'resume:' + s.lessonId,
              'Продолжить'
            )
          )
          .join('')
      : '<p class="mempty">Начатых тренировок нет. Выбери тему во вкладке Genki 1 или Genki 2.</p>'
  }`;
}
function uLessonView() {
  const l = ULESSONS[UP.lessonId],
    pending = UP.sessions[l.id],
    hasPending = pending && !uSessionDone(pending),
    runs = uLessonRuns(l.id),
    pool = uPool(l.id);
  const available = uTargetCount(pool.length),
    seen = new Set(UP.attempts.filter(a => UEX[a.exerciseId]?.lessonId === l.id).map(a => a.exerciseId)).size;
  const fresh = pool.filter(e => !UP.attempts.some(a => a.exerciseId === e.id)).length;
  return `${uHeader(l.titleRu)}<div class="up-context">≈ Genki ${l.volume === 1 ? 'I' : 'II'} · урок ${l.number}</div>
    ${uStats([
      [uLessonIds(l).length, 'В теме'],
      [seen, 'Попробовал', 'y'],
      [runs.length, 'Тренировки', 'g']
    ])}
    ${uBar(uProgress(l), uProgress(l) + '% навыков', 'Правила, чтение и слова')}
    ${uPendingView(l.id)}
    ${uSettings()}<div class="up-inset up-sub">${UP.difficulty === 'challenge' ? 'Кандзи во фразах, несколько пропусков, чтение текста и сборка с лишними блоками.' : UP.difficulty === 'basic' ? 'Пропуски в коротких фразах: слова и базовые формы.' : 'Слова во фразах, формы, сборка и чтение.'}<br>Новых заданий в выбранном режиме: ${fresh}.${hasPending ? ' Новая тренировка завершит сохранённую; отвеченные вопросы останутся в истории.' : ''}</div>
    <div class="start-row">${uBtn(`${hasPending ? 'Начать новую' : 'Начать'} · ${uTaskCount(available)}`, 'start:' + l.id, 'primary wide', !pool.length)}</div>
    <div class="up-section-label">Правила</div>
    ${l.rules.map(uRuleView).join('')}
    <div class="up-heading up-inset"><span>Слова темы</span>${uBtn(UP.display === 'kana' ? 'Кандзи' : 'Кана', 'display')}</div>
    <div class="cfg-card">${l.wordIds
      .map(id => {
        const w = UWORDS[id],
          linked = UP.wordLinks[id] && S.words.some(x => x.id === UP.wordLinks[id]);
        return `<div class="up-word"><div><div class="up-example" lang="ja">${uWord(w)}</div><span class="up-muted">${esc(w.meaningsRu.join('; '))}</span></div>${uBtn(linked ? 'Добавлено ✓' : '+ В словарь', 'word:' + id, '', linked)}</div>`;
      })
      .join('')}${uBtn('Добавить слова темы', 'words:' + l.id, 'wide')}</div>
    ${
      runs.length
        ? `<div class="up-section-label">Последние тренировки</div>${runs
            .slice(-3)
            .reverse()
            .map(
              h =>
                `<div class="cfg-card up-run"><span>${U_MODE_LABELS[h.mode] || 'Практика'} · ${uTaskCount(h.answeredExerciseIds?.length ?? h.exerciseIds.length)}</span><span class="up-muted">${h.independentCorrect} верно · ${U_LEVEL_LABELS[h.difficulty] || 'Тренировка'}${h.status === 'stopped' ? ' · завершена досрочно' : ''} · ${new Date(h.completedAt).toLocaleDateString('ru-RU')}</span></div>`
            )
            .join('')}`
        : ''
    }`;
}
function uMixView() {
  const key = uMixKey(),
    ids = UP.selectedLessons,
    pending = UP.sessions[key],
    pool = ids.length >= 2 ? uPool(key) : [],
    available = uTargetCount(pool.length);
  return `${uHeader('Комбинировать уроки')}<section class="cfg-card"><div class="cfg-lbl">Выбери минимум две темы · выбрано ${ids.length}</div><div class="up-mix-list">${UMI.lessons.map(l => `<button class="chip ${ids.includes(l.id) ? 'on' : ''}" aria-pressed="${ids.includes(l.id)}" data-a="up:select:${l.id}"><span>${l.number}. ${esc(l.titleRu)}</span><small>≈ Genki ${l.volume === 1 ? 'I' : 'II'} · урок ${l.number}</small></button>`).join('')}</div><div class="chips">${uBtn('Все темы', 'select-all')}${uBtn('Снять выбор', 'select-none')}</div></section>${uPendingView(key)}${uSettings()}<p class="up-sub up-inset">Вместе — задания выбранных тем и чтение двух отдельных ситуаций из разных уроков. Каждый отрывок подписан A или B; вопросы относятся к указанному тексту. Только материал выбранных тем.${pending && !uSessionDone(pending) ? ' Новая тренировка завершит сохранённую; ответы останутся в истории.' : ''}</p><div class="start-row">${uBtn(`${pending && !uSessionDone(pending) ? 'Начать новую' : 'Начать'} · ${uTaskCount(available)}`, 'start:' + key, 'primary wide', ids.length < 2 || !pool.length)}</div>`;
}
function uWord(w) {
  return UP.display === 'kana'
    ? esc(w.reading)
    : w.surface === w.reading
      ? esc(w.surface)
      : `<ruby>${esc(w.surface)}<rt>${esc(w.reading)}</rt></ruby>`;
}
function uFamily(e) {
  return e.familyId || e.id;
}
function uPool(lessonId) {
  const scope = uScope(lessonId),
    mixed = lessonId.startsWith('mix,');
  let pool = UMI.exercises.filter(
    e => !uDirect(e) && (e.mixedText ? mixed && e.lessonIds.every(id => scope.includes(id)) : scope.includes(e.lessonId))
  );
  if (UP.mode === 'mistakes') {
    const errors = Object.keys(UP.mistakes).filter(id => UEX[id] && scope.includes(UEX[id].lessonId));
    const skills = new Set(errors.flatMap(id => UP.mistakes[id].skillIds));
    pool = pool.filter(
      e => e.skillIds.some(id => skills.has(id)) && (!UP.mistakes[e.id] || UP.mistakes[e.id].nextReviewAt <= Date.now())
    );
  } else if (UP.mode !== 'mixed')
    pool = pool.filter(
      e =>
        e.focus === UP.mode ||
        (UP.mode === 'grammar' && e.focus === 'mixed' && (e.type === 'order' || (mixed && e.mixedText)))
    );
  if (UP.difficulty !== 'all') pool = pool.filter(e => e.difficulty === UP.difficulty);
  const seen = new Map(),
    families = new Map();
  for (const a of UP.attempts) {
    const time = a.answeredAt || 0;
    seen.set(a.exerciseId, Math.max(seen.get(a.exerciseId) || 0, time));
    const family = uFamily(UEX[a.exerciseId]);
    families.set(family, Math.max(families.get(family) || 0, time));
  }
  const previous = new Set(UP.history.filter(h => h.lessonId === lessonId).at(-1)?.exerciseIds || []);
  return uShuffle(pool).sort(
    (a, b) =>
      Number(seen.has(a.id)) - Number(seen.has(b.id)) ||
      Number(families.has(uFamily(a))) - Number(families.has(uFamily(b))) ||
      Number(previous.has(a.id)) - Number(previous.has(b.id)) ||
      Number(Boolean(UP.mistakes[a.id])) - Number(Boolean(UP.mistakes[b.id])) ||
      (seen.get(a.id) || 0) - (seen.get(b.id) || 0)
  );
}
function uTargetCount(size) {
  return UP.count === 'all' ? size : Math.min(Number(UP.count) || 20, size);
}
function uStart(lessonId, replace = false) {
  const saved = UP.sessions[lessonId];
  if (saved && !uSessionDone(saved) && !replace) {
    uResume(saved);
    uSave();
    return;
  }
  const pool = uPool(lessonId),
    target = uTargetCount(pool.length);
  if (!pool.length) {
    toast(
      UP.mode === 'mistakes'
        ? 'Для исходных ошибок выдерживаем интервал 10 минут. Попробуйте позже.'
        : 'Нет заданий с этими настройками'
    );
    return;
  }
  const selected = [],
    remaining = pool.slice(),
    families = new Set();
  // Rotate formats while prioritising unseen questions; related versions of an
  // example are spaced apart and used only after distinct families run out.
  if (lessonId.startsWith('mix,')) {
    const reading = remaining.findIndex(e => e.mixedText);
    if (reading >= 0) {
      const e = remaining.splice(reading, 1)[0];
      selected.push(e);
      families.add(uFamily(e));
    }
    for (const id of uShuffle(uScope(lessonId))) {
      if (selected.length >= target) break;
      const index = remaining.findIndex(e => !e.mixedText && e.lessonId === id);
      if (index >= 0) {
        const e = remaining.splice(index, 1)[0];
        selected.push(e);
        families.add(uFamily(e));
      }
    }
  }
  const categories =
    UP.mode === 'mixed'
      ? ['vocabulary', 'gap', 'order', 'vocabulary', 'choice', 'reading']
      : ['gap', 'choice', 'order', 'reading'];
  let turn = 0;
  while (selected.length < target && remaining.length) {
    const last = selected.at(-1),
      category = categories[turn++ % categories.length];
    const match = e =>
      category === 'vocabulary'
        ? e.focus === 'vocabulary'
        : category === 'reading'
          ? e.labelRu === 'Чтение текста'
          : e.type === category && e.labelRu !== 'Чтение текста';
    const unseen = e => !UP.attempts.some(a => a.exerciseId === e.id);
    const distinct = e => !families.has(uFamily(e));
    // Avoid an immediately repeated skill/word to keep feedback from answering
    // the next card. At exhaustion, explicit practice still allows repetition.
    const apart = e => !last || !e.skillIds.some(id => last.skillIds.includes(id));
    const choices = [
      e => unseen(e) && distinct(e) && match(e) && apart(e),
      e => unseen(e) && distinct(e) && apart(e),
      e => unseen(e) && apart(e),
      e => distinct(e) && match(e) && apart(e),
      e => distinct(e) && apart(e),
      e => apart(e),
      () => true
    ];
    let index = -1;
    for (const predicate of choices) {
      index = remaining.findIndex(predicate);
      if (index >= 0) break;
    }
    const e = remaining.splice(index, 1)[0];
    selected.push(e);
    families.add(uFamily(e));
  }
  if (saved && !uSessionDone(saved)) {
    UP.session = saved;
    uEnd();
  }
  UP.session = {
    id: 'session.' + uid(),
    lessonId,
    mode: UP.mode,
    difficulty: UP.difficulty,
    requestedCount: UP.count,
    createdAt: Date.now(),
    exerciseIds: selected.map(e => e.id),
    position: 0,
    answers: {},
    optionOrders: Object.fromEntries(selected.map(e => [e.id, uShuffle(e.options.map(o => o.id))]))
  };
  UP.sessions[lessonId] = UP.session;
  UP.view = 'session';
  uSave();
}
function uAnswer(e) {
  const s = UP.session;
  return (
    s.answers[e.id] ||
    (s.answers[e.id] = {
      selection: e.type === 'order' ? [] : e.type === 'input' ? { text: '' } : {},
      hintUsed: false,
      revealedAnswer: false,
      first: null,
      checks: 0,
      checked: false,
      correct: false,
      startedAt: Date.now()
    })
  );
}
function uCurrent() {
  return UP.session && !uSessionDone(UP.session) ? UEX[UP.session.exerciseIds[UP.session.position]] : null;
}
function uNormalize(s) {
  return String(s || '')
    .normalize('NFKC')
    .trim()
    .replace(/[\s。．.!！?？]+/g, '')
    .replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));
}
function uReady(e, a) {
  return e.type === 'input'
    ? Boolean(uNormalize(a.selection.text))
    : e.type === 'order'
      ? a.selection.length === (e.requiredCount || e.acceptedSequences[0].length)
      : e.type === 'gap'
        ? e.slots.every(slot => a.selection[slot.id])
        : Boolean(a.selection.choice);
}
function uCorrect(e, a) {
  return e.type === 'input'
    ? e.acceptedTexts.some(t => uNormalize(t) === uNormalize(a.selection.text))
    : e.type === 'order'
      ? e.acceptedSequences.some(seq => seqEq(seq, a.selection))
      : e.type === 'gap'
        ? e.slots.every(slot => slot.acceptedOptionIds.includes(a.selection[slot.id]))
        : e.acceptedChoiceIds.includes(a.selection.choice);
}
function uSolution(e) {
  return e.type === 'input'
    ? e.acceptedTexts[0]
    : e.type === 'order'
      ? e.acceptedSequences[0].map(id => e.options.find(o => o.id === id).text).join(' ')
      : e.type === 'gap'
        ? e.prompt
            .map(t => t.text)
            .join('')
            .replace(/\{\{([^}]+)\}\}/g, (_, slot) => {
              const id = e.slots.find(s => s.id === slot).acceptedOptionIds[0];
              return e.options.find(o => o.id === id).text;
            })
        : e.options.find(o => e.acceptedChoiceIds.includes(o.id)).text;
}
/* Задание (Figma «Перевод фразы - апдейт», «подставить недостающее - апдейт»): сверху прогресс
 * полосками, канвас — название блока, задание, фраза для перевода синим, поле ответа и пилюли
 * «Подсказка / Ответ»; ниже — плитки на выбор и ряд «Стоп / Пропустить / Дальше». */
function uStories(s) {
  const n = s.exerciseIds.length,
    k = Math.min(n, 40);
  // при длинной тренировке одна полоска — несколько заданий
  return `<div class="ug-prog" role="progressbar" aria-valuenow="${s.position}" aria-valuemin="0" aria-valuemax="${n}" aria-label="Задание ${s.position + 1} из ${n}">${Array.from({ length: k }, (_, i) => `<i${Math.floor((i * n) / k) <= s.position ? ' class="on"' : ''}></i>`).join('')}</div>`;
}
// подсказка к слову не выдаёт ответ: первая кана, у кандзи — чтение
function uHintText(e) {
  if (e.focus !== 'vocabulary') return e.explanationRu;
  const w = UWORDS[e.targetWordIds[0]];
  if (!w) return e.explanationRu;
  return e.labelRu === 'Кандзи в контексте' ? 'Читается: ' + w.reading : 'Начинается на «' + [...w.reading][0] + '»';
}
function uSessionView() {
  const s = UP.session;
  if (uSessionDone(s)) return uResultView();
  const e = uCurrent(),
    a = uAnswer(e),
    n = s.exerciseIds.length,
    complete = a.checked,
    reading = e.labelRu === 'Чтение текста';
  const opts = s.optionOrders[e.id].map(id => e.options.find(o => o.id === id));
  const text = id => e.options.find(o => o.id === id)?.text || '';
  const selected = id =>
    e.type === 'order' ? a.selection.includes(id) : e.type === 'input' ? false : Object.values(a.selection).includes(id);
  const mark = ok => (a.checked ? (ok ? ' ok' : ' bad') : '');
  let box;
  if (e.type === 'order')
    box = `<div class="ug-box" aria-label="Собранная фраза">${
      a.selection.length
        ? a.selection
            .map((id, i) => {
              // знаки препинания — текстом за блоком, как в макете
              const [, lead, body, punct] = /^([、。？！?!]*)(.*?)([、。？！?!]*)$/.exec(text(id));
              const punc = t => (body && t ? `<span class="ug-punc">${esc(t)}</span>` : '');
              return `${punc(lead)}<button class="ug-blk${mark(a.correct)}" data-a="up:undo:${i}" ${complete ? 'disabled' : ''}>${esc(body || lead + punct)}</button>${punc(punct)}`;
            })
            .join('')
        : '<span class="ug-ph">Нажимай на блоки ниже. Нажатие на блок в поле убирает его.</span>'
    }</div>`;
  else if (e.type === 'input')
    box = `<div class="ug-box"><input id="up-text-answer" class="ug-inp${mark(a.correct)}" lang="ja" type="text" value="${esc(a.selection.text)}" placeholder="Введи ответ каной" autocomplete="off" autocorrect="off" spellcheck="false" ${complete ? 'disabled' : ''}></div>`;
  else {
    let flow = e.prompt.map(t => esc(t.text)).join('');
    if (e.type === 'gap')
      flow = flow.replace(/\{\{([^}]+)\}\}/g, (_, id) => {
        const locked = a.lockedSlots?.includes(id),
          state = locked ? ' ok' : a.checked && a.selection[id] ? ' bad' : '',
          active = !complete && !locked && (a.activeSlot || e.slots[0].id) === id && e.slots.length > 1 ? ' active' : '';
        return `<button class="ug-slot${state}${active}" aria-label="Пропуск ${id === 'right' ? '2' : '1'}" data-a="up:slot:${id}" ${complete || locked ? 'disabled' : ''}>${esc(text(a.selection[id]))}</button>`;
      });
    else
      flow = flow.replace(
        /［\s*…\s*］/g,
        () =>
          `<span class="ug-slot${a.selection.choice ? mark(a.correct) : ''}">${esc(text(a.selection.choice))}</span>`
      );
    box = `<div class="ug-box flow" lang="${e.promptLanguage || 'ja'}">${flow}</div>`;
  }
  const verdict = a.revealedAnswer ? 'Ответ открыт' : a.correct ? (a.hintUsed ? 'Верно · с подсказкой' : 'Верно') : 'Неверно';
  // разбор — только у грамматики и чтения; у заданий на слова достаточно верного ответа
  const result = complete
    ? `<div class="ug-res${a.correct && !a.revealedAnswer ? ' ok' : ' bad'}" aria-live="polite">${verdict}</div>${!a.correct ? `<div class="ug-sol" lang="ja">${esc(uSolution(e))}</div>` : ''}${e.focus !== 'vocabulary' && e.explanationRu ? `<details class="ug-why"><summary class="cv-hint">Разбор</summary><p>${esc(e.explanationRu)}</p></details>` : ''}`
    : `${a.hintUsed && !e.display.hideReadings ? `<div class="ug-hint">${esc(uHintText(e))}</div>` : ''}<div class="cv-pills">${!e.display.hideReadings ? `<button class="cv-hint${a.hintUsed ? ' on' : ''}" data-a="up:hint" ${a.hintUsed ? 'disabled' : ''}>Подсказка</button>` : ''}<button class="cv-hint" data-a="up:reveal">Ответ</button></div>`;
  const task = (reading ? 'Ответь на вопрос по тексту' : String(e.instructionRu || '').replace(/[.。]\s*$/, '')) + ':';
  const sentence = reading ? e.instructionRu : e.translationRu;
  const canvas = `<section class="ug-cv"><div class="ug-chip">${esc(e.labelRu || 'Практика')}</div><div class="ug-q"><div class="ug-task">${esc(task)}</div>${sentence ? `<div class="ug-sent">${esc(sentence)}</div>` : ''}${e.conditionsRu?.length ? `<div class="ug-cond">${e.conditionsRu.map(esc).join(' · ')}</div>` : ''}</div>${box}${result}</section>`;
  const tile = o => {
    const on = selected(o.id);
    const state = !on
      ? ''
      : !a.checked
        ? ' sel'
        : e.type === 'gap'
          ? e.slots.some(slot => a.selection[slot.id] === o.id && slot.acceptedOptionIds.includes(o.id))
            ? ' ok'
            : ' bad'
          : a.correct
            ? ' ok'
            : ' bad';
    return `<button class="ug-opt${state}" lang="ja" data-a="up:pick:${o.id}" aria-pressed="${on}" ${complete ? 'disabled' : ''}>${esc(o.text)}</button>`;
  };
  const panel =
    e.type === 'input'
      ? ''
      : `<section class="quiz-panel"><div class="quiz-panel-lbl">${e.type === 'order' ? 'Соберите из предложенного:' : 'Выберите нужное:'}</div><div class="ug-opts">${opts.map(tile).join('')}</div></section>`;
  const main = complete
    ? uAct(s.position === n - 1 ? 'К итогу' : 'Дальше', 'next', true)
    : uReady(e, a)
      ? uAct('Проверить', 'check', true)
      : uAct('Дальше', 'check', true, true);
  return `<div class="pg up-pg ug-pg">${uStories(s)}${canvas}${panel}${uActions(main, complete)}</div>`;
}
function uAct(label, action, primary = false, disabled = false) {
  return `<button class="qact-btn${primary ? ' primary' : ''}" data-a="up:${esc(action)}"${disabled ? ' aria-disabled="true" disabled' : ''}>${label}</button>`;
}
// как в остальных тренировках: «Стоп» — на главную Genki (тренировка остаётся в «Активных»)
function uActions(main, complete) {
  return `<div class="quiz-actions">${uAct('Стоп', 'catalog')}${uAct('Пропустить', 'skip', false, complete)}${main}</div>`;
}
function uRestoreSettings(s) {
  UP.mode = s.mode;
  UP.difficulty = s.difficulty || 'all';
  UP.count = s.requestedCount || '20';
}
function uResume(s) {
  UP.session = s;
  uRestoreSettings(s);
  UP.view = 'session';
}
function uEnd() {
  const s = UP.session;
  if (!s || uSessionDone(s)) return;
  s.endedAt = Date.now();
  uFinish();
  UP.view = 'session';
}
function uAnsweredIds(s) {
  return s.exerciseIds.filter(id => s.answers[id]?.first);
}
function uFinish() {
  const s = UP.session;
  if (!uSessionDone(s) || UP.history.some(h => h.id === s.id)) return;
  const ids = uAnsweredIds(s);
  UP.history.push({
    id: s.id,
    lessonId: s.lessonId,
    mode: s.mode,
    difficulty: s.difficulty || 'all',
    exerciseIds: s.exerciseIds.slice(),
    answeredExerciseIds: ids,
    status: s.position >= s.exerciseIds.length ? 'completed' : 'stopped',
    completedAt: s.endedAt || Date.now(),
    independentCorrect: ids.reduce((n, id) => n + uCleanUnits(s.answers[id]?.first), 0),
    answerCount: ids.reduce((n, id) => n + (UEX[id].type === 'gap' ? UEX[id].slots.length : 1), 0)
  });
}
function uRecord(e, a, correct) {
  const s = UP.session,
    id = s.id + '.' + e.id;
  if (UP.attempts.some(x => x.id === id)) return;
  const attempt = {
    id,
    sessionId: s.id,
    exerciseId: e.id,
    exerciseVersion: e.version,
    selection: JSON.parse(JSON.stringify(a.selection)),
    firstAnswerCorrect: correct,
    hintUsed: a.hintUsed,
    revealedAnswer: a.revealedAnswer,
    answeredAt: Date.now(),
    durationMs: Date.now() - a.startedAt,
    attemptNumber: 1,
    checks: 1,
    corrected: false
  };
  UP.attempts.push(attempt);
  a.first = attempt;
  attempt.slotResults = uUnits(e, attempt);
  for (const unit of attempt.slotResults)
    for (const id of unit.skillIds) {
      const skill =
        UP.skills[id] ||
        (UP.skills[id] = {
          kind: e.focus === 'vocabulary' ? 'vocabulary' : 'grammar',
          independentCorrect: 0,
          errors: 0,
          hinted: 0
        });
      skill[unit.independent ? 'independentCorrect' : unit.correct ? 'hinted' : 'errors']++;
      skill.lastPracticedAt = Date.now();
      skill.nextReviewAt = Date.now() + (unit.independent ? 86400000 : 600000);
    }
  const passed = [...new Set(attempt.slotResults.filter(x => x.independent).flatMap(x => x.skillIds))],
    failed = [...new Set(attempt.slotResults.filter(x => !x.independent).flatMap(x => x.skillIds))];
  for (const [id, m] of Object.entries(UP.mistakes)) {
    m.skillIds = m.skillIds.filter(skill => !passed.includes(skill));
    if (!m.skillIds.length) delete UP.mistakes[id];
  }
  if (failed.length)
    UP.mistakes[e.id] = { skillIds: failed, lastAttemptAt: Date.now(), nextReviewAt: Date.now() + 600000 };
}
function uCheck() {
  const e = uCurrent();
  if (!e) return;
  const a = uAnswer(e);
  if (a.checked || !uReady(e, a)) return;
  a.correct = uCorrect(e, a);
  a.checked = true;
  if (e.type === 'gap') {
    a.lockedSlots = e.slots.filter(slot => slot.acceptedOptionIds.includes(a.selection[slot.id])).map(slot => slot.id);
    a.activeSlot = e.slots.find(slot => !a.lockedSlots.includes(slot.id))?.id || e.slots[0].id;
  }
  a.checks++;
  if (!a.first) uRecord(e, a, a.correct);
  else {
    const record = UP.attempts.find(x => x.id === a.first.id);
    if (record) {
      record.checks = a.checks;
      record.corrected = a.correct;
    }
  }
  haptic(a.correct ? 'light' : 'medium');
  uSave();
}
function uResultView() {
  const s = UP.session,
    ids = uAnsweredIds(s),
    answers = ids.map(id => s.answers[id]);
  const clean = answers.reduce((n, a) => n + uCleanUnits(a?.first), 0),
    total = ids.reduce((n, id) => n + (UEX[id].type === 'gap' ? UEX[id].slots.length : 1), 0);
  const hint = answers.reduce(
    (n, a) =>
      n +
      (a?.correct && a.hintUsed && !a.revealedAnswer
        ? uUnits(UEX[a.first.exerciseId], a.first).filter(unit => !unit.independent).length
        : 0),
    0
  );
  const reveal = answers.reduce(
    (n, a) =>
      n + (a?.revealedAnswer ? uUnits(UEX[a.first.exerciseId], a.first).filter(unit => !unit.independent).length : 0),
    0
  );
  const wordIds = [...new Set(ids.flatMap(id => UEX[id].targetWordIds))];
  return `${uHeader('Тренировка завершена', uScopeBack(s.lessonId))}${uStats([
    [clean, 'С первого раза', 'g'],
    [hint, 'С подсказкой', 'y'],
    [total - clean - hint, 'Повторить', 'r']
  ])}
    ${uBar(total ? Math.round((clean / total) * 100) : 0, clean + ' из ' + total + ' ответов', 'Без подсказки')}
    <div class="cfg-card up-help">${ids.length} из ${s.exerciseIds.length} заданий выполнено · ${total} ответов.${s.endedAt ? ' Тренировка закрыта; неотвеченные вопросы не считаются ошибками.' : ''}<br>Ошибок: ${total - clean - hint - reveal}<br>Ответ открыт: ${reveal}<br>Ответы сохранены. Для следующего прохода выбери режим и сложность.</div>
    <div class="start-row">${uBtn('Тренироваться ещё', 'setup', 'primary wide')}</div><div class="up-actions up-inset">${uBtn('К теме', uScopeBack(s.lessonId))}${uBtn('Все темы', 'catalog')}</div>
    ${
      ids.length
        ? `<details class="cfg-card up-about"><summary>Разбор · ${ids.length} заданий</summary>${ids
            .map(id => {
              const e = UEX[id],
                a = s.answers[id];
              return `<div class="up-review-row"><span>${esc(e.labelRu || 'Грамматика')}</span><span class="up-muted">${a.revealedAnswer ? 'Ответ открыт' : a.hintUsed ? 'С подсказкой' : e.slots.length > 1 ? uCleanUnits(a.first) + ' / ' + e.slots.length + ' с первой попытки' : a.first.firstAnswerCorrect ? 'С первой попытки' : 'Неверно'}</span><div class="up-example" lang="ja">${esc(uSolution(e))}</div></div>`;
            })
            .join('')}</details>`
        : ''
    }
    ${wordIds.length ? `<div class="up-section-label">Слова тренировки</div><div class="cfg-card">${wordIds.map(id => `<div class="up-word"><div><div class="up-example" lang="ja">${uWord(UWORDS[id])}</div><span class="up-muted">${esc(UWORDS[id].meaningsRu.join('; '))}</span></div>${uBtn('+ В словарь', 'word:' + id)}</div>`).join('')}</div>` : ''}`;
}
function uAddWord(id) {
  const w = UWORDS[id];
  if (!w) return false;
  let existing = S.words.find(
    x =>
      x.id === id ||
      x.practiceWordId === id ||
      (normKey(x.kanji) === normKey(w.surface) && normKey(x.reading) === normKey(w.reading)) ||
      (normKey(x.kanji) === normKey(w.reading) && normKey(x.reading || x.kanji) === normKey(w.reading))
  );
  if (!existing) {
    existing = {
      id,
      practiceWordId: id,
      kanji: w.surface,
      reading: w.reading,
      meaning: w.meaningsRu.join('; '),
      folder: 'umi · Практика'
    };
    S.words.push(existing);
  }
  UP.wordLinks[id] = existing.id;
  return true;
}
function uExport() {
  saveFile(
    'umi-progress-' + new Date().toISOString().slice(0, 10) + '.json',
    JSON.stringify(UP, null, 2),
    'application/json'
  );
}
// «Назад» для Telegram BackButton: то же, что стрелка в заголовке экрана
function uBackAction() {
  if (UP.view === 'session' && UP.session) return uSessionDone(UP.session) ? uScopeBack(UP.session.lessonId) : 'catalog';
  return { catalog: 'menu', lesson: 'catalog', mix: 'catalog' }[UP.view] || null;
}
function uReveal(e, a) {
  a.revealedAnswer = true;
  a.checked = true;
  a.correct = false;
  if (!a.first) uRecord(e, a, false);
  else {
    const record = UP.attempts.find(x => x.id === a.first.id);
    if (record) record.revealedAnswer = true;
  }
}
function uAction(value) {
  const [type, ...rest] = value.split(':');
  const v = rest.join(':');
  const e = uCurrent(),
    a = e ? uAnswer(e) : null,
    complete = a?.checked;
  switch (type) {
    case 'menu':
      UP.view = 'menu';
      break;
    case 'catalog':
      UP.view = 'catalog';
      break;
    case 'mix':
      UP.view = 'mix';
      break;
    case 'select':
      if (ULESSONS[v])
        UP.selectedLessons = UP.selectedLessons.includes(v)
          ? UP.selectedLessons.filter(id => id !== v)
          : [...UP.selectedLessons, v];
      break;
    case 'select-all':
      UP.selectedLessons = UMI.lessons.map(l => l.id);
      break;
    case 'select-none':
      UP.selectedLessons = [];
      break;
    case 'lesson':
      if (ULESSONS[v]) {
        UP.lessonId = v;
        UP.view = 'lesson';
        UP.openRule = null;
      }
      break;
    case 'mode':
      if (['mixed', 'grammar', 'vocabulary', 'mistakes'].includes(v)) UP.mode = v;
      break;
    case 'count':
      if (['10', '20', '40', 'all'].includes(v)) UP.count = v;
      break;
    case 'difficulty':
      if (['all', 'basic', 'challenge'].includes(v)) UP.difficulty = v;
      break;
    case 'volume':
      if (['1', '2', 'active'].includes(v)) UP.volume = v;
      break;
    case 'display':
      UP.display = UP.display === 'kana' ? 'kanji' : 'kana';
      break;
    case 'rule':
      UP.openRule = UP.openRule === v ? null : v;
      break;
    case 'start':
      if (uScopeValid(v) && (!v.startsWith('mix,') || uScope(v).length >= 2)) uStart(v, true);
      break;
    case 'resume':
      {
        const saved = v ? UP.sessions[v] : UP.session;
        if (saved && !uSessionDone(saved)) uResume(saved);
      }
      break;
    case 'end':
      if (v && UP.sessions[v]) UP.session = UP.sessions[v];
      uEnd();
      break;
    case 'setup':
      if (UP.session) {
        uRestoreSettings(UP.session);
        const id = UP.session.lessonId;
        if (id.startsWith('mix,')) {
          UP.selectedLessons = uScope(id);
          UP.view = 'mix';
        } else if (ULESSONS[id]) {
          UP.lessonId = id;
          UP.view = 'lesson';
        } else UP.view = 'catalog';
      }
      break;
    case 'slot':
      if (e?.type === 'gap' && !complete && e.slots.some(s => s.id === v) && !a.lockedSlots?.includes(v)) {
        if (a.selection[v]) delete a.selection[v];
        a.activeSlot = v;
      }
      break;
    case 'pick':
      if (e && !complete && e.options.some(o => o.id === v)) {
        if (e.type === 'order') {
          if (a.selection.includes(v)) a.selection.splice(a.selection.indexOf(v), 1);
          else if (a.selection.length < (e.requiredCount || e.acceptedSequences[0].length)) a.selection.push(v);
        } else if (e.type === 'gap') {
          const slot = a.activeSlot || e.slots[0].id;
          if (
            a.lockedSlots?.includes(slot) ||
            e.slots.some(s => a.lockedSlots?.includes(s.id) && a.selection[s.id] === v)
          )
            break;
          if (!e.allowOptionReuse)
            for (const key of Object.keys(a.selection))
              if (key !== slot && a.selection[key] === v) delete a.selection[key];
          if (a.selection[slot] === v) delete a.selection[slot];
          else a.selection[slot] = v;
          const next = e.slots.find(s => !a.selection[s.id]);
          if (next) a.activeSlot = next.id;
        } else if (e.type === 'choice') {
          if (a.selection.choice === v) delete a.selection.choice;
          else a.selection.choice = v;
        }
        a.checked = false;
        a.correct = false;
      }
      break;
    case 'undo':
      if (e?.type === 'order' && !complete) {
        a.selection.splice(+v, 1);
        a.checked = false;
        a.correct = false;
      }
      break;
    case 'hint':
      if (a && !complete && !e.display.hideReadings) {
        a.hintUsed = true;
        const record = UP.attempts.find(x => x.id === a.first?.id);
        if (record) record.hintUsed = true;
      }
      break;
    case 'reveal':
      if (a && !complete) uReveal(e, a);
      break;
    // «Пропустить» = открыть ответ и сразу дальше: задание уходит в ошибки на повторение
    case 'skip':
      if (a && !complete) {
        uReveal(e, a);
        UP.session.position++;
        uFinish();
      }
      break;
    case 'go':
      if (ULESSONS[v]) {
        if (UP.mode === 'mistakes') UP.mode = 'mixed';
        uStart(v);
      }
      break;
    case 'mistakes':
      {
        const mode = UP.mode;
        UP.mode = 'mistakes';
        uStart('all');
        UP.mode = mode;
      }
      break;
    case 'check':
      uCheck();
      break;
    case 'next':
      if (complete) {
        UP.session.position++;
        uFinish();
      }
      break;
    case 'word':
      if (uAddWord(v)) {
        save();
        toast('Слово в словаре');
      }
      break;
    case 'words':
      if (ULESSONS[v]) {
        ULESSONS[v].wordIds.forEach(uAddWord);
        save();
        toast('Слова добавлены в словарь');
      }
      break;
    case 'export':
      uExport();
      return;
    case 'import':
      document.getElementById('up-import-file')?.click();
      return;
  }
  uSave();
  render();
}
function uBind() {
  const text = document.getElementById('up-text-answer');
  if (text) {
    text.oninput = () => {
      const e = uCurrent(),
        a = e ? uAnswer(e) : null;
      if (!a || a.checked) return;
      a.selection.text = text.value;
      a.checked = false;
      a.correct = false;
      uSave();
      const check = document.querySelector('[data-a="up:check"]');
      if (check) check.disabled = !uReady(e, a);
    };
    text.onkeydown = event => {
      if (event.key === 'Enter' && !event.isComposing) {
        event.preventDefault();
        uAction('check');
      }
    };
  }
  const input = document.getElementById('up-import-file');
  if (input)
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        if (file.size > 10000000) throw Error('Файл слишком большой.');
        const incoming = uValidateProgress(JSON.parse(await file.text()));
        uPendingImport = incoming;
        toast('Файл проверен: ' + incoming.attempts.length + ' результатов.');
        uShowImport();
      } catch (err) {
        toast('Импорт не выполнен: ' + err.message);
      }
    };
}
function uShowImport() {
  const pending = uPendingImport;
  if (!pending) return;
  // Concrete, reversible confirmation because import replaces local practice history.
  const panel = document.createElement('div');
  panel.className = 'cfg-card up-help';
  panel.id = 'up-import-confirm';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'Импорт прогресса');
  panel.innerHTML = `<h3>Импортировать ${pending.attempts.length} результатов?</h3><p>Текущая история практики будет заменена. Сначала можно сохранить её в файл.</p><div class="up-actions"><button class="chip" id="up-before-export">Экспорт текущей</button><button class="chip on" id="up-confirm-import">Импортировать</button><button class="chip" id="up-cancel-import">Отмена</button></div>`;
  document.querySelector('.up-page').prepend(panel);
  document.getElementById('up-before-export').onclick = () => {
    uExport();
  };
  document.getElementById('up-confirm-import').onclick = () => {
    UP = pending;
    uPendingImport = null;
    uSave();
    render();
    toast('Прогресс импортирован');
  };
  document.getElementById('up-cancel-import').onclick = () => {
    uPendingImport = null;
    panel.remove();
  };
}
