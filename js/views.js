'use strict';
// Рендер экранов (строки HTML)
/* ── Card Variant Builder (Figma 31:112 / 33:235) ── */
function renderKun(s){
  if(!s)return'';
  const tokens=String(s).split(/[、・,]/).map(t=>t.trim()).filter(Boolean);
  return tokens.map(t=>{
    const i=t.indexOf('.');
    const inner=i<0?esc(t):esc(t.slice(0,i))+`<span style="color:#636363">${esc(t.slice(i+1))}</span>`;
    return`<span style="display:inline-block;white-space:nowrap">${inner}</span>`;
  }).join(', ');
}
function cvReadRow(label,value,raw){
  return`<div class="cv-rread"><div class="cv-rl">${label}:</div><div class="cv-rv">${raw?value:esc(value)}</div></div>`;
}
function cvMeaningsBlock(word,showFields){
  const has=f=>showFields.includes(f)&&word[f];
  const g=[];
  ['meaning','translation'].forEach(f=>{
    if(has(f))word[f].split(/;/).forEach(s=>{const t=s.trim();if(t)g.push(t);});
  });
  if(!g.length)return'';
  return`<div class="cv-meanings">${g.slice(0,7).map((s,i)=>`<div class="cv-mn"><span class="cv-mi">${i+1}.</span><span class="cv-mt">${esc(s)}</span></div>`).join('')}</div>`;
}
function buildCardVariant(word,showFields,dataType){
  if(!word||!showFields||!showFields.length)return'<div style="color:var(--t2);text-align:center">—</div>';
  const has=f=>showFields.includes(f)&&word[f];
  const isKanjiType=dataType==='kanji';
  const kanaOnly=dataType==='words'&&S.wordDisplay==='kana'&&!!word.reading;
  const mHtml=cvMeaningsBlock(word,showFields);

  // Build readings (right side of top row)
  const reads=[];
  if(isKanjiType){
    let onR=word.on_reading,kunR=word.kun_reading;
    if((!onR||!kunR)&&word.reading){
      const sp=splitOnKun([word.reading,onR,kunR].filter(Boolean).join('・'));
      onR=onR||sp.on_reading;kunR=kunR||sp.kun_reading;
    }
    if(showFields.includes('on_reading')&&onR)reads.push(cvReadRow('on',onR));
    if(showFields.includes('kun_reading')&&kunR)reads.push(cvReadRow('kun',renderKun(kunR),true));
  }else{
    // В режиме «только кана» само слово уже показано каной — строку чтения не дублируем
    if(has('reading')&&!(kanaOnly&&has('kanji')))reads.push(cvReadRow('kana',word.reading));
  }
  const readsHtml=reads.length?`<div class="cv-readings">${reads.join('')}</div>`:'';

  // Top row: main char + readings (if either exists)
  const mainHtml=has('kanji')?`<div class="cv-main">${esc(kanaOnly?word.reading:word.kanji)}</div>`:'';
  let topHtml='';
  if(mainHtml||readsHtml){
    topHtml=`<div class="cv-top">${mainHtml}${readsHtml}</div>`;
  }

  if(!topHtml&&!mHtml){
    if(has('notes'))return`<div class="cv-root"><div style="font-size:12px;color:var(--t2);font-style:italic">${esc(word.notes)}</div></div>`;
    return'<div style="color:var(--t2);text-align:center">—</div>';
  }
  return`<div class="cv-root">${topHtml}${mHtml}</div>`;
}

/* ── Card Front Builder ── */
function buildCardFront(word,frontField,dataType){
  const isKanjiType=dataType==='kanji';
  const val=word[frontField]||'—';
  if(frontField==='kanji'){
    if(isKanjiType)return`<div class="fc-kanji">${esc(val)}</div>`;
    return`<div class="fc-main">${esc(wordGlyph(word,dataType))}</div>`;
  }
  if(frontField==='on_reading'){
    return`<div class="fc-lbl">on</div><div class="cv-kana-lg">${esc(val)}</div>`;
  }
  if(frontField==='kun_reading'){
    return`<div class="fc-lbl">kun</div><div class="cv-kana-lg">${renderKun(val)}</div>`;
  }
  if(frontField==='reading'){
    return`<div class="cv-kana-lg">${esc(val)}</div>`;
  }
  if(frontField==='meaning'||frontField==='translation'){
    const g=[];val.split(/;/).forEach(s=>{const t=s.trim();if(t)g.push(t);});
    if(g.length)return`<div class="fc-lbl">Значение</div><div class="cv-meanings">${
      g.slice(0,4).map((s,i)=>`<div class="cv-mn"><span class="cv-mi">${i+1}.</span><span class="cv-mt">${esc(s)}</span></div>`).join('')
    }</div>`;
  }
  return`<div class="fc-lbl">${fldLabel(frontField,dataType)}</div><div class="fc-main sm">${esc(val)}</div>`;
}

/* ── Render ── */
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

function render(){document.getElementById('app').innerHTML=buildApp();bindAll();if(practiceAvailable)uBind();syncBackButton();}
// Куда ведёт «Назад» на текущем экране (null — корневой экран вкладки)
function backAction(){
  if(S.screen==='import')return'back-import';
  if(S.studyQueue.length&&!S.studyResults)return'stop-study';
  if(S.quizQ)return'stop-quiz';
  if(S.cfgScreen)return'close-cfg';
  if(S.tab==='practice'&&practiceAvailable){const a=uBackAction();return a?'up:'+a:null;}
  return null;
}
function syncBackButton(){
  const b=tg?.BackButton;if(!b)return;
  if(backAction())b.show();else b.hide();
}

function buildApp(){
  if(S.screen==='import')return buildImport();
  if(S.studyQueue.length&&!S.studyResults)return buildStudyActive()+nav();
  if(S.quizQ)return buildQuizActive()+nav();
  if(S.cfgScreen)return buildCfgScreen()+nav();
  switch(S.tab){
    case'home':    return buildHome()+nav();
    case'words':   return buildWords()+nav();
    case'practice':return (practiceAvailable?buildPractice():`<main class="up-page"><h1>Практика</h1><p class="up-sub">Не удалось загрузить учебную базу. Прогресс сохранён на устройстве. Обновите страницу, чтобы повторить загрузку.</p><button class="up-btn primary" onclick="location.reload()">Повторить загрузку</button></main>`)+nav();
    case'settings':return buildSettings()+nav();
  }
  return buildHome()+nav();
}

/* ── NAV (новый дизайн: 3 таба) ── */
const TABS=[
  {id:'home',    img:ASSETS.navHome, lbl:'Главная'  },
  {id:'words',   img:ASSETS.navDict, lbl:'Словарь'  },
  {id:'practice',beta:true,svg:'<svg viewBox="0 0 24 24" stroke-width="1.7"><path d="M3 4h6a4 4 0 0 1 3 1.5A4 4 0 0 1 15 4h6v16h-6a4 4 0 0 0-3 1.5A4 4 0 0 0 9 20H3z"/><path d="M12 5.5v16M6 8h3M15 8h3M6 12h3M15 12h3"/></svg>',lbl:'Практика'},
  {id:'settings',img:ASSETS.navSet,  lbl:'Настройки'},
];
function nav(){
  const cur=S.cfgScreen&&S.quizCfg.mode!=='verbs'?'home':S.tab; // формы глаголов открываются из практики
  return`<nav class="bnav">${TABS.map(t=>{
    const active=cur===t.id;
    return`<button class="bnav-btn${active?' active':''}" data-a="tab:${t.id}"${t.beta?' aria-label="Практика · бета"':''}>
      <span class="bnav-icon">${t.svg||`<img src="${t.img}" alt=""${active?'':' style="opacity:.5;filter:grayscale(.6)"'}>`}${t.beta?'<span class="bnav-beta" aria-hidden="true">β</span>':''}</span>
      <span>${t.lbl}</span>
    </button>`;}).join('')}</nav>`;
}

