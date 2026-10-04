/* Local original practice; no model calls. The full static bank is loaded at boot. */
'use strict';
const UMI = window.UMI_BANK;
const UEX = Object.assign(Object.create(null),Object.fromEntries(UMI.exercises.map(e=>[e.id,e])));
const UWORDS = Object.assign(Object.create(null),Object.fromEntries(UMI.words.map(w=>[w.id,w])));
const ULESSONS = Object.assign(Object.create(null),Object.fromEntries(UMI.lessons.map(l=>[l.id,l])));
const UKEY='umi.practice.v1';
const uDefault=()=>({version:1,selectedLessons:[],count:'20',difficulty:'all',sessions:{},history:[],mode:'mixed',volume:'all',display:'kana',lessonId:null,view:'catalog',openRule:null,session:null,attempts:[],skills:{},mistakes:{},wordLinks:{}});
let UP=uDefault();
let uStorageError='';
let uPendingImport=null;
function uScope(id){return id==='all'?UMI.lessons.map(l=>l.id):id.startsWith('mix,')?id.slice(4).split(','):[id];}
function uScopeValid(id){if(typeof id!=='string')return false;const ids=uScope(id);return ids.length>0&&new Set(ids).size===ids.length&&ids.every(x=>ULESSONS[x]);}
function uScopeTitle(id){return id.startsWith('mix,')?'Смешанная тренировка':ULESSONS[id]?.titleRu||'Все темы';}
function uScopeBack(id){return id.startsWith('mix,')?'mix':ULESSONS[id]?'lesson:'+id:'catalog';}
function uMixKey(){return 'mix,'+UMI.lessons.filter(l=>UP.selectedLessons.includes(l.id)).map(l=>l.id).join(',');}
function uUnits(e,attempt){
  if(attempt.slotResults)return attempt.slotResults;
  const slots=e.type==='gap'?e.slots:[{id:'answer',skillIds:e.skillIds}];
  return slots.map(slot=>{const correct=e.type==='gap'?!attempt.revealedAnswer&&slot.acceptedOptionIds.includes(attempt.selection?.[slot.id]):attempt.firstAnswerCorrect;return {id:slot.id,skillIds:slot.skillIds||e.skillIds,correct,independent:correct&&!attempt.hintUsed&&!attempt.revealedAnswer};});
}
function uCleanUnits(a){return a?uUnits(UEX[a.exerciseId],a).filter(x=>x.independent).length:0;}
function uValidSession(s){
  return s && typeof s.id==='string' && Array.isArray(s.exerciseIds) && s.exerciseIds.length>0 && s.exerciseIds.length<=UMI.exercises.length && s.exerciseIds.every(id=>UEX[id]) && new Set(s.exerciseIds).size===s.exerciseIds.length && Number.isInteger(s.position) && s.position>=0 && s.position<=s.exerciseIds.length && s.answers && typeof s.answers==='object' && s.optionOrders && s.exerciseIds.every(id=>Array.isArray(s.optionOrders[id])&&s.optionOrders[id].length===UEX[id].options.length&&new Set(s.optionOrders[id]).size===UEX[id].options.length&&s.optionOrders[id].every(oid=>UEX[id].options.some(o=>o.id===oid)));
}
function uValidateProgress(d){
  const record=x=>x&&typeof x==='object'&&!Array.isArray(x);
  if(!record(d)||d.version!==1||!Array.isArray(d.attempts)||!record(d.skills)||!record(d.mistakes)||!record(d.wordLinks))throw Error('Это не файл прогресса umi версии 1.');
  const attemptIds=new Set(),skillIds=new Set(UMI.exercises.flatMap(e=>e.skillIds));
  for(const a of d.attempts){
    if(!record(a)||typeof a.id!=='string'||attemptIds.has(a.id)||!UEX[a.exerciseId]||typeof a.firstAnswerCorrect!=='boolean'||typeof a.hintUsed!=='boolean'||typeof a.revealedAnswer!=='boolean')throw Error('В файле есть некорректные результаты.');
    if(a.slotResults){const e=UEX[a.exerciseId],slots=e.type==='gap'?e.slots:[{id:'answer',skillIds:e.skillIds}];if(!Array.isArray(a.slotResults)||a.slotResults.length!==slots.length||!a.slotResults.every((unit,i)=>record(unit)&&unit.id===slots[i].id&&typeof unit.correct==='boolean'&&typeof unit.independent==='boolean'&&(!unit.independent||unit.correct)&&Array.isArray(unit.skillIds)&&seqEq(unit.skillIds,slots[i].skillIds||e.skillIds)))throw Error('Повреждена оценка отдельных ответов.');}
    attemptIds.add(a.id);
  }
  for(const [id,s] of Object.entries(d.skills))if(!skillIds.has(id)||!record(s)||!['independentCorrect','errors','hinted'].every(k=>Number.isInteger(s[k])&&s[k]>=0))throw Error('Повреждена статистика навыков.');
  for(const [id,m] of Object.entries(d.mistakes))if(!UEX[id]||!record(m)||!Array.isArray(m.skillIds)||!m.skillIds.every(s=>UEX[id].skillIds.includes(s))||!Number.isFinite(m.nextReviewAt))throw Error('Повреждена очередь повторений.');
  for(const [id,link] of Object.entries(d.wordLinks))if(!UWORDS[id]||typeof link!=='string')throw Error('Повреждены связи со словарём.');
  function validateSession(session){
    // Upgrade retained input IDs before checking the current option contract.
    for(const id of session.exerciseIds||[]){const e=UEX[id],a=session.answers?.[id];if(!e?.legacyInput)continue;
      if(Array.isArray(session.optionOrders?.[id])&&!session.optionOrders[id].length)session.optionOrders[id]=e.options.map(o=>o.id);
      if(a&&Object.hasOwn(a.selection||{},'text')){if(typeof a.selection.text!=='string')throw Error('Повреждён введённый ответ.');const o=e.options.find(o=>uNormalize(o.text)===uNormalize(a.selection.text));a.selection=o?{choice:o.id}:{};}
    }
    if(!uValidSession(session)||!uScopeValid(session.lessonId))throw Error('Файл содержит несовместимый учебный блок.');
    for(const [id,a] of Object.entries(session.answers)){
      const e=UEX[id];
      if(!session.exerciseIds.includes(id)||!record(a)||typeof a.checked!=='boolean'||typeof a.correct!=='boolean'||typeof a.hintUsed!=='boolean'||typeof a.revealedAnswer!=='boolean')throw Error('Повреждён ответ в учебном блоке.');
      if(e.type==='input'){if(!record(a.selection)||typeof a.selection.text!=='string')throw Error('Повреждён введённый ответ.');}
      const selections=e.type==='input'?[]:e.type==='order'?a.selection:record(a.selection)?Object.values(a.selection):null;
      if(!Array.isArray(selections)||!selections.every(oid=>e.options.some(o=>o.id===oid))||((e.type==='order'||!e.allowOptionReuse)&&new Set(selections).size!==selections.length))throw Error('Некорректные варианты ответа.');
      if(e.type==='order'&&selections.length>(e.requiredCount||e.acceptedSequences[0].length))throw Error('Некорректная сборка.');
      if(a.first&&(!attemptIds.has(a.first.id)||a.first.exerciseId!==id))throw Error('Не найдена первая попытка.');
      if(a.checked&&!a.first)throw Error('Ответ не связан с первой попыткой.');
    }
    for(const id of session.exerciseIds.slice(0,session.position)){const a=session.answers[id];if(!a?.first||!a.checked||!(a.correct||a.revealedAnswer))throw Error('Пропущен незавершённый вопрос.');}
    for(const [id,a] of Object.entries(session.answers)){if(a.first){a.first=d.attempts.find(item=>item.id===a.first.id);const e=UEX[id];if(e.type==='gap')a.lockedSlots=e.slots.filter(slot=>slot.acceptedOptionIds.includes(a.selection[slot.id])&&(a.checked||uUnits(e,a.first).some(unit=>unit.id===slot.id&&unit.correct))).map(slot=>slot.id);}}
  }
  if(d.session)validateSession(d.session);
  if(d.sessions!==undefined&&!record(d.sessions))throw Error('Повреждены сохранённые тренировки.');
  if(d.history!==undefined&&!Array.isArray(d.history))throw Error('Повреждена история тренировок.');
  const result={...uDefault()};
  for(const key of Object.keys(result))if(key in d)result[key]=d[key];
  result.sessions=record(d.sessions)?d.sessions:{};result.history=Array.isArray(d.history)?d.history:[];
  for(const [key,session] of Object.entries(result.sessions)){if(key!==session.lessonId)throw Error('Повреждена сохранённая тренировка темы.');validateSession(session);}
  if(d.session)result.sessions[d.session.lessonId]=d.session;
  for(const item of result.history)if(!record(item)||typeof item.id!=='string'||!uScopeValid(item.lessonId)||!Array.isArray(item.exerciseIds)||!item.exerciseIds.every(id=>UEX[id]))throw Error('Повреждена история тренировок.');
  result.selectedLessons=Array.isArray(d.selectedLessons)?[...new Set(d.selectedLessons.filter(id=>ULESSONS[id]))]:[];
  if(result.attempts.some(a=>UEX[a.exerciseId].slots.length>1&&!a.slotResults)){
    result.skills={};
    for(const a of result.attempts){const e=UEX[a.exerciseId];a.slotResults=uUnits(e,a);for(const unit of a.slotResults)for(const id of unit.skillIds){const skill=result.skills[id]||(result.skills[id]={kind:e.focus==='vocabulary'?'vocabulary':'grammar',independentCorrect:0,errors:0,hinted:0});skill[unit.independent?'independentCorrect':unit.correct?'hinted':'errors']++;skill.lastPracticedAt=a.answeredAt;}
      if(e.slots.length>1&&result.mistakes[e.id]){const failed=a.slotResults.filter(x=>!x.independent).flatMap(x=>x.skillIds);if(failed.length)result.mistakes[e.id].skillIds=[...new Set(failed)];else delete result.mistakes[e.id];}
    }
  }
  return {...result,count:['10','20','40','all'].includes(d.count)?d.count:'20',difficulty:['all','basic','challenge'].includes(d.difficulty)?d.difficulty:'all',mode:['mixed','grammar','vocabulary','mistakes'].includes(d.mode)?d.mode:'mixed',volume:['all','1','2'].includes(d.volume)?d.volume:'all',display:d.display==='kanji'?'kanji':'kana',lessonId:ULESSONS[d.lessonId]?d.lessonId:null,view:'catalog',openRule:null};
}
function uInit(){
  try{const raw=localStorage.getItem(UKEY);if(raw){UP=uValidateProgress(JSON.parse(raw));uFinish();}}catch(err){uStorageError='Не удалось прочитать сохранение практики. Старое сохранение не перезаписывается до следующего действия. '+err.message;}
}
function uSave(){
  try{if(UP.session)UP.sessions[UP.session.lessonId]=UP.session;localStorage.setItem(UKEY,JSON.stringify(UP));uStorageError='';return true;}catch{uStorageError='Не удалось сохранить прогресс на устройстве. Экспортируйте его перед закрытием приложения.';return false;}
}
function uShuffle(values){
  const a=values.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;
}
const U_MODE_LABELS={mixed:'Вместе',vocabulary:'Слова',grammar:'Грамматика',mistakes:'Ошибки'};
const U_LEVEL_LABELS={all:'Тренировка',basic:'Базовый',challenge:'Сложнее'};
function uBtn(label,action,cls='',disabled=false){
  const primary=cls.includes('primary'),wide=cls.includes('wide');
  return `<button class="${primary?'start-btn':'chip'} up-button ${wide?'wide':''}" data-a="up:${esc(action)}" ${disabled?'disabled':''}>${label}</button>`;
}
function uHeader(title,action='catalog',subtitle=''){
  return `<header class="cfg-hdr">${action?`<button class="cfg-hdr-back" data-a="up:${esc(action)}" aria-label="Назад">←</button>`:''}<span class="cfg-hdr-title">${esc(title)}</span>${subtitle?`<span class="up-header-meta">${esc(subtitle)}</span>`:''}</header>`;
}
function uChips(label,items,current,action){return `<section class="cfg-card"><div class="cfg-lbl">${label}</div><div class="chips">${items.map(([id,title])=>`<button class="chip ${id===current?'on':''}" aria-pressed="${id===current}" data-a="up:${action}:${id}">${title}</button>`).join('')}</div></section>`;}
function uModePills(){return uChips('Что тренируем',Object.entries(U_MODE_LABELS),UP.mode,'mode');}
function uSettings(){return uModePills()+uChips('Сложность',[['basic','Базовый'],['all','Тренировка'],['challenge','Сложнее']],UP.difficulty,'difficulty')+uChips('Количество заданий',[['10','10'],['20','20'],['40','40'],['all','Все']],UP.count,'count');}
function uProgress(l){const ids=[...new Set(l.exerciseIds.flatMap(id=>UEX[id].skillIds))];return Math.round(ids.filter(id=>UP.skills[id]?.independentCorrect>0).length/ids.length*100);}
function uCounts(){const independent=new Set(UP.attempts.flatMap(a=>uUnits(UEX[a.exerciseId],a).filter(unit=>unit.independent).map(unit=>a.exerciseId+'.'+unit.id))).size;return {independent,total:UP.attempts.length};}
function uStats(items){return `<div class="nstats">${items.map(([value,label,tone])=>`<div class="nstat ${tone||''}"><div class="n">${value}</div><div class="l">${label}</div></div>`).join('')}</div>`;}
function uBar(percent,left,right){return `<div class="nprog"><div class="nprog-bar" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100" aria-label="${esc(left)}"><i style="width:${percent}%"></i></div><div class="nprog-info"><span>${esc(left)}</span><span>${esc(right)}</span></div></div>`;}
function uActiveSessions(){return Object.values(UP.sessions).filter(s=>s.position<s.exerciseIds.length);}
function uSessionLabel(s){return `${U_MODE_LABELS[s.mode]||'Практика'} · ${s.position+1} / ${s.exerciseIds.length}`;}
function uLessonRuns(id){return UP.history.filter(h=>h.lessonId===id);}
function buildPractice(){
  const error=uStorageError?`<div class="cfg-card up-error" role="alert">${esc(uStorageError)}</div>`:'';
  const body=UP.view==='mix'?uMixView():UP.view==='session'&&UP.session?uSessionView():UP.view==='lesson'&&ULESSONS[UP.lessonId]?uLessonView():uCatalogView();
  return `<main class="up-page">${error}${body}<input class="up-file" id="up-import-file" type="file" accept="application/json,.json" aria-label="Импорт прогресса"></main>`;
}
function uCatalogView(){
  const c=uCounts(),mistakes=Object.keys(UP.mistakes).filter(id=>UEX[id]),active=uActiveSessions();
  const lessons=UMI.lessons.filter(l=>UP.volume==='all'||String(l.volume)===UP.volume);
  const seen=new Set(UP.attempts.map(a=>a.exerciseId)).size;
  return `<div class="nlogo"><img src="${ASSETS.logo}" alt="日本語"></div>${uHeader('Практика',null)}<div class="up-context">Темы Genki 1–23 · частичное покрытие учебника</div>
    <div class="nseg">${[['all','Все'],['1','Genki I'],['2','Genki II']].map(([id,label])=>`<button class="nseg-btn ${UP.volume===id?'on':''}" aria-pressed="${UP.volume===id}" data-a="up:volume:${id}">${label}</button>`).join('')}</div>
    ${uStats([[UMI.lessons.length,'Темы'],[UMI.exercises.length,'Задания'],[c.independent,'Верных ответов','g']])}
    ${uBar(Math.round(seen/UMI.exercises.length*100),'Пройдено '+seen,'из '+UMI.exercises.length+' заданий')}
    ${active.length?`<div class="up-section-label">Продолжить тренировку</div><div class="up-list up-inset">${active.map(s=>`<button class="up-lesson" data-a="up:resume:${s.lessonId}"><span class="up-lesson-main"><span class="up-lesson-title">${esc(uScopeTitle(s.lessonId))}</span><span class="up-lesson-meta">${uSessionLabel(s)}</span></span><span class="up-arrow">›</span></button>`).join('')}</div>`:''}
    <div class="ncards up-mode-cards">${[['mixed',ASSETS.cQuiz,'Вместе'],['vocabulary',ASSETS.cCards,'Слова'],['grammar',VERB_ICON,'Грамматика'],['mistakes',MATCH_ICON,'Ошибки · '+mistakes.length]].map(([id,img,label])=>`<button class="ncard ${UP.mode===id?'on':''}" data-a="up:mode:${id}" aria-pressed="${UP.mode===id}"><img src="${img}" alt=""><b>${label}</b></button>`).join('')}</div>
    ${UP.mode==='mistakes'?`<div class="cfg-card up-help">${mistakes.length?'В первую очередь — другие примеры тех навыков, где были ошибки.':'Ошибок пока нет. Они появятся здесь после тренировок.'}${mistakes.length?uBtn('Повторить ошибки','start:all','primary wide',!uPool('all').length):''}${mistakes.length&&!uPool('all').length?'<p>Исходные вопросы будут доступны через 10 минут.</p>':''}</div>`:''}
    <section class="cfg-card"><div class="cfg-lbl">Несколько уроков вместе</div><p class="up-sub">Выбери темы для общей тренировки и смешанного чтения.</p>${uBtn('Комбинировать уроки','mix','primary wide')}</section>
    <div class="up-section-label">Темы · тренируйся сколько нужно</div>
    <div class="up-list up-inset">${lessons.map(l=>{const pending=UP.sessions[l.id],runs=uLessonRuns(l.id),pct=uProgress(l);return `<button class="up-lesson" data-a="up:lesson:${l.id}"><span class="up-number">${String(l.number).padStart(2,'0')}</span><span class="up-lesson-main"><span class="up-lesson-title">${esc(l.titleRu)}</span><span class="up-lesson-meta">≈ Genki ${l.volume===1?'I':'II'} · урок ${l.number}<br>${l.exerciseIds.length} заданий · ${l.rules.length} правил${runs.length?' · тренировок: '+runs.length:''}${pending&&pending.position<pending.exerciseIds.length?' · есть сохранённая':''}</span><span class="nprog-bar up-mini-progress"><i style="width:${pct}%"></i></span></span><span class="up-arrow">›</span></button>`;}).join('')}</div>
    <details class="cfg-card up-about"><summary>О практике и сохранении</summary><p class="up-sub">${UMI.words.length} слов, ${UMI.lessons.reduce((n,l)=>n+l.rules.length,0)} правил. Собственные примеры по темам Genki 3rd Edition; Представлены темы всех 23 уроков, но покрытие грамматики, лексики и чтения частичное; это не полный курс учебника. Локальный пилот, редакторская проверка ещё не выполнена.</p><div class="chips">${uBtn('Экспорт прогресса','export')}${uBtn('Импорт прогресса','import')}</div><p class="up-sub"><a href="${esc(UMI.sources[0].url)}" target="_blank" rel="noopener noreferrer">Программа тем Genki ↗</a></p></details>`;
}
function uLessonView(){
  const l=ULESSONS[UP.lessonId],pending=UP.sessions[l.id],hasPending=pending&&pending.position<pending.exerciseIds.length,runs=uLessonRuns(l.id),pool=uPool(l.id);
  const available=uTargetCount(pool.length),seen=new Set(UP.attempts.filter(a=>UEX[a.exerciseId]?.lessonId===l.id).map(a=>a.exerciseId)).size;
  const fresh=pool.filter(e=>!UP.attempts.some(a=>a.exerciseId===e.id)).length;
  return `${uHeader(l.titleRu)}<div class="up-context">≈ Genki ${l.volume===1?'I':'II'} · урок ${l.number}</div>
    ${uStats([[l.exerciseIds.length,'В теме'],[seen,'Попробовал','y'],[runs.length,'Тренировки','g']])}
    ${uBar(uProgress(l),uProgress(l)+'% навыков','Правила, чтение и слова')}
    ${hasPending?`<section class="cfg-card up-help"><div class="cfg-lbl">Сохранённая тренировка</div><p>${uSessionLabel(pending)}</p>${uBtn('Продолжить','resume:'+l.id,'primary wide')}</section>`:''}
    ${uSettings()}<div class="up-inset up-sub">${UP.difficulty==='challenge'?'Выбор из расширенного набора вариантов, несколько пропусков, чтение текста и сборка с лишними блоками.':UP.difficulty==='basic'?'Узнавание слов, чтения и базовых форм.':'Слова, новые ситуации, формы, сборка и чтение.'}<br>${fresh} ещё не встречавшихся заданий в выбранном режиме.${hasPending?' Настройки применятся к следующей тренировке.':''}</div>
    <div class="start-row">${uBtn(hasPending?'Продолжить сохранённую':`Начать · ${available} заданий`,hasPending?'resume:'+l.id:'start:'+l.id,'primary wide',!hasPending&&!pool.length)}</div>
    <div class="up-section-label">Правила</div>
    ${l.rules.map((r,i)=>`<div class="cfg-card up-rule-card"><button class="up-rule" aria-expanded="${UP.openRule===r.id}" data-a="up:rule:${r.id}"><span class="up-number">${String(i+1).padStart(2,'0')}</span><span>${esc(r.titleRu)}</span><span class="up-arrow">${UP.openRule===r.id?'−':'+'}</span></button>${UP.openRule===r.id?`<div class="up-rule-detail">${esc(r.formationRu)}<div class="up-example" lang="ja">${esc(r.example)}</div><p>${esc(r.translationRu)}</p></div>`:''}</div>`).join('')}
    <div class="up-heading up-inset"><span>Слова темы</span>${uBtn(UP.display==='kana'?'Кандзи':'Кана','display')}</div>
    <div class="cfg-card">${l.wordIds.map(id=>{const w=UWORDS[id],linked=UP.wordLinks[id]&&S.words.some(x=>x.id===UP.wordLinks[id]);return `<div class="up-word"><div><div class="up-example" lang="ja">${uWord(w)}</div><span class="up-muted">${esc(w.meaningsRu.join('; '))}</span></div>${uBtn(linked?'Добавлено ✓':'+ В словарь','word:'+id,'',linked)}</div>`;}).join('')}${uBtn('Добавить слова темы','words:'+l.id,'wide')}</div>
    ${runs.length?`<div class="up-section-label">Последние тренировки</div>${runs.slice(-3).reverse().map(h=>`<div class="cfg-card up-run"><span>${U_MODE_LABELS[h.mode]||'Практика'} · ${h.exerciseIds.length} заданий</span><span class="up-muted">${h.independentCorrect} верно · ${new Date(h.completedAt).toLocaleDateString('ru-RU')}</span></div>`).join('')}`:''}`;
}
function uMixView(){
  const key=uMixKey(),ids=UP.selectedLessons,pending=UP.sessions[key],pool=ids.length>=2?uPool(key):[],available=uTargetCount(pool.length);
  return `${uHeader('Комбинировать уроки')}<section class="cfg-card"><div class="cfg-lbl">Выбери минимум две темы · выбрано ${ids.length}</div><div class="up-mix-list">${UMI.lessons.map(l=>`<button class="chip ${ids.includes(l.id)?'on':''}" aria-pressed="${ids.includes(l.id)}" data-a="up:select:${l.id}"><span>${l.number}. ${esc(l.titleRu)}</span><small>≈ Genki ${l.volume===1?'I':'II'} · урок ${l.number}</small></button>`).join('')}</div><div class="chips">${uBtn('Все темы','select-all')}${uBtn('Снять выбор','select-none')}</div></section>${uSettings()}<p class="up-sub up-inset">Вместе — задания выбранных тем и чтение двух отдельных ситуаций из разных уроков. Каждый отрывок подписан A или B; вопросы относятся к указанному тексту. Только материал выбранных тем.</p><div class="start-row">${uBtn(pending&&pending.position<pending.exerciseIds.length?'Продолжить смешанную':`Начать · ${available} заданий`,'start:'+key,'primary wide',ids.length<2||!pool.length)}</div>`;
}
function uWord(w){return UP.display==='kana'?esc(w.reading):w.surface===w.reading?esc(w.surface):`<ruby>${esc(w.surface)}<rt>${esc(w.reading)}</rt></ruby>`;}
function uFamily(e){return e.familyId||e.id;}
function uPool(lessonId){
  const scope=uScope(lessonId),mixed=lessonId.startsWith('mix,');
  let pool=UMI.exercises.filter(e=>e.mixedText?mixed&&e.lessonIds.every(id=>scope.includes(id)):scope.includes(e.lessonId));
  if(UP.mode==='mistakes'){
    const errors=Object.keys(UP.mistakes).filter(id=>UEX[id]&&scope.includes(UEX[id].lessonId));
    const skills=new Set(errors.flatMap(id=>UP.mistakes[id].skillIds));
    pool=pool.filter(e=>e.skillIds.some(id=>skills.has(id))&&(!UP.mistakes[e.id]||UP.mistakes[e.id].nextReviewAt<=Date.now()));
  }else if(UP.mode!=='mixed')pool=pool.filter(e=>e.focus===UP.mode||(UP.mode==='grammar'&&e.focus==='mixed'&&(e.type==='order'||mixed&&e.mixedText)));
  if(UP.difficulty!=='all')pool=pool.filter(e=>e.difficulty===UP.difficulty);
  const seen=new Map(),families=new Map();
  for(const a of UP.attempts){const time=a.answeredAt||0;seen.set(a.exerciseId,Math.max(seen.get(a.exerciseId)||0,time));const family=uFamily(UEX[a.exerciseId]);families.set(family,Math.max(families.get(family)||0,time));}
  const previous=new Set(UP.history.filter(h=>h.lessonId===lessonId).at(-1)?.exerciseIds||[]);
  return uShuffle(pool).sort((a,b)=>
    Number(seen.has(a.id))-Number(seen.has(b.id)) ||
    Number(families.has(uFamily(a)))-Number(families.has(uFamily(b))) ||
    Number(previous.has(a.id))-Number(previous.has(b.id)) ||
    Number(Boolean(UP.mistakes[a.id]))-Number(Boolean(UP.mistakes[b.id])) ||
    (seen.get(a.id)||0)-(seen.get(b.id)||0));
}
function uTargetCount(size){return UP.count==='all'?size:Math.min(Number(UP.count)||20,size);}
function uStart(lessonId){
  const saved=UP.sessions[lessonId];
  if(saved&&saved.position<saved.exerciseIds.length){UP.session=saved;UP.view='session';uSave();return;}
  const pool=uPool(lessonId),target=uTargetCount(pool.length);
  if(!pool.length){toast(UP.mode==='mistakes'?'Для исходных ошибок выдерживаем интервал 10 минут. Попробуйте позже.':'Нет заданий с этими настройками');return;}
  const selected=[],remaining=pool.slice(),families=new Set();
  // Rotate formats while prioritising unseen questions; related versions of an
  // example are spaced apart and used only after distinct families run out.
  if(lessonId.startsWith('mix,')){
    const reading=remaining.findIndex(e=>e.mixedText);if(reading>=0){const e=remaining.splice(reading,1)[0];selected.push(e);families.add(uFamily(e));}
    for(const id of uShuffle(uScope(lessonId))){if(selected.length>=target)break;const index=remaining.findIndex(e=>!e.mixedText&&e.lessonId===id);if(index>=0){const e=remaining.splice(index,1)[0];selected.push(e);families.add(uFamily(e));}}
  }
  const categories=UP.mode==='mixed'?['vocabulary','gap','choice','order','reading']:['gap','choice','order','reading'];
  let turn=0;
  while(selected.length<target&&remaining.length){
    const last=selected.at(-1),category=categories[turn++%categories.length];
    const match=e=>category==='vocabulary'?e.focus==='vocabulary':category==='reading'?e.labelRu==='Чтение текста':e.type===category&&e.labelRu!=='Чтение текста';
    const unseen=e=>!UP.attempts.some(a=>a.exerciseId===e.id);
    const distinct=e=>!families.has(uFamily(e));
    // Avoid an immediately repeated skill/word to keep feedback from answering
    // the next card. At exhaustion, explicit practice still allows repetition.
    const apart=e=>!last||!e.skillIds.some(id=>last.skillIds.includes(id));
    const choices=[e=>unseen(e)&&distinct(e)&&match(e)&&apart(e),e=>unseen(e)&&distinct(e)&&apart(e),e=>unseen(e)&&apart(e),e=>distinct(e)&&match(e)&&apart(e),e=>distinct(e)&&apart(e),e=>apart(e),()=>true];
    let index=-1;for(const predicate of choices){index=remaining.findIndex(predicate);if(index>=0)break;}
    const e=remaining.splice(index,1)[0];selected.push(e);families.add(uFamily(e));
  }
  UP.session={id:'session.'+uid(),lessonId,mode:UP.mode,difficulty:UP.difficulty,requestedCount:UP.count,createdAt:Date.now(),exerciseIds:selected.map(e=>e.id),position:0,answers:{},optionOrders:Object.fromEntries(selected.map(e=>[e.id,uShuffle(e.options.map(o=>o.id))]))};
  UP.sessions[lessonId]=UP.session;UP.view='session';uSave();
}
function uAnswer(e){const s=UP.session;return s.answers[e.id]||(s.answers[e.id]={selection:e.type==='order'?[]:e.type==='input'?{text:''}:{},hintUsed:false,revealedAnswer:false,first:null,checks:0,checked:false,correct:false,startedAt:Date.now()});}
function uCurrent(){return UP.session?UEX[UP.session.exerciseIds[UP.session.position]]:null;}
function uNormalize(s){return String(s||'').normalize('NFKC').trim().replace(/[\s。．.!！?？]+/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));}
function uReady(e,a){return e.type==='input'?Boolean(uNormalize(a.selection.text)):e.type==='order'?a.selection.length===(e.requiredCount||e.acceptedSequences[0].length):e.type==='gap'?e.slots.every(slot=>a.selection[slot.id]):Boolean(a.selection.choice);}
function uCorrect(e,a){return e.type==='input'?e.acceptedTexts.some(t=>uNormalize(t)===uNormalize(a.selection.text)):e.type==='order'?e.acceptedSequences.some(seq=>seqEq(seq,a.selection)):e.type==='gap'?e.slots.every(slot=>slot.acceptedOptionIds.includes(a.selection[slot.id])):e.acceptedChoiceIds.includes(a.selection.choice);}
function uSolution(e){return e.type==='input'?e.acceptedTexts[0]:e.type==='order'?e.acceptedSequences[0].map(id=>e.options.find(o=>o.id===id).text).join(' '):e.type==='gap'?e.prompt.map(t=>t.text).join('').replace(/\{\{([^}]+)\}\}/g,(_,slot)=>{const id=e.slots.find(s=>s.id===slot).acceptedOptionIds[0];return e.options.find(o=>o.id===id).text;}):e.options.find(o=>e.acceptedChoiceIds.includes(o.id)).text;}
function uSessionView(){
  const s=UP.session;if(s.position>=s.exerciseIds.length)return uResultView();
  const e=uCurrent(),a=uAnswer(e),n=s.exerciseIds.length,complete=a.checked&&(a.correct||a.revealedAnswer);
  const opts=s.optionOrders[e.id].map(id=>e.options.find(o=>o.id===id));
  const selected=id=>e.type==='order'?a.selection.includes(id):e.type==='input'?false:Object.values(a.selection).includes(id);
  let prompt=e.prompt.map(t=>esc(t.text)).join('');
  if(e.type==='gap')prompt=prompt.replace(/\{\{([^}]+)\}\}/g,(_,id)=>`<button class="up-gap ${a.lockedSlots?.includes(id)?'ok':a.checked&&a.selection[id]?'bad':''} ${(a.activeSlot||e.slots[0].id)===id?'active':''}" aria-label="Пропуск ${id==='right'?'2':'1'}" data-a="up:slot:${id}" ${complete||a.lockedSlots?.includes(id)?'disabled':''}>${esc(e.options.find(o=>o.id===a.selection[id])?.text||'···')}</button>`);
  const feedback=a.checked?`<section class="cfg-card up-feedback" aria-live="polite"><div class="quiz-result ${a.correct&&!a.revealedAnswer?'ok':'bad'}">${a.revealedAnswer?'Ответ открыт':a.correct?(a.first.firstAnswerCorrect&&!a.hintUsed?'Верно с первой попытки':'Верно · '+(a.hintUsed?'с подсказкой':'после исправления')):'Пока не подходит — попробуй исправить'}</div>${complete?`<div class="up-example" lang="ja">${esc(uSolution(e))}</div>`:''}<p>${esc(e.explanationRu)}</p>${e.type==='gap'&&e.slots.length>1?`<p>${e.slots.map((slot,i)=>`${i+1}: ${slot.acceptedOptionIds.includes(a.selection[slot.id])?'Верно ✓':'Нужно исправить'}`).join(' · ')}. Верные пропуски сохранены.</p>`:''}${e.type==='choice'||e.type==='gap'?Object.values(a.selection).map(id=>`<p>${esc(e.options.find(o=>o.id===id)?.feedbackRu||'')}</p>`).join(''):''}${e.display.hideReadings&&complete?`<p lang="ja">${e.targetWordIds.map(id=>uWord(UWORDS[id])).join(' · ')}</p>`:''}</section>`:'';
  return `${uHeader(uScopeTitle(s.lessonId),uScopeBack(s.lessonId),s.position+1+' / '+n)}<div class="up-context">≈ ${esc((e.lessonIds||[e.lessonId]).map(id=>{const l=ULESSONS[id];return 'Genki '+(l.volume===1?'I':'II')+' · урок '+l.number;}).join(' + '))}</div>${uBar(Math.round(s.position/n*100),s.position+' завершено',U_LEVEL_LABELS[s.difficulty]||'Тренировка')}
    <section class="quiz-q up-question"><div class="quiz-ql">${esc(e.labelRu||'Практика')}</div><h2 class="up-instruction">${esc(e.instructionRu)}</h2>${e.translationRu?`<p class="quiz-qh up-translation">${esc(e.translationRu)}</p>`:''}${prompt?`<div class="${e.focus==='vocabulary'&&e.type!=='gap'?'quiz-qm':'quiz-qm sm'} up-prompt" lang="ja">${prompt}</div>`:''}</section>
    ${e.type==='order'?`<div class="up-order up-inset" aria-label="Собранная фраза">${a.selection.length?a.selection.map((id,i)=>uBtn(esc(e.options.find(o=>o.id===id).text),'undo:'+i,'',complete)).join(''):'<span class="up-muted">Нажимай на блоки ниже. Нажатие на выбранный блок отменяет его.</span>'}<span class="up-muted up-order-count">${a.selection.length} / ${e.requiredCount||e.acceptedSequences[0].length} блоков</span></div>`:''}
    ${e.type==='input'?`<section class="quiz-panel"><label class="quiz-panel-lbl" for="up-text-answer">Твой ответ · кана</label><input id="up-text-answer" class="quiz-inp up-input ${a.checked?(a.correct?'ok':'bad'):''}" lang="ja" type="text" value="${esc(a.selection.text)}" placeholder="Введи ответ" autocomplete="off" autocorrect="off" spellcheck="false" ${complete?'disabled':''}></section>`:`<section class="quiz-panel"><div class="quiz-panel-lbl">${e.type==='order'?'Банк блоков':'Варианты ответа'}</div><div class="quiz-opts">${opts.map(o=>`<button class="qopt ${selected(o.id)?a.checked||a.lockedSlots?.length?(e.type==='gap'?e.slots.some(slot=>a.selection[slot.id]===o.id&&slot.acceptedOptionIds.includes(o.id))?'ok':'bad':a.correct?'ok':'bad'):'sel':''}" data-a="up:pick:${o.id}" aria-pressed="${selected(o.id)}" ${complete||(e.type==='order'&&selected(o.id))?'disabled':''}>${esc(o.text)}</button>`).join('')}</div></section>`}
    ${feedback}${a.hintUsed&&!e.display.hideReadings?`<div class="cfg-card up-help">${esc(e.explanationRu)}</div>`:''}
    <div class="start-row">${complete?uBtn(s.position===n-1?'К итогу':'Далее','next','primary wide'):uBtn('Проверить','check','primary wide',!uReady(e,a))}</div>
    ${!complete?`<div class="up-actions up-inset">${!e.display.hideReadings?uBtn('Подсказка','hint','',a.hintUsed):''}${uBtn('Показать ответ','reveal')}</div>`:''}<div class="up-actions up-inset">${uBtn('Сохранить и выйти',uScopeBack(s.lessonId))}</div>`;
}
function uFinish(){
  const s=UP.session;if(!s||s.position<s.exerciseIds.length||UP.history.some(h=>h.id===s.id))return;
  UP.history.push({id:s.id,lessonId:s.lessonId,mode:s.mode,difficulty:s.difficulty||'all',exerciseIds:s.exerciseIds.slice(),completedAt:Date.now(),independentCorrect:s.exerciseIds.reduce((n,id)=>n+uCleanUnits(s.answers[id]?.first),0),answerCount:s.exerciseIds.reduce((n,id)=>n+(UEX[id].type==='gap'?UEX[id].slots.length:1),0)});
}
function uRecord(e,a,correct){
  const s=UP.session,id=s.id+'.'+e.id;
  if(UP.attempts.some(x=>x.id===id))return;
  const attempt={id,sessionId:s.id,exerciseId:e.id,exerciseVersion:e.version,selection:JSON.parse(JSON.stringify(a.selection)),firstAnswerCorrect:correct,hintUsed:a.hintUsed,revealedAnswer:a.revealedAnswer,answeredAt:Date.now(),durationMs:Date.now()-a.startedAt,attemptNumber:1,checks:1,corrected:false};
  UP.attempts.push(attempt);a.first=attempt;
  attempt.slotResults=uUnits(e,attempt);
    for(const unit of attempt.slotResults)for(const id of unit.skillIds){const skill=UP.skills[id]||(UP.skills[id]={kind:e.focus==='vocabulary'?'vocabulary':'grammar',independentCorrect:0,errors:0,hinted:0});skill[unit.independent?'independentCorrect':unit.correct?'hinted':'errors']++;skill.lastPracticedAt=Date.now();skill.nextReviewAt=Date.now()+(unit.independent?86400000:600000);}
  const passed=[...new Set(attempt.slotResults.filter(x=>x.independent).flatMap(x=>x.skillIds))],failed=[...new Set(attempt.slotResults.filter(x=>!x.independent).flatMap(x=>x.skillIds))];
  for(const [id,m] of Object.entries(UP.mistakes)){m.skillIds=m.skillIds.filter(skill=>!passed.includes(skill));if(!m.skillIds.length)delete UP.mistakes[id];}
  if(failed.length)UP.mistakes[e.id]={skillIds:failed,lastAttemptAt:Date.now(),nextReviewAt:Date.now()+600000};
}
function uCheck(){const e=uCurrent();if(!e)return;const a=uAnswer(e);if(a.checked&&(a.correct||a.revealedAnswer)||!uReady(e,a))return;a.correct=uCorrect(e,a);a.checked=true;if(e.type==='gap'){a.lockedSlots=e.slots.filter(slot=>slot.acceptedOptionIds.includes(a.selection[slot.id])).map(slot=>slot.id);a.activeSlot=e.slots.find(slot=>!a.lockedSlots.includes(slot.id))?.id||e.slots[0].id;}a.checks++;if(!a.first)uRecord(e,a,a.correct);else{const record=UP.attempts.find(x=>x.id===a.first.id);if(record){record.checks=a.checks;record.corrected=a.correct;}}haptic(a.correct?'light':'medium');uSave();}
function uResultView(){
  const s=UP.session,answers=s.exerciseIds.map(id=>s.answers[id]);
  const clean=answers.reduce((n,a)=>n+uCleanUnits(a?.first),0),total=s.exerciseIds.reduce((n,id)=>n+(UEX[id].type==='gap'?UEX[id].slots.length:1),0);
  const hint=answers.reduce((n,a)=>n+(a?.hintUsed&&!a.revealedAnswer?uUnits(UEX[a.first.exerciseId],a.first).filter(unit=>!unit.independent).length:0),0);
  const fix=answers.reduce((n,a)=>n+(a?.first&&a.correct&&!a.hintUsed&&!a.revealedAnswer?uUnits(UEX[a.first.exerciseId],a.first).filter(unit=>!unit.independent).length:0),0);
  const reveal=answers.reduce((n,a)=>n+(a?.revealedAnswer?uUnits(UEX[a.first.exerciseId],a.first).filter(unit=>!unit.independent).length:0),0);
  const wordIds=[...new Set(s.exerciseIds.flatMap(id=>UEX[id].targetWordIds))];
  return `${uHeader('Тренировка завершена',uScopeBack(s.lessonId))}${uStats([[clean,'С первого раза','g'],[hint,'С подсказкой','y'],[fix+reveal,'Повторить','r']])}
    ${uBar(Math.round(clean/total*100),clean+' из '+total+' ответов','Без подсказки')}
    <div class="cfg-card up-help">${s.exerciseIds.length} заданий · ${total} отдельных ответов. Пропуски оцениваются независимо.<br>После исправления: ${fix}<br>Ответ открыт: ${reveal}<br>В следующей тренировке сначала будут новые вопросы. К этой теме можно вернуться в любой момент.</div>
    <div class="start-row">${uBtn('Тренироваться ещё','start:'+s.lessonId,'primary wide')}</div><div class="up-actions up-inset">${uBtn('К темам',uScopeBack(s.lessonId))}${uBtn('Все темы','catalog')}</div>
    <details class="cfg-card up-about"><summary>Разбор · ${s.exerciseIds.length} заданий</summary>${s.exerciseIds.map(id=>{const e=UEX[id],a=s.answers[id];return `<div class="up-review-row"><span>${esc(e.labelRu||'Грамматика')}</span><span class="up-muted">${a.revealedAnswer?'Ответ открыт':a.hintUsed?'С подсказкой':e.slots.length>1?uCleanUnits(a.first)+' / '+e.slots.length+' с первой попытки':a.first.firstAnswerCorrect?'С первой попытки':'После исправления'}</span><div class="up-example" lang="ja">${esc(uSolution(e))}</div></div>`;}).join('')}</details>
    ${wordIds.length?`<div class="up-section-label">Слова тренировки</div><div class="cfg-card">${wordIds.map(id=>`<div class="up-word"><div><div class="up-example" lang="ja">${uWord(UWORDS[id])}</div><span class="up-muted">${esc(UWORDS[id].meaningsRu.join('; '))}</span></div>${uBtn('+ В словарь','word:'+id)}</div>`).join('')}</div>`:''}`;
}
function uAddWord(id){
  const w=UWORDS[id];if(!w)return false;
  let existing=S.words.find(x=>x.id===id||x.practiceWordId===id||(normKey(x.kanji)===normKey(w.surface)&&normKey(x.reading)===normKey(w.reading))||(normKey(x.kanji)===normKey(w.reading)&&normKey(x.reading||x.kanji)===normKey(w.reading)));
  if(!existing){existing={id,practiceWordId:id,kanji:w.surface,reading:w.reading,meaning:w.meaningsRu.join('; '),folder:'umi · Практика'};S.words.push(existing);}
  UP.wordLinks[id]=existing.id;return true;
}
function uExport(){const blob=new Blob([JSON.stringify(UP,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='umi-progress-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function uAction(value){
  const [type,...rest]=value.split(':');const v=rest.join(':');
  const e=uCurrent(),a=e?uAnswer(e):null,complete=a?.checked&&(a.correct||a.revealedAnswer);
  switch(type){
    case 'catalog':UP.view='catalog';break;
    case 'mix':UP.view='mix';break;
    case 'select':if(ULESSONS[v])UP.selectedLessons=UP.selectedLessons.includes(v)?UP.selectedLessons.filter(id=>id!==v):[...UP.selectedLessons,v];break;
    case 'select-all':UP.selectedLessons=UMI.lessons.map(l=>l.id);break;
    case 'select-none':UP.selectedLessons=[];break;
    case 'lesson':if(ULESSONS[v]){UP.lessonId=v;UP.view='lesson';UP.openRule=null;}break;
    case 'mode':if(['mixed','grammar','vocabulary','mistakes'].includes(v))UP.mode=v;break;
    case 'count':if(['10','20','40','all'].includes(v))UP.count=v;break;
    case 'difficulty':if(['all','basic','challenge'].includes(v))UP.difficulty=v;break;
    case 'volume':if(['all','1','2'].includes(v))UP.volume=v;break;
    case 'display':UP.display=UP.display==='kana'?'kanji':'kana';break;
    case 'rule':UP.openRule=UP.openRule===v?null:v;break;
    case 'start':if(uScopeValid(v)&&(!v.startsWith('mix,')||uScope(v).length>=2))uStart(v);break;
    case 'resume':if(v&&UP.sessions[v])UP.session=UP.sessions[v];if(UP.session)UP.view='session';break;
    case 'slot':if(e?.type==='gap'&&!complete&&e.slots.some(s=>s.id===v)&&!a.lockedSlots?.includes(v))a.activeSlot=v;break;
    case 'pick':if(e&&!complete&&e.options.some(o=>o.id===v)){
      if(e.type==='order'){if(!a.selection.includes(v)&&a.selection.length<(e.requiredCount||e.acceptedSequences[0].length))a.selection.push(v);}
      else if(e.type==='gap'){const slot=a.activeSlot||e.slots[0].id;if(a.lockedSlots?.includes(slot)||e.slots.some(s=>a.lockedSlots?.includes(s.id)&&a.selection[s.id]===v))break;if(!e.allowOptionReuse)for(const key of Object.keys(a.selection))if(key!==slot&&a.selection[key]===v)delete a.selection[key];a.selection[slot]=v;const next=e.slots.find(s=>!a.selection[s.id]);if(next)a.activeSlot=next.id;}
      else if(e.type==='choice')a.selection.choice=v;
      a.checked=false;a.correct=false;
    }break;
    case 'undo':if(e?.type==='order'&&!complete){a.selection.splice(+v,1);a.checked=false;a.correct=false;}break;
    case 'hint':if(a&&!complete&&!e.display.hideReadings){a.hintUsed=true;const record=UP.attempts.find(x=>x.id===a.first?.id);if(record)record.hintUsed=true;}break;
    case 'reveal':if(a&&!complete){a.revealedAnswer=true;a.checked=true;a.correct=false;if(!a.first)uRecord(e,a,false);else{const record=UP.attempts.find(x=>x.id===a.first.id);if(record)record.revealedAnswer=true;}}break;
    case 'check':uCheck();break;
    case 'next':if(complete){UP.session.position++;uFinish();}break;
    case 'word':if(uAddWord(v)){save();toast('Слово в словаре');}break;
    case 'words':if(ULESSONS[v]){ULESSONS[v].wordIds.forEach(uAddWord);save();toast('Слова добавлены в словарь');}break;
    case 'export':uExport();return;
    case 'import':document.getElementById('up-import-file')?.click();return;
  }
  uSave();render();
}
function uBind(){
  const text=document.getElementById('up-text-answer');
  if(text){
    text.oninput=()=>{const e=uCurrent(),a=e?uAnswer(e):null;if(!a||a.checked&&(a.correct||a.revealedAnswer))return;a.selection.text=text.value;a.checked=false;a.correct=false;uSave();const check=document.querySelector('[data-a="up:check"]');if(check)check.disabled=!uReady(e,a);};
    text.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();uAction('check');}};
  }
  const input=document.getElementById('up-import-file');if(input)input.onchange=async()=>{const file=input.files[0];if(!file)return;try{if(file.size>10000000)throw Error('Файл слишком большой.');const incoming=uValidateProgress(JSON.parse(await file.text()));uPendingImport=incoming;toast('Файл проверен: '+incoming.attempts.length+' результатов.');uShowImport();}catch(err){toast('Импорт не выполнен: '+err.message);}};
}
function uShowImport(){
  const pending=uPendingImport;if(!pending)return;
  // Concrete, reversible confirmation because import replaces local practice history.
  const panel=document.createElement('div');panel.className='cfg-card up-help';panel.id='up-import-confirm';panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Импорт прогресса');panel.innerHTML=`<h3>Импортировать ${pending.attempts.length} результатов?</h3><p>Текущая история практики будет заменена. Сначала можно сохранить её в файл.</p><div class="up-actions"><button class="chip" id="up-before-export">Экспорт текущей</button><button class="chip on" id="up-confirm-import">Импортировать</button><button class="chip" id="up-cancel-import">Отмена</button></div>`;document.querySelector('.up-page').prepend(panel);document.getElementById('up-before-export').onclick=()=>{uExport();};document.getElementById('up-confirm-import').onclick=()=>{UP=pending;uPendingImport=null;uSave();render();toast('Прогресс импортирован');};document.getElementById('up-cancel-import').onclick=()=>{uPendingImport=null;panel.remove();};
}