/* ── HOME (новый дизайн) ── */
function buildHome(){
  const type=S.homeTab,d=ds(type),p=pr(type);
  const total=d.length,know=d.filter(w=>statusOf(p,w.id)==='know').length;
  const learning=d.filter(w=>statusOf(p,w.id)==='learning').length,unk=total-know-learning;
  const pct=total?Math.round(know/total*100):0;
  const card=(img,lbl,action)=>`<button class="ncard" data-a="${action}"><img src="${img}" alt=""><b>${lbl}</b></button>`;
  const cards=type==='kanji'
    ? card(ASSETS.cCards,'Карточки','open-cfg:cards')
      +card(ASSETS.cQuiz,'Квиз','open-cfg:quiz')
      +card(ASSETS.cCompose,'Собрать слово','open-cfg:quiz-compose')
      +card(ASSETS.cPair,'Найти пару','open-cfg:quiz-pairs')
      +card(MATCH_ICON,'Сопоставь пары','open-cfg:quiz-match')
      +`<button class="nimport" data-a="go-import-home"><img src="${ASSETS.cImport}" alt="">Импортировать</button>`
    : card(ASSETS.cCards,'Карточки','open-cfg:cards')
      +card(ASSETS.cQuiz,'Квиз','open-cfg:quiz')
      +card(MATCH_ICON,'Сопоставь пары','open-cfg:quiz-match')
      +`<button class="nimport" data-a="go-import-home"><img src="${ASSETS.cImport}" alt="">Импортировать</button>`;
  return`
    <div class="nlogo"><img src="${ASSETS.logo}" alt="日本語"></div>
    <div class="nseg">
      <button class="nseg-btn${type==='words'?' on':''}" data-a="home-tab:words">Слова</button>
      <button class="nseg-btn${type==='kanji'?' on':''}" data-a="home-tab:kanji">Кандзи</button>
    </div>
    <div class="nstats">
      <div class="nstat g"><div class="n">${know}</div><div class="l">Знаю</div></div>
      <div class="nstat y"><div class="n">${learning}</div><div class="l">Учу</div></div>
      <div class="nstat r"><div class="n">${unk}</div><div class="l">Не знаю</div></div>
    </div>
    <div class="nprog">
      <div class="nprog-bar"><i style="width:${pct}%"></i></div>
      <div class="nprog-info"><span>${pct}%</span><span>${know} из ${total} изучено</span></div>
    </div>
    <div class="ncards">${cards}</div>`;
}

/* ── Экран настроек режима (открывается с карточки на главной) ──
 * Сегмент Слова/Кандзи вверху (как в новом дизайне), назад — через таб «Главная». */
function buildCfgScreen(){
  if(S.studyResults)return buildStudyDone();
  const isCards=S.cfgScreen==='cards';
  const mode=S.quizCfg.mode;
  // Спец-режимы (запущены с главной) — заголовок вместо сегмента
  if(!isCards&&(mode==='compose'||mode==='pairs'||mode==='verbs'||mode==='match6')){
    const title=mode==='compose'?'Собрать слово':mode==='pairs'?'Найти пару':mode==='match6'?'Сопоставь пары':'Формы глаголов';
    return`<div class="cfg-hdr"><button class="cfg-hdr-back" data-a="close-cfg">←</button><span class="cfg-hdr-title">${title}</span></div>`+buildQuizCfg();
  }
  const type=isCards?S.studyCfg.type:S.quizCfg.type;
  const seg=`<div class="nseg" style="padding-top:24px">
    <button class="nseg-btn${type==='words'?' on':''}" data-a="cfg-type:words">Слова</button>
    <button class="nseg-btn${type==='kanji'?' on':''}" data-a="cfg-type:kanji">Кандзи</button>
  </div>`;
  return seg+(isCards?buildCardsCfg():buildQuizCfg());
}

// чипы фильтров: 'base' — 5 базовых форм, 'form' — прочие конструкции, 'mod' — модификаторы + регистр
const VERB_BASE_FORMS=['dictionary','masu','te_form','ta_form','nai_form'];
function vbCatChips(kind){
  const sel=S.quizCfg.verbCats||[];
  const list=VERB_CATS.filter(c=>kind==='base'?(c.k==='form'&&VERB_BASE_FORMS.includes(c.v))
    :kind==='form'?(c.k==='form'&&!VERB_BASE_FORMS.includes(c.v)):c.k!=='form');
  return `<div class="chips">${list
    .map(c=>`<button class="chip${sel.includes(c.v)?' on':''}" data-a="verb-cat:${c.v}" title="${esc(c.d||'')}">${esc(c.l)}</button>`).join('')}</div>`;
}
function cfgCard(lbl,content){
  return`<div class="cfg-card"><div class="cfg-lbl">${lbl}</div>${content}</div>`;
}
function chips(items,activeVal,actionPrefix){
  return`<div class="chips">${items.map(it=>`<button class="chip${it.v===activeVal?' on':''}" data-a="${actionPrefix}:${it.v}">${it.l}</button>`).join('')}</div>`;
}
function folderChips(type,selected,actionPrefix){
  const allOn=!selected||!selected.length;
  return`<div class="chips">
    <button class="chip${allOn?' on':''}" data-a="${actionPrefix}:__all__">Все</button>
    ${foldersOf(type).map(f=>`<button class="chip${selected&&selected.includes(f)?' on':''}" data-a="${actionPrefix}:${esc(f)}">${esc(f)}</button>`).join('')}
  </div>`;
}

function buildCardsCfg(){
  const type=S.studyCfg.type;
  const d=ds(type);
  if(!d.length)return noData(type);
  const flds=type==='kanji'?KF:WF;
  const cnt=filtered(type,S.studyCfg.filter,S.studyCfg.count,S.studyCfg.folders).length;
  const filterOpts=[{v:'all',l:'Все'},{v:'unknown',l:'Не знаю'},{v:'learning',l:'Учу'},{v:'know',l:'Знаю'}];
  const counts=[{v:'50',l:'50'},{v:'100',l:'100'},{v:'150',l:'150'},{v:'all',l:'Все'}];
  return`
    ${foldersOf(type).length>1?cfgCard('Папки',folderChips(type,S.studyCfg.folders,'study-folder')):''}
    ${cfgCard('Лицевая сторона',`<div class="chips" id="chips-front">${flds.map(k=>`<button class="chip${S.studyCfg.front.includes(k)?' on':''}" data-field-front="${k}">${fldShort(k,type)}</button>`).join('')}</div>`)}
    ${cfgCard('Оборотная сторона',`<div class="chips" id="chips-back">${flds.map(k=>`<button class="chip${S.studyCfg.back.includes(k)?' on':''}" data-field="${k}">${fldShort(k,type)}</button>`).join('')}</div>`)}
    <div class="cfg-row">
      ${cfgCard('Фильтр',chips(filterOpts,S.studyCfg.filter,'study-filter'))}
      ${cfgCard('Количество',chips(counts,S.studyCfg.count,'study-count'))}
    </div>
    <div class="start-row"><button class="start-btn" data-a="start-study">Начать (${cnt})</button></div>`;
}

function buildQuizCfg(){
  const type=S.quizCfg.type;
  const d=ds(type);
  // verbs (формы глаголов) — встроенные данные, не требуют загруженных слов
  if(d.length<4&&S.quizCfg.mode!=='verbs')return`<div class="empty"><div class="ei">🎯</div><div class="et">Мало данных</div><div class="eb">Нужно минимум 4 записи (сейчас ${d.length})</div><button class="btn btn-p" style="margin:0 16px;width:calc(100% - 32px)" data-a="go-import-home">Импорт</button></div>`;
  const flds=type==='kanji'?KF:WF;
  const filterOpts=[{v:'all',l:'Все'},{v:'unknown',l:'Не знаю'},{v:'learning',l:'Учу'},{v:'know',l:'Знаю'}];
  const counts=[{v:'50',l:'50'},{v:'100',l:'100'},{v:'150',l:'150'},{v:'all',l:'Все'}];
  // «Режим ответа» — только базовые режимы; pairs/compose запускаются с главной
  const modes=[{v:'choice4',l:'4 варианта'},{v:'choice6',l:'6 вариантов'},{v:'input',l:'Вписать ответ'},{v:'mix',l:'Смешанный'}];
  if(type!=='kanji'&&(S.quizCfg.mode==='pairs'||S.quizCfg.mode==='compose'))S.quizCfg.mode='choice6';
  const mode=S.quizCfg.mode;
  const isVerbs=mode==='verbs';
  const isMatch=mode==='match6';
  const special=mode==='pairs'||mode==='compose'||isVerbs||isMatch; // спец-режимы с главной: без «Режим ответа» и полей
  const noFields=special;
  const aFields=arr(S.quizCfg.answer);
  const cmode=S.quizCfg.composeMode||'normal';
  const udiff=S.quizCfg.ultraDifficulty||'all';
  const verbsCfg=isVerbs
    ?cfgCard('Подсказка',chips([{v:'A',l:'Грамматика'},{v:'B',l:'Только смысл'}],S.quizCfg.verbMode,'verb-mode'))
      +cfgCard('Разбивка',chips([{v:'easy',l:'Простая'},{v:'medium',l:'Средняя'},{v:'hard',l:'Сложная'}],S.quizCfg.verbLevel,'verb-level'))
      +cfgCard('Глаголы',chips([{v:'all',l:'Все'},{v:'known',l:'Знакомые'}],S.quizCfg.verbSource,'verb-source'))
      +cfgCard('Стиль',chips([{v:'plain',l:'Простая'},{v:'polite',l:'Вежливая'},{v:'both',l:'Обе'}],S.quizCfg.verbStyle,'verb-style'))
      +cfgCard('Базовые формы',vbCatChips('base'))
      +cfgCard('Конструкции',vbCatChips('form'))
      +cfgCard('Изменить форму <span style="opacity:.55;font-weight:400">· комбинируется с формой</span>',vbCatChips('mod'))
    :'';
  // «Сопоставь пары»: наборы полей для левой и правой колонки (поле живёт только на одной стороне)
  const mSideChips=side=>{
    const on=arr(side==='L'?S.quizCfg.matchLeft:S.quizCfg.matchRight);
    return`<div class="chips">${flds.map(f=>`<button class="chip${on.includes(f)?' on':''}" data-a="match-side:${side}:${f}">${fldShort(f,type)}</button>`).join('')}</div>`;
  };
  const mHasSenses=[...arr(S.quizCfg.matchLeft),...arr(S.quizCfg.matchRight)].some(f=>f==='meaning'||f==='translation');
  const matchCfg=isMatch
    ?cfgCard('Слева (несколько)',mSideChips('L'))
      +cfgCard('Справа (несколько)',mSideChips('R'))
      +(mHasSenses?cfgCard('Значений в плитке',chips([{v:'one',l:'Одно'},{v:'all',l:'Все'}],S.quizCfg.matchSenses,'match-senses')):'')
    :'';
  const composeCfg=mode==='compose'
    ?cfgCard('Направление',`<div class="chips">
        <button class="chip${cmode==='normal'?' on':''}" data-a="compose-dir:normal">Собрать слово</button>
        <button class="chip${cmode==='reverse'?' on':''}" data-a="compose-dir:reverse">Собрать чтение</button>
        <button class="chip${cmode==='ultra'?' on':''}" data-a="compose-dir:ultra">Ultra</button>
      </div>`)
      +(cmode==='ultra'
        ?cfgCard('Сложность',chips([{v:'all',l:'Все'},{v:'easy',l:'Лёгкие'},{v:'medium',l:'Средние'},{v:'hard',l:'Сложные'}],udiff,'ultra-diff'))
        :cfgCard('Показывать на канвасе',`<div class="chips">
        ${cmode==='reverse'?'':`<button class="chip${S.quizCfg.composeShow.reading?' on':''}" data-a="compose-switch:reading">Кана</button>`}
        <button class="chip${S.quizCfg.composeShow.meaning?' on':''}" data-a="compose-switch:meaning">Значение</button>
      </div>`))
    :'';
  return`
    ${foldersOf(type).length>1?cfgCard('Папки',folderChips(type,S.quizCfg.folders,'quiz-folder')):''}
    ${special?'':cfgCard('Режим ответа',chips(modes,mode,'quiz-mode'))}
    ${noFields?'':cfgCard('Что в вопросе (несколько)',`<div class="chips" id="chips-q">${flds.map(k=>`<button class="chip${S.quizCfg.question.includes(k)?' on':''}" data-qfield="${k}">${fldShort(k,type)}</button>`).join('')}</div>`)}
    ${noFields?'':cfgCard('Что отгадываем (несколько)',`<div class="chips">${flds.map(k=>`<button class="chip${aFields.includes(k)?' on':''}" data-a="quiz-afield:${k}">${fldShort(k,type)}</button>`).join('')}</div>`)}
    ${composeCfg}${matchCfg}${verbsCfg}
    ${isVerbs?'':`<div class="cfg-row">
      ${cfgCard('Фильтр',chips(filterOpts,S.quizCfg.filter,'quiz-filter'))}
      ${cfgCard('Количество',chips(counts,S.quizCfg.count,'quiz-count'))}
    </div>`}
    <div class="start-row"><button class="start-btn" data-a="start-quiz">Начать</button></div>`;
}

/* ── STUDY ACTIVE ── */
function buildStudyActive(){
  if(S.studyResults)return buildStudyDone();
  const w=S.studyQueue[S.studyIdx];
  if(!w){sessionEnd();return buildStudyDone();}
  const total=S.studyQueue.length,curr=S.studyIdx+1,pct=Math.round(curr/total*100);
  const p=pr(S.studyCfg.type),status=statusOf(p,w.id);
  const sClass=status==='know'?'g':status==='learning'?'y':'r';
  const isKanji=S.studyCfg.type==='kanji';

  // Build front face content
  const frontBody=buildCardVariant(w,S.studyCfg.front,S.studyCfg.type)
    +(!S.cardFlipped?`<div class="fc-tap">нажмите чтобы перевернуть</div>`:``);


  // Build back face using card variant
  const backVariant=buildCardVariant(w,S.studyCfg.back,S.studyCfg.type);

  return`
    <div class="fc-counter">${curr}/${total}</div>
    <div class="fc-wrap" data-a="flip">
      <div class="fc${S.cardFlipped?' flipped':''}">
        <div class="fc-face">
          <div class="fc-sbar ${sClass}"></div>
          ${frontBody}
        </div>
        <div class="fc-face fc-back">
          <div class="fc-sbar ${sClass}"></div>
          <div class="fc-back-body">${backVariant}</div>
        </div>
      </div>
    </div>
    ${isKanji?buildHintBlock(w,S.cardHint,'toggle-card-hint'):''}
    <div class="mark-row">
      <button class="mbtn r" data-a="mark:unknown">✕ Не знаю</button>
      <button class="mbtn y" data-a="mark:learning">∼ Учу</button>
      <button class="mbtn g" data-a="mark:know">✓ Знаю</button>
    </div>
    <div class="stop-row">
      <button class="stop-btn" data-a="stop-study">Стоп</button>
      <button class="stop-btn" data-a="skip-card">Пропустить</button>
    </div>`;
}

/* ── Kanji hint block (Figma: Подсказка_квиз_кандзи) ──
 * Кнопка «Включить подсказки» → чипы «слово + кана» из словаря,
 * содержащие текущий иероглиф. Общая для квиза и карточек. */
function buildHintBlock(item,on,toggleAction){
  if(!S.hintsEnabled)return''; // подсказки отключены в настройках
  const ch=item&&item.kanji?String(item.kanji):'';
  if(!ch)return'';
  // Тумблер всегда виден: включает и выключает подсказки
  const btn=`<button class="hint-btn${on?' on':''}" data-a="${toggleAction}">${on?'Скрыть подсказки':'Показать подсказки'}</button>`;
  if(!on)return btn;
  const words=exampleWords(ch).slice(0,6);
  const rows=words.length
    ?`<div class="hint-row">${words.map(w=>`<div class="hint-chip"><span class="hint-word">${esc(w.kanji)}</span>${w.reading?`<span class="hint-read">kana: <b>${esc(w.reading)}</b></span>`:''}</div>`).join('')}</div>`
    :`<div class="hint-row"><div class="hint-empty">Нет слов с этим иероглифом в словаре</div></div>`;
  return btn+rows;
}

function buildStudyDone(){
  const r=S.studyResults||{know:0,learning:0,unknown:0};
  const total=r.know+r.learning+r.unknown;
  return`
    <div class="done">
      <div class="done-i">🎉</div>
      <h2>Сессия завершена!</h2>
      <p style="color:var(--t2);margin-top:6px;font-size:13px">Пройдено: ${total} карточек</p>
      <div class="res-grid">
        <div class="rc g"><div class="rn">${r.know}</div><div class="rl">Знаю</div></div>
        <div class="rc y"><div class="rn">${r.learning}</div><div class="rl">Учу</div></div>
        <div class="rc r"><div class="rn">${r.unknown}</div><div class="rl">Не знаю</div></div>
      </div>
      <div style="padding:0 16px">
        <div class="btn-row">
          <button class="btn btn-p" data-a="restart-study">🔄 Снова</button>
          <button class="btn btn-s" data-a="stop-study">Завершить</button>
        </div>
      </div>
    </div>`;
}

/* ── QUIZ ACTIVE ── */
function buildQuizActive(){
  const q=S.quizQ;if(!q)return'';
  if(q.multi)return buildMultiActive(q);
  if(q.compose)return buildComposeActive(q);
  if(q.pairs)return buildPairsActive(q);
  if(q.match)return buildMatchActive(q);
  if(q.verbs)return buildVerbActive(q);
  const mode=S.quizCfg.mode;
  const showChoice=mode==='choice4'||mode==='choice6'||(mode==='mix'&&!q.mixInput);
  const showInput=mode==='input'||(mode==='mix'&&q.mixInput);
  const optN=mode==='choice4'?4:6;

  const qCard=`
    <div class="quiz-q">
      ${buildCardVariant(q.word,q.qFields,S.quizCfg.type)}
    </div>`;

  let choiceHtml='';
  if(showChoice&&q.options){
    choiceHtml=`<div class="quiz-panel">
      <div class="quiz-panel-lbl">Выберите вариант:</div>
      <div class="quiz-opts">
      ${q.options.map((opt,i)=>{
        let cls='';
        if(S.quizDone)cls=i===q.correct?'ok':i===S.quizSel?'bad':'';
        else if(i===S.quizSel)cls='sel';
        const txt=q.aField==='kun_reading'?renderKun(opt):esc(opt);
        return`<button class="qopt ${cls}" ${S.quizDone?'disabled':''} data-a="quiz-ans:${i}">${txt}</button>`;
      }).join('')}
      </div>
    </div>`;
  }

  let inputHtml='';
  if(showInput){
    const isOk=S.quizDone?checkAns(S.quizInputVal,q.options[q.correct]):null;
    const iCls=S.quizDone?(isOk?'ok':'bad'):'';
    inputHtml=`
      <div class="quiz-panel">
        <div class="quiz-panel-lbl">Впишите вариант:</div>
        <input id="quiz-input" class="quiz-inp ${iCls}" type="text"
          placeholder="Ваш ответ..."
          value="${S.quizDone?esc(S.quizInputVal):''}"
          ${S.quizDone?'disabled':''}
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        ${S.quizDone?`<div class="quiz-result ${isOk?'ok':'bad'}">${isOk?'✓ Правильно!':'✗ Правильно: '+(q.aField==='kun_reading'?renderKun(q.options[q.correct]):esc(q.options[q.correct]))}</div>`:''}
      </div>`;
  }

  const nextBtn=S.quizDone
    ?`<button class="next-btn" data-a="next-q">Следующий →</button>`
    :(showInput?`<button class="next-btn" data-a="quiz-check">Проверить</button>`:'');

  const hintHtml=S.quizCfg.type==='kanji'?buildHintBlock(q.word,S.quizHint,'toggle-hint'):'';

  return`<div class="pg">${qScoreBar()}${qCard}${hintHtml}${choiceHtml}${inputHtml}${qActions}${nextBtn}</div>`;
}
/* ── #3 Мультиполевой рендер: группа вариантов/ввода на каждое поле ответа ── */
function buildMultiActive(q){
  const type=S.quizCfg.type;
  const qCard=`<div class="quiz-q">${buildCardVariant(q.word,q.qFields,type)}</div>`;
  const panels=q.groups.map((g,gi)=>{
    const lbl=fldShort(g.field,type);
    if(q.useInput){
      const val=(q.inputs&&q.inputs[gi])||'';
      const isOk=S.quizDone?checkAns(val,g.correct):null;
      const iCls=S.quizDone?(isOk?'ok':'bad'):'';
      const corr=g.field==='kun_reading'?renderKun(g.correct):esc(g.correct);
      return`<div class="quiz-panel">
        <div class="quiz-panel-lbl">${lbl}:</div>
        <input id="multi-input-${gi}" class="quiz-inp ${iCls}" type="text" placeholder="Ваш ответ..."
          value="${S.quizDone?esc(val):''}" ${S.quizDone?'disabled':''}
          autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false">
        ${S.quizDone&&!isOk?`<div class="quiz-result bad">✗ ${corr}</div>`:''}
      </div>`;
    }
    const sel=q.picks[gi];
    const opts=g.options.map((opt,i)=>{
      let cls='';
      if(S.quizDone)cls=i===g.correctIdx?'ok':(sel===i?'bad':'');
      else if(sel===i)cls='sel';
      const txt=g.field==='kun_reading'?renderKun(opt):esc(opt);
      const dis=(sel!=null||S.quizDone)?'disabled':'';
      return`<button class="qopt ${cls}" ${dis} data-a="multi-pick:${gi}:${i}">${txt}</button>`;
    }).join('');
    return`<div class="quiz-panel"><div class="quiz-panel-lbl">${lbl}:</div><div class="quiz-opts">${opts}</div></div>`;
  }).join('');
  const nextBtn=S.quizDone
    ?`<button class="next-btn" data-a="next-q">Следующий →</button>`
    :(q.useInput?`<button class="next-btn" data-a="multi-check">Проверить</button>`:'');
  const hintHtml=type==='kanji'?buildHintBlock(q.word,S.quizHint,'toggle-hint'):'';
  return`<div class="pg">${qScoreBar()}${qCard}${hintHtml}${panels}${qActions}${nextBtn}</div>`;
}
// Завершение мультиполевого вопроса: оценка по числу ошибок (как было в «Все три»)
function finishMulti(q){
  let wrong=0;
  q.groups.forEach((g,gi)=>{
    const ok=q.useInput?checkAns((q.inputs&&q.inputs[gi])||'',g.correct):(q.picks[gi]===g.correctIdx);
    if(!ok)wrong++;
  });
  const quality=wrong===0?5:wrong===1?3:1;
  smUpdate(pr(S.quizCfg.type),q.word.id,quality);
  if(wrong===0)S.quizScore.ok++;else S.quizScore.bad++;
  S.quizDone=true;save();
}

/* Общий score-bar (крестик / галочка / итого) */
function qScoreBar(){
  const{ok,bad}=S.quizScore;
  return`<div class="qscore">
    <div class="qbadge qbad"><svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 1l10 8M11 1L1 9" stroke="#ff4f4f" stroke-width="1.8" stroke-linecap="round"/></svg>${bad}</div>
    <div class="qbadge qok"><svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 5l4 4L13 1" stroke="#7aff78" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>${ok}</div>
    <div class="qbadge">итого ${ok+bad}</div>
  </div>`;
}
const qActions=`<div class="quiz-actions">
    <button class="qact-btn" data-a="stop-quiz">Стоп</button>
    <button class="qact-btn" data-a="skip-q">Пропустить</button>
  </div>`;

/* Финальный стейт: фуригана — чтение каной над каждым иероглифом слова */
function furiganaHtml(word){
  if(word.seg&&word.seg.length)
    return`<div class="furi">${word.seg.map(s=>`<ruby>${esc(s.c)}<rt>${esc(s.r)}</rt></ruby>`).join('')}</div>`;
  // нет посимвольной разбивки (дзюкудзикун) — слово целиком + полное чтение
  return`<div class="furi"><ruby>${esc(word.kanji)}<rt>${esc(word.reading)}</rt></ruby></div>`;
}
/* ── COMPOSE ACTIVE (Figma: Составить слова) ── */
function buildComposeActive(q){
  const cs=S.quizCfg.composeShow||{reading:true,meaning:false};
  const reverse=!!q.reverse,ultra=!!q.ultra;
  const built=q.picks.map(i=>q.options[i]);
  const kanaLine=q.word.reading?`<div class="cmp-line"><span class="lbl">kana:</span> <span class="val">${esc(q.word.reading)}</span></div>`:'';
  const meaningLine=q.word.meaning?`<div class="cmp-line"><span class="lbl">meaning:</span> <span class="val">${esc(String(q.word.meaning).split(/;/)[0])}</span></div>`:'';
  let canvasInner;
  if(S.quizDone){
    // Финал: фуригана над иероглифами + (при ошибке) правильный ответ
    const parts=[furiganaHtml(q.word)];
    if((cs.meaning||ultra)&&q.word.meaning)parts.push(meaningLine);
    if(!q.result){
      const corr=reverse?esc(q.word.reading):esc(q.word.kanji);
      parts.push(`<div class="cmp-correct">Правильно: <span>${corr}</span></div>`);
    }
    canvasInner=`<div class="cmp-canvas">${parts.join('')}</div>`;
  } else if(reverse){
    // Reverse: показываем кандзи-слово (+значение), собираем кану
    const slots=[];
    for(let i=0;i<q.target.length;i++)slots.push(built[i]!=null?`<span class="cmp-kana">${esc(built[i])}</span>`:`<span class="cmp-slot"></span>`);
    canvasInner=`<div class="cmp-canvas"><div class="cmp-word">${esc(q.word.kanji)}</div>${cs.meaning?meaningLine:''}<div class="cmp-build">${slots.join('')}</div></div>`;
  } else if(ultra){
    // Ultra: незнакомый кандзи (нет в импорте) стоит на месте; знакомые — слоты,
    // которые юзер подставляет из своих кандзи по значению.
    let ki=0;
    const cells=q.positions.map(pp=>{
      if(!pp.known)return`<span class="cmp-ch">${esc(pp.c)}</span>`; // учимый — показан
      const filled=built[ki++];
      return filled!=null?`<span class="cmp-ch">${esc(filled)}</span>`:`<span class="cmp-slot"></span>`;
    });
    canvasInner=`<div class="cmp-canvas"><div class="cmp-build">${cells.join('')}</div>${meaningLine}</div>`;
  } else {
    // Normal: собираем кандзи, кана/значение как подсказка
    const slots=[];
    for(let i=0;i<q.target.length;i++)slots.push(built[i]!=null?`<span class="cmp-ch">${esc(built[i])}</span>`:`<span class="cmp-slot"></span>`);
    const lines=[];
    if(cs.reading)lines.push(kanaLine);
    if(cs.meaning)lines.push(meaningLine);
    canvasInner=`<div class="cmp-canvas"><div class="cmp-build">${slots.join('')}</div>${lines.join('')}</div>`;
  }
  const canvasCls=S.quizDone?(q.result?' ok':' bad'):'';
  const canvas=`<div class="quiz-q${canvasCls}">${canvasInner}</div>`;
  // Свитчеры: в reverse «Кана» скрыта; в ultra свитчеров нет (значение показано всегда)
  const sw=(k,label)=>`<button class="cmp-sw${cs[k]?' on':''}" data-a="compose-switch:${k}">${cs[k]?'<span class="cmp-arrow">→</span>':''}${label}</button>`;
  const switches=ultra?'':`<div class="cmp-switch">${reverse?'':sw('reading','Кана')}${sw('meaning','Значение')}</div>`;
  // Варианты: кандзи (normal/ultra) или части каны (reverse). В ultra — только знакомые кандзи.
  const opts=q.options.map((o,i)=>{
    const picked=q.picks.includes(i);
    let cls='';
    if(S.quizDone)cls=picked?(q.result?'ok':'bad'):'';
    else if(picked)cls='sel';
    return`<button class="qopt ${reverse?'':'kanji '}${cls}" ${S.quizDone?'disabled':''} data-a="compose-pick:${i}">${esc(o)}</button>`;
  }).join('');
  const panel=`<div class="quiz-panel"><div class="quiz-panel-lbl">Выберите вариант:</div><div class="quiz-opts">${opts}</div></div>`;
  const nextBtn=S.quizDone?`<button class="next-btn" data-a="next-q">Следующий →</button>`:'';
  return`<div class="pg">${qScoreBar()}${canvas}${switches}${panel}${qActions}${nextBtn}</div>`;
}

/* ── PAIRS ACTIVE (Figma: Выбери пару) ── */
function buildPairsActive(q){
  const counter=`<div class="pair-count"><div class="pair-count-pill">${q.found.length}/${q.total}</div></div>`;
  // Канвас
  let canvasInner,canvasCls='';
  const slot=(o,withMeaning)=>`<div class="pair-slot"><div class="pk">${esc(o.kanji)}</div>${withMeaning&&o.meaning?`<div class="pm">meaning: <b>${esc(o.meaning)}</b></div>`:''}</div>`;
  if(q.result){
    const a=q.options[q.result.a],b=q.options[q.result.b];
    canvasCls=q.result.ok?' ok':' bad';
    const readings=q.result.ok
      ?`<div class="pair-on"><span class="lbl">on:</span> <span class="val">${esc(a.onRaw)}</span></div>`
      :`<div class="pair-on"><span class="val">${esc(a.onRaw)}</span> <span class="lbl">≠</span> <span class="val">${esc(b.onRaw)}</span></div>`;
    canvasInner=`<div class="pair-canvas"><div class="pair-slots">${slot(a,q.result.ok)}${slot(b,q.result.ok)}</div>${readings}</div>`;
  } else if(q.firstPick!=null){
    const a=q.options[q.firstPick];
    canvasInner=`<div class="pair-canvas"><div class="pair-slots">${slot(a,false)}</div></div>`;
  } else {
    canvasInner=`<div class="pair-canvas"><div class="pair-hint">Выберите два иероглифа с одинаковым он-чтением</div></div>`;
  }
  const canvas=`<div class="quiz-q${canvasCls}">${canvasInner}</div>`;
  // Варианты
  const opts=q.options.map((o,i)=>{
    const found=q.found.some(f=>f.includes(i));
    const sel=q.firstPick===i;
    let cls=found?'ok':sel?'sel':'';
    const label=found?`${esc(o.kanji)}<span class="qopt-on">${esc(o.onRaw)}</span>`:esc(o.kanji);
    return`<button class="qopt kanji ${cls}" ${found||S.quizDone?'disabled':''} data-a="pairs-pick:${i}">${label}</button>`;
  }).join('');
  const panel=`<div class="quiz-panel"><div class="quiz-panel-lbl">Выберите вариант:</div><div class="quiz-opts">${opts}</div></div>`;
  const nextBtn=S.quizDone?`<button class="next-btn" data-a="next-q">Следующий →</button>`:'';
  return`<div class="pg">${qScoreBar()}${counter}${canvas}${panel}${qActions}${nextBtn}</div>`;
}

/* ── MATCH PAIRS ACTIVE (сопоставление 6 пар) ──
 * Тап по плитке слева и по плитке справа; совпало — пара гаснет зелёным. */
function buildMatchActive(q){
  const total=q.items.length;
  const counter=`<div class="pair-count"><div class="pair-count-pill">${q.solved.length}/${total}</div></div>`;
  const tile=(side,pid)=>{
    const done=q.solved.includes(pid);
    const sel=(side==='L'?q.selL:q.selR)===pid;
    const bad=!!q.bad&&(side==='L'?q.bad.l:q.bad.r)===pid;
    const cls=done?'done':bad?'bad':sel?'sel':'';
    return`<button class="mtile ${cls}" ${done||S.quizDone?'disabled':''} data-a="match-pick:${side}:${pid}">${side==='L'?q.items[pid].l.html:q.items[pid].r.html}</button>`;
  };
  const hint=`<div class="mt-hint">${S.quizDone?'Все пары собраны':'Выберите по плитке из каждой колонки'}</div>`;
  const cols=`<div class="mt-grid">
    <div class="mt-col">${q.colL.map(i=>tile('L',i)).join('')}</div>
    <div class="mt-col">${q.colR.map(i=>tile('R',i)).join('')}</div>
  </div>`;
  const nextBtn=S.quizDone?`<button class="next-btn" data-a="next-q">Следующий →</button>`:'';
  return`<div class="pg">${qScoreBar()}${counter}${hint}${cols}${qActions}${nextBtn}</div>`;
}

/* ── VERB FORMS ACTIVE (Figma: Спряжение глаголов) ──
 * Задание (русское, из флагов) + основа глагола; собрать нужную форму из окончаний. */
// фуригана над основой: ruby на весь кусок основы (корректно и для составных глаголов
// типа 役に立つ, где между кандзи есть кана). kuru/suru пропускаем — у них меняется чтение.
function vbFuriStem(v,stemJp){
  const chars=[...stemJp];
  if(!chars.some(isKanjiChar)||v.t==='kuru'||v.t==='suru')return`<span class="vb-base">${esc(stemJp)}</span>`;
  const rr=[...v.r],okLen=[...v.d].length-chars.length;   // окуригана за пределами основы
  const read=okLen>=0?rr.slice(0,rr.length-okLen).join(''):'';
  if(!read)return`<span class="vb-base">${esc(stemJp)}</span>`;
  return`<span class="vb-base"><ruby>${esc(stemJp)}<rt>${esc(read)}</rt></ruby></span>`;
}
function buildVerbActive(q){
  const filled=q.picks.map(i=>q.options[i]);   // выбранные окончания по порядку слотов
  const taskLine=`<div class="vb-task">${esc(q.task)}</div>`;
  const meaningLine=`<div class="cmp-line"><span class="lbl">${esc(q.verb.d)}</span> <span class="val">${esc(q.verb.m)}</span></div>`;
  // подсказка грамматики (Mode A): какую конструкцию собирать. В Mode B скрыта — только смысл.
  const gramLine=q.modeB?'':`<div class="vb-gram">${esc(q.rule.gl||q.rule.nm)}</div>`;
  let slots;
  if(q.modeB){
    // переменная длина: показываем собранные чипы + один пустой слот, пока есть куда добавлять
    const chips=filled.map(j=>`<span class="vb-suf${S.quizDone?(q.result?' ok':' bad'):''}">${esc(j)}</span>`).join('');
    const tail=(!S.quizDone&&q.picks.length<q.maxLen)?`<span class="vb-slot"></span>`:'';
    slots=chips+tail;
  }else{
    slots=q.target.map((_,i)=>filled[i]!=null
      ?`<span class="vb-suf${S.quizDone?(q.result?' ok':' bad'):''}">${esc(filled[i])}</span>`
      :`<span class="vb-slot"></span>`).join('');
  }
  const wordHtml=`<div class="vb-word">${vbFuriStem(q.verb,q.stem.jp)}${slots}</div>`;
  let correctLine='';
  if(S.quizDone&&!q.result){
    const ans=q.modeB?(q.stem.jp+q.accepted[0].seq.join('')):(q.stem.jp+q.target.join(''));
    correctLine=`<div class="cmp-correct">Правильно: <span>${esc(ans)}</span></div>`;
  }
  const canvasCls=S.quizDone?(q.result?' ok':' bad'):'';
  const canvas=`<div class="quiz-q${canvasCls}"><div class="cmp-canvas">${taskLine}${meaningLine}${gramLine}${wordHtml}${correctLine}</div></div>`;
  // Банк окончаний — hug-content чипы (как в дуалинго)
  const opts=q.options.map((o,i)=>{
    const at=q.picks.indexOf(i);let cls='';
    if(S.quizDone){ if(at>=0)cls=q.modeB?(q.result?'ok':'bad'):((o===q.target[at])?'ok':'bad'); }
    else if(at>=0)cls='on';
    return`<button class="qchip ${cls}" ${S.quizDone?'disabled':''} data-a="verb-pick:${i}">${esc(o)}</button>`;
  }).join('');
  const bankLbl=q.modeB?'Соберите форму — способ выберите сами:':'Соберите нужную форму глагола:';
  const panel=`<div class="quiz-panel"><div class="quiz-panel-lbl">${bankLbl}</div><div class="quiz-bank">${opts}</div></div>`;
  const checkBtn=(q.modeB&&!S.quizDone&&q.picks.length)?`<button class="next-btn" data-a="verb-check">Проверить</button>`:'';
  const nextBtn=S.quizDone?`<button class="next-btn" data-a="next-q">Следующий →</button>`:'';
  return`<div class="pg">${qScoreBar()}${canvas}${panel}${checkBtn}${qActions}${nextBtn}</div>`;
}

/* ── WORDS ── */
function wordsFolderState(){
  const folders=foldersOf(S.wordsTab);
  if(S.wordsFolder!=='all'&&!folders.includes(S.wordsFolder))S.wordsFolder='all';
  return{folders,wf:S.wordsFolder};
}
function buildWords(){
  const type=S.wordsTab;
  const{folders,wf}=wordsFolderState();
  const seg=`<div class="nseg" style="padding-top:24px">
      <button class="nseg-btn${type==='words'?' on':''}" data-a="words-tab:words">Слова</button>
      <button class="nseg-btn${type==='kanji'?' on':''}" data-a="words-tab:kanji">Кандзи</button>
    </div>`;
  const importBtn=`<button class="nimport" style="margin:0 16px 8px;grid-column:auto" data-a="words-import"><img src="${ASSETS.cImport}" alt="">Импортировать</button>`;
  const search=`<div class="dsearch">
      <img class="dsearch-ic" src="${ASSETS.cSearch}" alt="">
      <input id="words-search" class="dsearch-inp" type="text" placeholder="Поиск..." value="${esc(S.wordsSearch)}" autocomplete="off" autocorrect="off">
    </div>`;
  const folderTabs=folders.length>1?`<div class="wfilter" style="overflow-x:auto;flex-wrap:nowrap">
      <button class="wf-tab${wf==='all'?' on':''}" style="flex:none" data-a="words-folder:all">Все папки</button>
      ${folders.map(f=>`<button class="wf-tab${wf===f?' on':''}" style="flex:none" data-a="words-folder:${esc(f)}">${esc(f)}</button>`).join('')}
    </div>`:'';
  return`
    ${seg}
    ${importBtn}
    ${search}
    ${folderTabs}
    <div id="words-results">${buildWordsResults()}</div>`;
}
// Список отдельно от поля поиска: при вводе обновляется только он (фокус и IME не сбрасываются)
function buildWordsResults(){
  const type=S.wordsTab,d=ds(type),p=pr(type);
  const{folders,wf}=wordsFolderState();
  const base=wf==='all'?d:d.filter(w=>(w.folder||'Общая')===wf);
  const q=S.wordsSearch.toLowerCase();
  const list=q
    ?base.filter(w=>[w.kanji,w.reading,w.on_reading,w.kun_reading,w.meaning,w.translation]
        .some(v=>String(v||'').toLowerCase().includes(q)))
    :base;
  const showFolderTag=wf==='all'&&folders.length>1;
  const checkSvg=`<svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 5l4 4L13 1" stroke="#7aff78" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const item=w=>{
    const s=statusOf(p,w.id);
    const st=s==='know'?`<span class="ditem-st know">${checkSvg}</span>`:`<span class="ditem-st ${s}"><span class="dot"></span></span>`;
    const ft=showFolderTag&&(w.folder||'Общая')!=='Общая'?`<div class="dfolder">📁 ${esc(w.folder)}</div>`:'';
    let reading;
    if(type==='kanji'){
      const parts=[];if(w.on_reading)parts.push('он '+esc(w.on_reading));if(w.kun_reading)parts.push('кун '+esc(w.kun_reading));
      reading=parts.join(' · ');
    }else reading=esc(w.reading||'');
    const meaning=esc(w.meaning||w.translation||'');
    return`<div class="ditem">
        <span class="ditem-k">${esc(w.kanji)}</span>
        <span class="ditem-info">${reading?`<span class="ditem-r">${reading}</span>`:''}${meaning?`<span class="ditem-m">${meaning}</span>`:''}${ft}</span>
        ${st}
      </div>`;
  };
  if(!d.length)return`<div class="empty"><div class="ei">${type==='kanji'?'㊙️':'📖'}</div><div class="et">Нет ${type==='kanji'?'кандзи':'слов'}</div><div class="eb">Импортируйте CSV/TSV файл</div><button class="btn btn-p" style="margin:0 16px;width:calc(100% - 32px)" data-a="words-import">Импортировать</button></div>`;
  if(!base.length)return`<div class="empty"><div class="ei">📁</div><div class="et">Папка пуста</div><div class="eb">В папке «${esc(wf)}» пока нет ${type==='kanji'?'кандзи':'слов'}</div></div>`;
  const shown=list.slice(0,S.wordsLimit);
  const more=list.length>shown.length?`<button class="btn btn-s" style="margin:8px 16px;width:calc(100% - 32px)" data-a="words-more">Показать ещё (${list.length-shown.length})</button>`:'';
  return`<div class="dlist">${shown.map(item).join('')}</div>${more}
    ${list.length!==base.length?`<div style="font-size:12px;color:var(--al);text-align:center;padding:6px">Найдено: ${list.length} из ${base.length}</div>`:''}`;
}

/* ── SETTINGS ── */
function buildSettings(){
  const total=S.words.length,kt=S.kanjiItems.length;
  const know=S.words.filter(w=>statusOf(S.progress,w.id)==='know').length;
  const kknow=S.kanjiItems.filter(w=>statusOf(S.kanjiProgress,w.id)==='know').length;
  const cBlock=(key,lbl,isRed)=>S.confirmPending===key
    ?`<div class="confirm-row">
        <span class="confirm-text" style="color:${isRed?'var(--r)':'var(--y)'}">${lbl}?</span>
        <button class="confirm-no" data-a="confirm-no">Нет</button>
        <button class="confirm-yes" data-a="confirm-yes">Да</button>
      </div>`
    :`<div class="srow" data-a="${key}">
        <span class="srow-l" style="color:${isRed?'var(--r)':'var(--y)'}">${lbl}</span>
        <span class="srow-r">›</span>
      </div>`;
  return`
    <div class="phdr"><span class="phdr-title">Настройки</span></div>
    <div style="margin-bottom:6px;padding:0 16px"><div class="sset-lbl">Статистика</div></div>
    <div class="sset">
      <div class="srow"><span class="srow-l">Слов всего</span><span class="srow-r">${total}</span></div>
      <div class="srow"><span class="srow-l">Слов изучено</span><span class="srow-r" style="color:var(--g)">${know}</span></div>
      <div class="srow"><span class="srow-l">Кандзи всего</span><span class="srow-r">${kt}</span></div>
      <div class="srow"><span class="srow-l">Кандзи изучено</span><span class="srow-r" style="color:var(--g)">${kknow}</span></div>
    </div>
    <div style="margin-bottom:6px;padding:0 16px"><div class="sset-lbl">Отображение слов</div></div>
    <div class="cfg-card" style="margin-bottom:12px">${chips([{v:'full',l:'Целиком'},{v:'kana',l:'Только кана'}],S.wordDisplay,'word-display')}</div>
    <div style="margin-bottom:6px;padding:0 16px"><div class="sset-lbl">Подсказки кандзи</div></div>
    <div class="cfg-card" style="margin-bottom:12px">${chips([{v:'on',l:'Включены'},{v:'off',l:'Выключены'}],S.hintsEnabled?'on':'off','hints-toggle')}</div>
    <div style="margin-bottom:6px;padding:0 16px"><div class="sset-lbl">Данные</div></div>
    <div class="sset">
      <div class="srow" data-a="go-import-home"><span class="srow-l">Импортировать</span><span class="srow-r">›</span></div>
      ${S.words.length?`<div class="srow" data-a="download-csv:words"><span class="srow-l">Скачать CSV слов</span><span class="srow-r">↓</span></div>`:''}
      ${S.kanjiItems.length?`<div class="srow" data-a="download-csv:kanji"><span class="srow-l">Скачать CSV кандзи</span><span class="srow-r">↓</span></div>`:''}
      ${cBlock('reset-progress','Сбросить прогресс',false)}
      ${cBlock('clear-words','Удалить все данные',true)}
    </div>
    <div style="margin:0 16px"><div class="sset-lbl">Формат CSV</div></div>
    <div class="cfg-card mono" style="margin-bottom:0">
      Слова: kanji, reading, translation<br>
      Кандзи: kanji, on_reading, kun_reading, meaning<br>
      Разделитель: запятая, TAB, точка с запятой
    </div>`;
}

/* ── IMPORT ── */
function buildImport(){
  return`
    <div class="phdr">
      <button class="phdr-back" data-a="back-import">← Назад</button>
      <span class="phdr-title">Импорт</span>
    </div>
    ${S.importStep==='map'&&S.importRaw?buildColMap()
    :S.importStep==='preview'&&S.importPreview?buildUploadZone()+buildPreview()
    :buildTypeSelect()+buildUploadZone()}`;
}
function buildTypeSelect(){
  const nf=S.importNewFolder;
  const folderChooser=`<div class="chips">
      ${allFolders().map(f=>`<button class="chip${!nf&&S.importFolder===f?' on':''}" data-a="import-folder:${esc(f)}">${esc(f)}</button>`).join('')}
      <button class="chip${nf?' on':''}" data-a="import-folder-new">＋ Новая</button>
    </div>
    ${nf?`<input id="import-folder-name" class="quiz-inp" style="margin-top:10px" type="text" placeholder="Название новой папки" value="${esc(S.importNewName)}" autocomplete="off" autocorrect="off" autocapitalize="off">`:''}`;
  return`
    ${cfgCard('Что импортируем',chips([{v:'words',l:'Слова'},{v:'kanji',l:'Кандзи'}],S.importType,'import-type'))}
    ${cfgCard('Куда добавить',folderChooser)}`;
}
function buildUploadZone(){
  return`
    <div class="dropzone" id="dropzone">
      <div class="dz-icon">📂</div>
      <div class="dz-text">Нажмите или перетащите файл</div>
      <div class="dz-hint">CSV и TSV — с заголовками и без</div>
      <!-- Android document providers may report CSV as text/plain, octet-stream or no MIME. Let the native picker show all files; validate the content in parseFile. -->
      <input type="file" id="file-in" class="csv-file-input" aria-label="Выбрать CSV или TSV для импорта">
    </div>
    ${S.importReading?'<div class="dz-hint" role="status" style="margin:0 16px 10px">Читаем файл…</div>':''}
    ${S.importErr?`<div class="err-box">⚠️ ${esc(S.importErr)}</div>`:''}`;
}
function buildColMap(){
  const{rawRows,colCount}=S.importRaw;
  // Тип можно менять прямо здесь — dropdowns обновятся при ре-рендере
  const typeRow=buildTypeSelect();
  const fk=S.importType==='kanji'?KF:WF;
  const heads=Array.from({length:colCount},(_,i)=>{
    const cur=S.importMapping[i]||'';
    const opts=[`<option value="">— пропустить —</option>`,...fk.map(k=>`<option value="${k}"${cur===k?' selected':''}>${fldLabel(k,S.importType)}</option>`)].join('');
    return`<th style="min-width:120px;padding:6px 8px"><select id="map-col-${i}" style="width:100%;font-size:12px;background:var(--bg);color:var(--t);border:1px solid var(--c2);border-radius:6px;padding:4px 6px">${opts}</select></th>`;
  }).join('');
  const drows=rawRows.slice(0,5).map(row=>`<tr>${Array.from({length:colCount},(_,i)=>`<td title="${esc(row[i]||'')}">${esc(row[i]||'')}</td>`).join('')}</tr>`).join('');
  return`
    ${typeRow}
    <div class="cfg-card">
      <div class="cfg-lbl">Назначьте колонки</div>
      <div class="tbl-wrap" style="margin:0 0 10px">
        <table><thead><tr>${heads}</tr></thead><tbody>${drows}</tbody></table>
      </div>
      ${rawRows.length>5?`<div style="font-size:12px;color:var(--al);margin-bottom:8px">...всего ${rawRows.length} строк</div>`:''}
    </div>
    <div style="display:flex;gap:8px;padding:0 16px">
      <button class="btn btn-s" data-a="back-import">← Назад</button>
      <button class="btn btn-p" data-a="apply-map">Применить →</button>
    </div>`;
}
function buildPreview(){
  const{words,headers}=S.importPreview;
  const show=words.slice(0,6);
  return`
    <div class="cfg-card">
      <div class="cfg-lbl">Предпросмотр — ${words.length} записей</div>
      <div style="font-size:12px;color:var(--al);margin-bottom:8px">Папка: ${esc(importTargetFolder())} · дубли (слово + чтение) пропускаются</div>
      <div class="tbl-wrap" style="margin:0 0 10px">
        <table><thead><tr>${headers.map(h=>`<th>${fldShort(h,S.importType)}</th>`).join('')}</tr></thead>
        <tbody>${show.map(w=>`<tr>${headers.map(h=>`<td>${esc(w[h]||'')}</td>`).join('')}</tr>`).join('')}</tbody></table>
      </div>
      ${words.length>6?`<div style="font-size:12px;color:var(--al);margin-bottom:8px">...и ещё ${words.length-6}</div>`:''}
    </div>
    <div style="display:flex;gap:8px;padding:0 16px">
      <button class="btn btn-s" data-a="cancel-import">← Назад</button>
      <button class="btn btn-p" data-a="confirm-import">✓ Импортировать ${words.length}</button>
    </div>`;
}
function noData(type){
  return`<div class="empty"><div class="ei">${type==='kanji'?'㊙️':'📖'}</div><div class="et">Нет ${type==='kanji'?'кандзи':'слов'}</div><div class="eb">Сначала импортируйте данные</div><button class="btn btn-p" style="margin:0 16px;width:calc(100% - 32px)" data-a="go-import-home">Импорт</button></div>`;
}

let _tt;
function toast(msg){
  const el=document.getElementById('toast');
  el.textContent=msg;el.classList.add('show');
  clearTimeout(_tt);_tt=setTimeout(()=>el.classList.remove('show'),2200);
}
