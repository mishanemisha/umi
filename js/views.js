'use strict';
// Рендер экранов (строки HTML)
/* ── Card Variant Builder (Figma «Обновление дизайна»: Варианты карточек 155:3624) ── */
// Крупный знак — 90px; длинные слова уменьшаются, чтобы влезть в канвас
function kjSize(text,max=90,width=320){
  const n=[...String(text||'')].length||1;
  return Math.max(32,Math.min(max,Math.floor(width/n)));
}
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
/* Значения в вариантах: только первое (самое частотное), остальные — по лонгтапу в бабле.
 * Значок «!» после первого значения показывает, что есть ещё. */
function senses(v){const s=String(v||'');return s.includes(';')?s.split(';').map(x=>x.trim()).filter(Boolean):mSplit(s);}
function moreAttr(v){const all=senses(v);return all.length>1?` data-more="${esc(all.join('\n'))}"`:'';}
function firstSense(v){
  const all=senses(v);if(all.length<2)return esc(String(v||'').trim());
  return`${esc(all[0])}<i class="more-i" aria-label="ещё значения">!</i>`;
}
function cvMeaningsBlock(word,showFields,compact){
  const has=f=>showFields.includes(f)&&word[f];
  const g=[];
  ['meaning','translation'].forEach(f=>{
    if(has(f))word[f].split(/;/).forEach(s=>{const t=s.trim();if(t)g.push(t);});
  });
  if(!g.length)return'';
  if(compact){
    // квиз: одно значение крупно; остальные — по лонгтапу
    const full=g.join('; ');
    return`<div class="cv-meanings one"${moreAttr(full)}><div class="cv-mn"><span class="cv-mt">${firstSense(full)}</span></div></div>`;
  }
  return`<div class="cv-meanings">${g.slice(0,7).map((s,i)=>`<div class="cv-mn"><span class="cv-mi">${i+1}.</span><span class="cv-mt">${esc(s)}</span></div>`).join('')}</div>`;
}
function buildCardVariant(word,showFields,dataType,compact){
  if(!word||!showFields||!showFields.length)return'<div style="color:var(--t2);text-align:center">—</div>';
  const has=f=>showFields.includes(f)&&word[f];
  const isKanjiType=dataType==='kanji';
  const kanaOnly=dataType==='words'&&S.wordDisplay==='kana'&&!!word.reading;
  const mHtml=cvMeaningsBlock(word,showFields,compact);

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
    if(has('reading')&&!(kanaOnly&&has('kanji')))reads.push(`<div class="cv-kana"><span class="cv-rl">kana:</span><span class="cv-rv">${esc(word.reading)}</span></div>`);
  }
  // кандзи: чтения столбиком справа от знака; слово: кана строкой под ним
  const readsHtml=reads.length?(isKanjiType?`<div class="cv-readings">${reads.join('')}</div>`:reads.join('')):'';

  const mainTxt=kanaOnly?word.reading:word.kanji;
  const mainHtml=has('kanji')?`<div class="cv-main" style="font-size:${isKanjiType?90:kjSize(mainTxt)}px">${esc(mainTxt)}</div>`:'';
  let topHtml='';
  if(mainHtml||readsHtml){
    topHtml=`<div class="cv-top${isKanjiType?'':' col'}">${mainHtml}${readsHtml}</div>`;
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

/* ── Отрисовка ──
 * Экраны тренировки обновляются точечно (morph): элементы, которые не изменились, остаются на месте,
 * поэтому канвас не мигает, а анимации (переворот карточки, шторки) идут плавно. Остальные экраны —
 * целиком через innerHTML: там к элементам привязаны обработчики, которые ставятся заново. */
let _morphed=false;
function render(){
  const app=document.getElementById('app'),html=buildApp(),sess=inSession();
  if(sess&&_morphed&&app.firstChild&&typeof document.createElement==='function'){
    const before=new Map();
    app.querySelectorAll(DRAWERS).forEach(e=>before.set(e,e.offsetHeight));
    const added=morphInto(app,html);
    animateDrawers(app,before,added);
  }else app.innerHTML=html;
  _morphed=sess;
  bindAll();if(practiceAvailable)uBind();syncBackButton();
}
// Шторки под канвасом: подсказки и объяснение ИИ. Раскрываются и меняют высоту плавно.
const DRAWERS='.cv-drop,.ai-drawer';
const EASE_OUT='cubic-bezier(.22,1,.36,1)';
const reducedMotion=()=>typeof matchMedia==='function'&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function animateDrawers(root,before,added){
  if(reducedMotion())return;
  root.querySelectorAll(DRAWERS).forEach(el=>{
    if(!el.animate)return;
    const to=el.offsetHeight,from=added.includes(el)?21:before.get(el);   // 21px — часть, спрятанная под канвасом
    if(from==null||Math.abs(from-to)<2)return;
    el.style.overflow='hidden';
    const an=el.animate([{height:from+'px'},{height:to+'px'}],{duration:added.includes(el)?420:300,easing:EASE_OUT});
    if(added.includes(el))el.firstElementChild?.animate?.([{opacity:0,transform:'translateY(-10px)'},{opacity:1,transform:'none'}],{duration:360,delay:60,easing:EASE_OUT,fill:'backwards'});
    an.onfinish=an.oncancel=()=>{el.style.overflow='';};
  });
}
// Сворачивает шторку и затем выполняет done (перерисовку без неё). false — шторки нет.
function collapseDrawer(sel,done){
  const el=typeof document.querySelector==='function'&&document.querySelector(sel);
  if(!el||!el.animate||reducedMotion())return false;
  el.style.overflow='hidden';
  el.animate([{height:el.offsetHeight+'px',opacity:1},{height:'21px',opacity:.4}],{duration:260,easing:'cubic-bezier(.4,0,.2,1)'}).onfinish=done;
  return true;
}
// Точечное обновление: дети root приводятся к разметке html. Совпадающие узлы сохраняются
// (по data-key/id, иначе по тегу и первому классу); возвращает новые элементы.
function morphInto(root,html){
  const t=document.createElement('template');t.innerHTML=html;
  const added=[];
  morphChildren(root,t.content,added);
  return added;
}
function mKey(n){return n.nodeType===1?(n.getAttribute('data-key')||n.id||null):null;}
function mKind(n){return n.nodeName+(n.nodeType===1?'.'+(n.classList[0]||''):'');}
function morphChildren(from,to,added){
  const olds=[...from.childNodes],used=new Set(),keyed=new Map();
  olds.forEach(o=>{const k=mKey(o);if(k)keyed.set(k,o);});
  let cursor=0,ref=from.firstChild;
  for(const n of[...to.childNodes]){
    const k=mKey(n);let m=null;
    if(k){m=keyed.get(k);if(m&&(used.has(m)||mKind(m)!==mKind(n)))m=null;}
    else for(let i=cursor;i<olds.length;i++){const o=olds[i];if(!used.has(o)&&!mKey(o)&&mKind(o)===mKind(n)){m=o;cursor=i+1;break;}}
    if(m){
      used.add(m);morphNode(m,n,added);
      if(m!==ref)from.insertBefore(m,ref);else ref=ref.nextSibling;
    }else{
      from.insertBefore(n,ref);
      if(n.nodeType===1)added.push(n);
    }
  }
  olds.forEach(o=>{if(!used.has(o))o.remove();});
}
function morphNode(o,n,added){
  if(o.nodeType!==1){if(o.nodeValue!==n.nodeValue)o.nodeValue=n.nodeValue;return;}
  for(const a of[...o.attributes])if(!n.hasAttribute(a.name))o.removeAttribute(a.name);
  for(const a of[...n.attributes])if(o.getAttribute(a.name)!==a.value)o.setAttribute(a.name,a.value);
  // введённый текст не затираем, пока поле в фокусе; иначе — значение из разметки
  if(o.tagName==='INPUT'&&o.type!=='file'&&document.activeElement!==o){const v=n.getAttribute('value')||'';if(o.value!==v)o.value=v;}
  morphChildren(o,n,added);
}
// Куда ведёт «Назад» на текущем экране (null — корневой экран вкладки)
function backAction(){
  if(S.ai&&S.ai.open)return'ai-close';
  if(S.screen==='import')return'back-import';
  if(S.studyQueue.length||S.studyResults)return'stop-study';
  if(S.quizQ||S.quizResults)return'stop-quiz';
  if(S.cfgScreen)return'close-cfg';
  if(S.tab==='words'&&S.selecting)return S.selSheet?'sel-sheet-close':'sel-cancel';
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
  if(S.studyResults&&!S.cfgScreen)return buildStudyDone()+nav();
  if(S.quizQ)return buildQuizActive()+nav();
  if(S.quizResults)return buildQuizDone()+nav();
  if(S.cfgScreen)return buildCfgScreen()+nav();
  switch(S.tab){
    case'home':    return buildHome()+nav();
    case'words':   return buildWords()+nav();
    case'practice':return (practiceAvailable?buildPractice():`<main class="up-page"><h1>Практика</h1><p class="up-sub">Не удалось загрузить учебную базу. Прогресс сохранён на устройстве. Обновите страницу, чтобы повторить загрузку.</p><button class="up-btn primary" onclick="location.reload()">Повторить загрузку</button></main>`)+nav();
    case'settings':return buildSettings()+nav();
  }
  return buildHome()+nav();
}

/* ── NAV (Figma «Обновление дизайна»: плавающий таб «liquid glass») ── */
const TABS=[
  {id:'home',    lbl:'Главная'  },
  {id:'words',   lbl:'Словарь'  },
  {id:'practice',lbl:'Практика' },
  {id:'settings',lbl:'Настройки'},
];
// Таббар схлопывается (без подписей, меньше и ниже) во время задания и при прокрутке вниз
function inSession(){return!!(S.quizQ||(S.studyQueue.length&&!S.studyResults));}
function navMini(){return inSession()||S.navMini;}
function nav(){
  const cur=S.cfgScreen&&S.quizCfg.mode!=='verbs'?'home':S.tab; // формы глаголов открываются из практики
  return`<nav class="bnav${navMini()?' mini':''}"><div class="bnav-glass">${TABS.map(t=>{
    const active=cur===t.id;
    return`<button class="bnav-btn${active?' active':''}" data-a="tab:${t.id}" data-tab="${t.id}" aria-label="${t.lbl}"${active?' aria-current="page"':''}>
      <span class="bnav-icon">${TAB_SVG[t.id]}</span>
      <span class="bnav-lbl">${t.lbl}</span>
    </button>`;}).join('')}</div></nav>`;
}

/* ── HOME (Figma «Обновление дизайна» 155:2949) ──
 * Карточки режимов раскрываются на месте: настройки внутри карточки, «Старт» внизу. */
const HOME_MODES={
  'cards':       {title:'Карточки',      desc:'Базовый квизлет на повторение при повороте карточки'},
  'quiz':        {title:'Квиз',          desc:'Ответы на вопросы и выбор правильного варианта'},
  'quiz-compose':{title:'Собрать слово', desc:'Соберите слово из иероглифов по чтению и значению'},
  'quiz-pairs':  {title:'Найти пару',    desc:'Найдите два иероглифа с одинаковым он-чтением'},
  'quiz-match':  {title:'Сопоставь пары',desc:'Соедините плитки из двух колонок'},
};
// Векторная иконка режима из плашек MODE_ICONS (чёткая на любом экране)
function modeIcon(key){
  const ic=MODE_ICONS[key];if(!ic)return'';
  return`<span class="micon" style="width:${ic.w}px;height:${ic.h}px" aria-hidden="true">${ic.r.map(([x,y,cw,ch,rw,rh,c,rot,sk,sx,sy])=>
    `<i style="left:${x}px;top:${y}px;width:${cw}px;height:${ch}px"><b style="width:${rw}px;height:${rh}px;background:${c};transform:rotate(${rot}deg)${sx!=null?` scale(${sx},${sy})`:''} skewX(${sk}deg)"></b></i>`).join('')}</span>`;
}
function homeModes(type){
  return type==='kanji'?['cards','quiz','quiz-compose','quiz-pairs','quiz-match']:['cards','quiz','quiz-match'];
}
function buildHome(){
  const type=S.homeTab,d=ds(type),p=pr(type);
  const total=d.length,know=d.filter(w=>statusOf(p,w.id)==='know').length;
  const learning=d.filter(w=>statusOf(p,w.id)==='learning').length,unk=total-know-learning;
  const pct=total?Math.round(know/total*100):0;
  const anim=S.homeAnim;S.homeAnim=null;   // анимация раскрытия — только в первом рендере
  const cards=homeModes(type).map(k=>modeCard(k,anim===k)).join('');
  return`<div class="home">
    <div class="hlogo"><img src="${ASSETS.logo}" alt="日本語"></div>
    <div class="hsect">
      <div class="hseg">
        <button class="hseg-btn${type==='words'?' on':''}" data-a="home-tab:words">слова</button>
        <button class="hseg-btn${type==='kanji'?' on':''}" data-a="home-tab:kanji">кандзи</button>
      </div>
      <div class="hstats">
        <div class="hstats-row">
          <div class="hstat g"><div class="n">${know}</div><div class="l">Знаю</div></div>
          <i class="hstat-sep"></i>
          <div class="hstat y"><div class="n">${learning}</div><div class="l">Учу</div></div>
          <i class="hstat-sep"></i>
          <div class="hstat r"><div class="n">${unk}</div><div class="l">Не знаю</div></div>
        </div>
        <div class="hprog"><i style="width:${pct}%"></i></div>
        <div class="hprog-info"><span>${pct}%</span><span>${know} из ${total} изучено</span></div>
      </div>
    </div>
    ${cards}
  </div>`;
}
function modeCard(key,anim){
  const m=HOME_MODES[key],open=S.homeOpen===key;
  const hd=`<button class="mcard-hd" data-a="home-open:${key}" aria-expanded="${open}">
      <span class="mcard-txt"><span class="mcard-t">${m.title}</span><span class="mcard-d">${m.desc}</span></span>
      <span class="mcard-ic">${modeIcon(key)}</span>
    </button>`;
  return`<section class="mcard${open?' open':''}${anim?' anim':''}">${hd}${open?`<div class="mcard-bd">${modeBody(key)}</div>`:''}</section>`;
}
/* «Выбор меню»: группа вариантов столбиком; ряд — две группы рядом, одиночная — сеткой в 2 колонки */
function mGroup(lbl,opts,id){
  return`<div class="mgrp"><div class="mgrp-lbl">${lbl}</div><div class="mgrp-opts"${id?` id="${id}"`:''}>${opts}</div></div>`;
}
function mOpts(items,isOn,attr){
  return items.map(it=>`<button class="mopt${isOn(it.v)?' on':''}" ${attr(it.v)}>${it.l}</button>`).join('');
}
function mPick(items,active,prefix){return mOpts(items,v=>v===active,v=>`data-a="${prefix}:${v}"`);}
function mRows(rows){
  return`<div class="mrows">${rows.map(r=>r.filter(Boolean)).filter(r=>r.length)
    .map(r=>`<div class="mrow${r.length===1?' single':''}">${r.join('')}</div>`).join('')}</div>`;
}
function mFolders(type,selected,prefix){
  if(foldersOf(type).length<2)return'';
  const allOn=!selected||!selected.length;
  return mGroup('Папки',`<button class="mopt${allOn?' on':''}" data-a="${prefix}:__all__">Все</button>`
    +foldersOf(type).map(f=>`<button class="mopt${selected&&selected.includes(f)?' on':''}" data-a="${prefix}:${esc(f)}">${esc(f)}</button>`).join(''));
}
const FILTER_OPTS=[{v:'all',l:'Все'},{v:'unknown',l:'Не знаю'},{v:'learning',l:'Учу'},{v:'know',l:'Знаю'}];
const COUNT_OPTS=[{v:'all',l:'Все'},{v:'20',l:'20'},{v:'50',l:'50'},{v:'100',l:'100'}];
function modeBody(key){
  const type=S.homeTab,d=ds(type);
  const empty=msg=>`<div class="mempty">${msg}</div><button class="mstart" data-a="go-import-home">Импорт</button>`;
  if(!d.length)return empty(`Нет ${type==='kanji'?'кандзи':'слов'} — сначала импортируйте данные`);
  // порядок и подписи полей — как в макете карточек «Карточки» / «Квиз»
  const flds=type==='kanji'?['kanji','meaning','on_reading','kun_reading']:['reading','meaning','kanji'];
  const fo=k=>({v:k,l:type==='kanji'&&k!=='kanji'?fldLabel(k,type):fldShort(k,type)});
  let rows,start;
  if(key==='cards'){
    const c=S.studyCfg;
    rows=[
      [mGroup('Лицевая сторона',mOpts(flds.map(fo),v=>c.front.includes(v),v=>`data-field-front="${v}"`),'chips-front'),
       mGroup('Обратная сторона',mOpts(flds.map(fo),v=>c.back.includes(v),v=>`data-field="${v}"`),'chips-back')],
      [mGroup('Фильтр',mPick(FILTER_OPTS,c.filter,'study-filter')),mGroup('Количество',mPick(COUNT_OPTS,c.count,'study-count'))],
      [mFolders(type,c.folders,'study-folder')],
    ];
    start='start-study';
  }else{
    if(d.length<4)return empty(`Нужно минимум 4 записи (сейчас ${d.length})`);
    const c=S.quizCfg,mode=c.mode;
    const fc=[mGroup('Фильтр',mPick(FILTER_OPTS,c.filter,'quiz-filter')),mGroup('Количество',mPick(COUNT_OPTS,c.count,'quiz-count'))];
    if(key==='quiz'){
      const aF=arr(c.answer);
      rows=[
        [mGroup('Что в вопросе',mOpts(flds.map(fo),v=>c.question.includes(v),v=>`data-qfield="${v}"`),'chips-q'),
         mGroup('Что в ответе',mOpts(flds.map(fo),v=>aF.includes(v),v=>`data-a="quiz-afield:${v}"`))],
        [mGroup('Режим ответа',mPick([{v:'choice4',l:'4 варианта'},{v:'choice6',l:'6 вариантов'},{v:'input',l:'Вписать'},{v:'mix',l:'Смешанный'}],mode,'quiz-mode'))],
        fc,
      ];
    }else if(key==='quiz-compose'){
      const cm=c.composeMode||'normal',cs=c.composeShow||{};
      const second=cm==='ultra'
        ?mGroup('Сложность',mPick([{v:'all',l:'Все'},{v:'easy',l:'Лёгкие'},{v:'medium',l:'Средние'},{v:'hard',l:'Сложные'}],c.ultraDifficulty||'all','ultra-diff'))
        :mGroup('На канвасе',(cm==='reverse'?'':`<button class="mopt${cs.reading?' on':''}" data-a="compose-switch:reading">Кана</button>`)
          +`<button class="mopt${cs.meaning?' on':''}" data-a="compose-switch:meaning">Значение</button>`);
      rows=[[mGroup('Направление',mPick([{v:'normal',l:'Собрать слово'},{v:'reverse',l:'Собрать чтение'},{v:'ultra',l:'Ultra'}],cm,'compose-dir')),second],fc];
    }else if(key==='quiz-pairs'){
      rows=[fc];
    }else{
      const side=sd=>{const on=arr(sd==='L'?c.matchLeft:c.matchRight);return mOpts(flds.map(fo),v=>on.includes(v),v=>`data-a="match-side:${sd}:${v}"`);};
      const senses=[...arr(c.matchLeft),...arr(c.matchRight)].some(f=>f==='meaning'||f==='translation');
      rows=[[mGroup('Слева',side('L')),mGroup('Справа',side('R'))],
        [senses?mGroup('Значений в плитке',mPick([{v:'one',l:'Одно'},{v:'all',l:'Все'}],c.matchSenses,'match-senses')):''],fc];
    }
    rows.push([mFolders(type,c.folders,'quiz-folder')]);
    start='start-quiz';
  }
  return`<div class="mcard-sub">Настроить:</div>${mRows(rows)}<button class="mstart" data-a="${start}">Старт</button>`;
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
  const seg=`<div class="hseg-row"><div class="hseg">
    <button class="hseg-btn${type==='words'?' on':''}" data-a="cfg-type:words">слова</button>
    <button class="hseg-btn${type==='kanji'?' on':''}" data-a="cfg-type:kanji">кандзи</button>
  </div></div>`;
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
  const counts=COUNT_OPTS;
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
  const counts=COUNT_OPTS;
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
  const total=S.studyQueue.length,curr=S.studyIdx+1;
  const isKanji=S.studyCfg.type==='kanji';

  const hintOn=isKanji&&S.cardHint;
  const face=(body,back)=>`<div class="fc-face${back?' fc-back':''}">
      <div class="qscore"><div class="qbadge">${curr} / ${total}</div></div>
      <div class="qbody">${body}</div>
      ${isKanji?hintPill(w,hintOn,'toggle-card-hint'):''}
    </div>`;
  const front=buildCardVariant(w,S.studyCfg.front,S.studyCfg.type)
    +(!S.cardFlipped?`<div class="fc-tap">нажмите, чтобы перевернуть</div>`:``);
  const back=`<div class="fc-back-body">${buildCardVariant(w,S.studyCfg.back,S.studyCfg.type)}</div>`;

  // Канвас (Figma 157:4626): обе стороны — полноценный канвас; переворачивается целиком
  return`<div class="pg">
    <div class="cv-wrap">
      <div class="fc-wrap" data-a="flip">
        <div class="fc${S.cardFlipped?' flipped':''}">${face(front,false)}${face(back,true)}</div>
      </div>
      ${hintOn?hintDrop(w):''}
    </div>
    <div class="mark-row">
      <button class="mbtn r" data-a="mark:unknown">Не знаю</button>
      <button class="mbtn y" data-a="mark:learning">Учу</button>
      <button class="mbtn g" data-a="mark:know">Знаю</button>
    </div>
    <div class="quiz-actions">
      <button class="qact-btn" data-a="stop-study">Стоп</button>
      <button class="qact-btn" data-a="skip-card">Пропустить</button>
    </div>
  </div>`;
}

/* ── Подсказки к кандзи (Figma «Раскрывашка "показать подсказки"» 158:384) ──
 * Кнопка — внутри канваса; слова с этим иероглифом выезжают шторкой из-под канваса,
 * поэтому не теснят содержимое карточки и видны при любой длине значений. */
function hintPill(item,on,action){
  if(!S.hintsEnabled||!item||!item.kanji)return'';
  return`<button class="cv-hint${on?' on':''}" data-a="${action}">${on?'Скрыть подсказки':'Показать подсказки'}</button>`;
}
function hintDrop(item){
  const ch=item&&item.kanji?String(item.kanji):'';if(!ch)return'';
  const words=exampleWords(ch).slice(0,4);
  const body=words.length
    ?words.map(w=>`<span class="hchip"><span class="hchip-w">${esc(w.kanji)}</span>${w.reading?`<span class="hchip-k"><span class="hchip-l">kana:</span><span class="hchip-r">${esc(w.reading)}</span></span>`:''}</span>`).join('')
    :`<span class="hchip-empty">Нет слов с этим иероглифом среди ваших кандзи</span>`;
  return`<div class="cv-drop" data-key="hint-drop">${body}</div>`;
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

/* Итоги сессии квиза: набор из «Количества» пройден */
function buildQuizDone(){
  const r=S.quizResults;
  return`
    <div class="done">
      <div class="done-i">🎉</div>
      <h2>Набор пройден!</h2>
      <p style="color:var(--t2);margin-top:6px;font-size:13px">${r.total?`Записей в наборе: ${r.total}`:''}</p>
      <div class="res-grid" style="grid-template-columns:repeat(2,1fr)">
        <div class="rc g"><div class="rn">${r.ok}</div><div class="rl">Верно</div></div>
        <div class="rc r"><div class="rn">${r.bad}</div><div class="rl">Неверно</div></div>
      </div>
      <div style="padding:0 16px">
        <div class="btn-row">
          <button class="btn btn-p" data-a="start-quiz">🔄 Снова</button>
          <button class="btn btn-s" data-a="stop-quiz">Завершить</button>
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

  const hintOn=S.quizCfg.type==='kanji'&&S.quizHint;
  const qCard=qCanvas(buildCardVariant(q.word,q.qFields,S.quizCfg.type,true),'',S.quizCfg.type==='kanji'?q.word:null,hintOn,'toggle-hint');

  let choiceHtml='';
  if(showChoice&&q.options){
    choiceHtml=`<div class="quiz-panel">
      <div class="quiz-panel-lbl">Выберите вариант:</div>
      <div class="quiz-opts">
      ${q.options.map((opt,i)=>{
        let cls='';
        if(S.quizDone)cls=i===q.correct?'ok':i===S.quizSel?'bad':'';
        else if(i===S.quizSel)cls='sel';
        const sense=q.aField==='meaning'||q.aField==='translation';
        const txt=q.aField==='kun_reading'?renderKun(opt):sense?firstSense(opt):esc(opt);
        return`<button class="qopt ${cls}"${S.quizDone?' aria-disabled="true"':''}${sense?moreAttr(opt):''} data-a="quiz-ans:${i}">${txt}</button>`;
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

  return`<div class="pg">${qCard}${choiceHtml}${inputHtml}${qActions(showInput?'quiz-check':null)}</div>`;
}
/* ── #3 Мультиполевой рендер: группа вариантов/ввода на каждое поле ответа ── */
function buildMultiActive(q){
  const type=S.quizCfg.type;
  const qCard=qCanvas(buildCardVariant(q.word,q.qFields,type,true),'',type==='kanji'?q.word:null,type==='kanji'&&S.quizHint,'toggle-hint');
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
      const sense=g.field==='meaning'||g.field==='translation';
      const txt=g.field==='kun_reading'?renderKun(opt):sense?firstSense(opt):esc(opt);
      const dis=(sel!=null||S.quizDone)?' aria-disabled="true"':'';
      return`<button class="qopt ${cls}"${dis}${sense?moreAttr(opt):''} data-a="multi-pick:${gi}:${i}">${txt}</button>`;
    }).join('');
    return`<div class="quiz-panel"><div class="quiz-panel-lbl">${lbl}:</div><div class="quiz-opts">${opts}</div></div>`;
  }).join('');
  return`<div class="pg">${qCard}${panels}${qActions(q.useInput?'multi-check':null)}</div>`;
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

/* Счёт в шапке канваса (Figma 155:3551): верно / неверно / пройдено из набора */
function qScoreBar(){
  const{ok,bad}=S.quizScore,q=S.quizQ;
  const size=S.quizLimit&&!(q&&(q.pairs||q.match||q.verbs))?S.quizLimit.ids.size:0;
  return`<div class="qscore">
    <div class="qbadge qok" aria-label="Верно">${ok}</div>
    <div class="qbadge qbad" aria-label="Неверно">${bad}</div>
    <div class="qbadge">${quizSessionSize()&&size?`${Math.min(S.quizAsked,size)} / ${size}`:`${ok+bad}${size?` / ${size}`:''}`}</div>
  </div>`;
}
// Канвас вопроса (Figma 157:4624): фиксированная высота, счёт сверху, содержимое по центру.
// Внизу канваса — пилюли (подсказки, переключатели режима); подсказки выезжают из-под канваса.
function qCanvas(inner,cls='',hintItem=null,hintOn=false,hintAction='',foot='',drop=''){
  const pills=hintPill(hintItem,hintOn,hintAction)+foot;
  return`<div class="cv-wrap"><div class="quiz-q${cls}">${qScoreBar()}<div class="qbody">${inner}</div>${pills?`<div class="cv-pills">${pills}</div>`:''}</div>${hintOn&&hintItem?hintDrop(hintItem):''}${drop}</div>`;
}
// Стоп / Пропустить / Дальше — одним рядом. Третья кнопка: «Дальше» после ответа,
// «Проверить» там, где ответ подтверждается вручную, иначе неактивная «Дальше».
function qActions(checkAction){
  const third=S.quizDone?`<button class="qact-btn primary" data-a="next-q">Дальше</button>`
    :checkAction?`<button class="qact-btn primary" data-a="${checkAction}">Проверить</button>`
    :`<button class="qact-btn primary" aria-disabled="true" tabindex="-1">Дальше</button>`;
  return`<div class="quiz-actions">
    <button class="qact-btn" data-a="stop-quiz">Стоп</button>
    <button class="qact-btn" data-a="skip-q">Пропустить</button>
    ${third}
  </div>`;
}

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
  const kanaLine=q.word.reading?`<div class="cmp-line"><span class="lbl">kana:</span><span class="val jp">${esc(q.word.reading)}</span></div>`:'';
  const meaningLine=q.word.meaning?`<div class="cmp-line"><span class="lbl">meaning:</span><span class="val">${esc(String(q.word.meaning).split(/;/)[0])}</span></div>`:'';
  const fs=`style="font-size:${kjSize(q.word.kanji)}px"`;
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
    canvasInner=`<div class="cmp-canvas"><div class="cmp-word" ${fs}>${esc(q.word.kanji)}</div>${cs.meaning?meaningLine:''}<div class="cmp-build">${slots.join('')}</div></div>`;
  } else if(ultra){
    // Ultra: незнакомый кандзи (нет в импорте) стоит на месте; знакомые — слоты,
    // которые юзер подставляет из своих кандзи по значению.
    let ki=0;
    const cells=q.positions.map(pp=>{
      if(!pp.known)return`<span class="cmp-ch">${esc(pp.c)}</span>`; // учимый — показан
      const filled=built[ki++];
      return filled!=null?`<span class="cmp-ch">${esc(filled)}</span>`:`<span class="cmp-slot"></span>`;
    });
    canvasInner=`<div class="cmp-canvas"><div class="cmp-build" ${fs}>${cells.join('')}</div>${meaningLine}</div>`;
  } else {
    // Normal: собираем кандзи, кана/значение как подсказка
    const slots=[];
    for(let i=0;i<q.target.length;i++)slots.push(built[i]!=null?`<span class="cmp-ch">${esc(built[i])}</span>`:`<span class="cmp-slot"></span>`);
    const lines=[];
    if(cs.reading)lines.push(kanaLine);
    if(cs.meaning)lines.push(meaningLine);
    canvasInner=`<div class="cmp-canvas"><div class="cmp-build" ${fs}>${slots.join('')}</div>${lines.join('')}</div>`;
  }
  const canvasCls=S.quizDone?(q.result?' ok':' bad'):'';
  // Переключатели «Кана / Значение» — пилюлями внизу канваса, как «Показать подсказки».
  // В reverse «Кана» скрыта; в ultra переключателей нет (значение показано всегда)
  const sw=(k,label)=>`<button class="cv-hint${cs[k]?' on':''}" data-a="compose-switch:${k}" aria-pressed="${!!cs[k]}">${label}</button>`;
  const switches=ultra?'':(reverse?'':sw('reading','Кана'))+sw('meaning','Значение');
  const canvas=qCanvas(canvasInner,canvasCls,null,false,'',switches);
  // Варианты: кандзи (normal/ultra) или части каны (reverse). В ultra — только знакомые кандзи.
  const opts=q.options.map((o,i)=>{
    const picked=q.picks.includes(i);
    let cls='';
    if(S.quizDone)cls=picked?(q.result?'ok':'bad'):'';
    else if(picked)cls='sel';
    return`<button class="qopt ${reverse?'':'kanji '}${cls}" ${S.quizDone?'disabled':''} data-a="compose-pick:${i}">${esc(o)}</button>`;
  }).join('');
  const panel=`<div class="quiz-panel"><div class="quiz-panel-lbl">Выберите вариант:</div><div class="quiz-opts">${opts}</div></div>`;
  return`<div class="pg">${canvas}${panel}${qActions()}</div>`;
}

/* ── PAIRS ACTIVE (Figma: Выбери пару) ── */
function buildPairsActive(q){
  const counter=`<div class="pair-count"><div class="pair-count-pill">${q.found.length}/${q.total}</div></div>`;
  // Канвас
  let canvasInner,canvasCls='';
  const slot=(o,withMeaning)=>`<div class="pair-slot"><div class="pk">${esc(o.kanji)}</div>${withMeaning&&o.meaning?`<div class="pm"><span>meaning:</span><b>${esc(o.meaning)}</b></div>`:''}</div>`;
  if(q.result){
    const a=q.options[q.result.a],b=q.options[q.result.b];
    canvasCls=q.result.ok?' ok':' bad';
    const readings=q.result.ok
      ?`<div class="pair-on"><span class="lbl">on:</span><span class="val">${esc(a.onRaw)}</span></div>`
      :`<div class="pair-on"><span class="val">${esc(a.onRaw)}</span> <span class="lbl">≠</span> <span class="val">${esc(b.onRaw)}</span></div>`;
    canvasInner=`<div class="pair-canvas"><div class="pair-slots">${slot(a,q.result.ok)}${slot(b,q.result.ok)}</div>${readings}</div>`;
  } else if(q.firstPick!=null){
    const a=q.options[q.firstPick];
    canvasInner=`<div class="pair-canvas"><div class="pair-slots">${slot(a,false)}</div></div>`;
  } else {
    canvasInner=`<div class="pair-canvas"><div class="pair-hint">Выберите два иероглифа с одинаковым он-чтением</div></div>`;
  }
  const canvas=qCanvas(canvasInner,canvasCls);
  // Варианты
  const opts=q.options.map((o,i)=>{
    const found=q.found.some(f=>f.includes(i));
    const sel=q.firstPick===i;
    let cls=found?'ok':sel?'sel':'';
    const label=found?`${esc(o.kanji)}<span class="qopt-on">${esc(o.onRaw)}</span>`:esc(o.kanji);
    return`<button class="qopt kanji ${cls}" ${found||S.quizDone?'disabled':''} data-a="pairs-pick:${i}">${label}</button>`;
  }).join('');
  const panel=`<div class="quiz-panel"><div class="quiz-panel-lbl">Выберите вариант:</div><div class="quiz-opts">${opts}</div></div>`;
  return`<div class="pg">${counter}${canvas}${panel}${qActions()}</div>`;
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
  return`<div class="pg">${qScoreBar()}${counter}${hint}${cols}${qActions()}</div>`;
}

/* ── VERB FORMS ACTIVE (Figma: Спряжение глаголов) ──
 * Задание (русское, из флагов) + основа глагола; собрать нужную форму из окончаний. */
// фуригана над основой: ruby на весь кусок основы (корректно и для составных глаголов
// типа 役に立つ, где между кандзи есть кана). kuru/suru пропускаем — у них меняется чтение.
// словарная форма с фуриганой только над кандзи-частью: 食べる → 食(た)べる
function vbFuriDict(v){
  const d=[...v.d],r=[...v.r];let k=0;
  while(k<d.length&&k<r.length&&d[d.length-1-k]===r[r.length-1-k])k++;   // общая окуригана в конце
  const head=d.slice(0,d.length-k).join(''),tail=d.slice(d.length-k).join(''),read=r.slice(0,r.length-k).join('');
  if(!head||![...head].some(isKanjiChar)||!read)return esc(v.d);
  // не <ruby>: его высота зависит от шрифта и движка, а здесь чтение должно стоять вплотную к знаку
  return`<span class="furi-k"><span class="furi-r">${esc(read)}</span>${esc(head)}</span>${esc(tail)}`;
}
// теги задания (Figma «Формы глаголов» 160:786): вежливость, отрицание, прошлое — подсказки к смыслу;
// в режиме «Грамматика» добавляется сама конструкция (〜ません)
function vbTags(q){
  const t=[],fs=q.rule.fs||[];
  if(q.rule.st==='polite')t.push('вежливо');
  if(fs.includes('negative'))t.push('отрицание');
  if(fs.includes('past'))t.push('прошедшее');
  const tags=t.map(x=>`<span class="vb-tag">${x}</span>`);
  if(!q.modeB){const gl=String(q.rule.gl||q.rule.nm),m=gl.split('·');tags.push(`<span class="vb-tag gram">${esc((m[1]||m[0]).trim())}</span>`);}
  return tags.length?`<div class="vb-tags">${tags.join('')}</div>`:'';
}
const SPARK_SVG=`<svg class="spark" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 2c.5 4.9 3.1 7.5 8 8-4.9.5-7.5 3.1-8 8-.5-4.9-3.1-7.5-8-8 4.9-.5 7.5-3.1 8-8Z"/><path fill="currentColor" opacity=".7" d="M19 13c.25 2.4 1.6 3.75 4 4-2.4.25-3.75 1.6-4 4-.25-2.4-1.6-3.75-4-4 2.4-.25 3.75-1.6 4-4Z"/></svg>`;
function buildVerbActive(q){
  const filled=q.picks.map(i=>q.options[i]);   // выбранные окончания по порядку слотов
  // задание без суффикса « · вежливо» — вежливость показана тегом
  const task=String(q.task).replace(/ · вежливо$/,'');
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
  let correctLine='';
  if(S.quizDone&&!q.result){
    const ans=q.modeB?(q.stem.jp+q.accepted[0].seq.join('')):(q.stem.jp+q.target.join(''));
    correctLine=`<div class="cmp-correct">Правильно: <span>${esc(ans)}</span></div>`;
  }
  // «Ошибка в задании» — флажок в углу канваса: сохраняет задание и ответы (Настройки → Отметки)
  const flag=`<button class="vb-flag" data-a="verb-flag" role="checkbox" aria-checked="${!!q.flagged}" aria-label="Ошибка в задании" title="Ошибка в задании">⚑</button>`;
  const inner=`${flag}<div class="vb-cv">
      <div class="vb-lbl">Задание:</div><div class="vb-task">${esc(task)}</div>${vbTags(q)}
      <div class="vb-lbl">Глагол:</div>
      <div class="vb-verb"><span class="vb-dict">${vbFuriDict(q.verb)}</span><span class="vb-mean">${esc(q.verb.m)}</span></div>
      <div class="vb-word"><span class="vb-base">${esc(q.stem.jp)}</span>${slots}</div>${correctLine}
    </div>`;
  const canvasCls=S.quizDone?(q.result?' ok':' bad'):'';
  // «Объясни почему» — только после ответа (верного или нет); объяснение выезжает из-под канваса
  const aiOn=!!(S.ai&&S.ai.open);
  const why=S.quizDone?`<button class="cv-hint ai-why${aiOn?' on':''}" data-a="${aiOn?'ai-close':'ai-open'}" aria-expanded="${aiOn}">${aiOn?'Скрыть объяснение':'Объясни почему'}${SPARK_SVG}</button>`:'';
  const canvas=qCanvas(inner,canvasCls,null,false,'',why,aiOn?buildAiDrawer():'');
  // Банк окончаний — hug-content чипы (как в дуалинго)
  const opts=q.options.map((o,i)=>{
    const at=q.picks.indexOf(i);let cls='';
    if(S.quizDone){ if(at>=0)cls=q.modeB?(q.result?'ok':'bad'):((o===q.target[at])?'ok':'bad'); }
    else if(at>=0)cls='on';
    return`<button class="qchip ${cls}" ${S.quizDone?'disabled':''} data-a="verb-pick:${i}">${esc(o)}</button>`;
  }).join('');
  const bankLbl=q.modeB?'Соберите форму — способ выберите сами:':'Соберите нужную форму глагола:';
  // при открытом объяснении банк остаётся, но уходит ниже — до него можно долистать
  const panel=`<div class="quiz-panel"><div class="quiz-panel-lbl">${bankLbl}</div><div class="quiz-bank">${opts}</div></div>`;
  return`<div class="pg">${canvas}${panel}${qActions(q.modeB&&q.picks.length?'verb-check':null)}</div>`;
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
  const seg=`<div class="hseg-row"><div class="hseg">
      <button class="hseg-btn${type==='words'?' on':''}" data-a="words-tab:words">слова</button>
      <button class="hseg-btn${type==='kanji'?' on':''}" data-a="words-tab:kanji">кандзи</button>
    </div></div>`;
  const importBtn=`<button class="nimport" style="margin:0 16px 8px;grid-column:auto" data-a="words-import"><img src="${ASSETS.cImport}" alt="">Импортировать</button>`;
  const search=`<div class="dsearch">
      <img class="dsearch-ic" src="${ASSETS.cSearch}" alt="">
      <input id="words-search" class="dsearch-inp" type="text" placeholder="Поиск..." value="${esc(S.wordsSearch)}" autocomplete="off" autocorrect="off">
    </div>`;
  const folderTabs=folders.length>1?`<div class="wfilter" style="overflow-x:auto;flex-wrap:nowrap">
      <button class="wf-tab${wf==='all'?' on':''}" style="flex:none" data-a="words-folder:all">Все папки</button>
      ${folders.map(f=>`<button class="wf-tab${wf===f?' on':''}" style="flex:none" data-a="words-folder:${esc(f)}">${esc(f)}</button>`).join('')}
    </div>`:'';
  const tools=ds(type).length?`<div class="dtools">
      <button class="dtool${S.selecting?' on':''}" data-a="${S.selecting?'sel-cancel':'sel-start'}">${S.selecting?'Отменить выбор':'Выбрать'}</button>
      ${type==='kanji'?`<span class="dtools-sp"></span>
      <button class="dtool${S.kanjiView==='grid'?' on':''}" data-a="kanji-view:grid">▦ Сетка</button>
      <button class="dtool${S.kanjiView==='single'?' on':''}" data-a="kanji-view:single">▭ По одному</button>`:''}
    </div>`:'';
  return`
    ${seg}
    ${importBtn}
    ${search}
    ${folderTabs}
    ${tools}
    <div id="words-results">${buildWordsResults()}</div>
    ${S.selecting?buildSelBar():''}`;
}
function wordsList(){
  const type=S.wordsTab,d=ds(type);
  const{folders,wf}=wordsFolderState();
  const base=wf==='all'?d:d.filter(w=>inFolder(w,wf));
  const q=S.wordsSearch.toLowerCase();
  const list=q
    ?base.filter(w=>[w.kanji,w.reading,w.on_reading,w.kun_reading,w.meaning,w.translation]
        .some(v=>String(v||'').toLowerCase().includes(q)))
    :base;
  return{type,d,folders,wf,base,list};
}
const CHECK_SVG=`<svg width="14" height="10" viewBox="0 0 14 10" fill="none"><path d="M1 5l4 4L13 1" stroke="#7aff78" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
function statusMark(s){return s==='know'?`<span class="ditem-st know">${CHECK_SVG}</span>`:`<span class="ditem-st ${s}"><span class="dot"></span></span>`;}
function folderTag(w,show){
  const f=itemFolders(w).filter(x=>x!=='Общая');
  return show&&f.length?`<div class="dfolder">📁 ${f.map(esc).join(' · ')}</div>`:'';
}
function selAttrs(w){
  const sel=S.selecting&&S.selIds.includes(w.id);
  return{sel,attrs:` data-wid="${esc(w.id)}"`+(S.selecting?` data-a="sel-toggle:${esc(w.id)}" role="checkbox" aria-checked="${sel}"`:''),mark:S.selecting?`<span class="ksel">${sel?'✓':''}</span>`:''};
}
// Карточка кандзи: крупный знак, он/кун, значение и по примеру слова на каждое чтение
// Карточка кандзи в словаре (Figma 157:4792): знак + он/кун + значение сверху,
// под разделителем — по примеру слова на он- и кун-чтение (значение, слово, чтение с выделением)
function kanjiCard(w,p,single,showFolder){
  const{sel,attrs,mark}=selAttrs(w);
  const mean=mSplit(shownMeaning(w));
  const ex=kanjiExamples(w);
  // в сетке — первое чтение (как в макете), на отдельной странице — до четырёх
  const two=s=>String(s||'').split(/[、,;・]/).map(x=>x.trim()).filter(Boolean).slice(0,single?4:1).join('、');
  const read=(lbl,v)=>v?`<div class="kc-r"><span class="kc-l">${lbl}</span><span class="kc-v">${v}</span></div>`:'';
  const exCol=(lbl,e)=>e?`<div class="kc-col"><span class="kc-l2">${lbl}</span>${e.meaning?`<span class="kc-t">${esc(e.meaning)}</span>`:''}<span class="kc-t">${esc(e.word)}</span><span class="kc-t kc-yomi">${e.html}</span></div>`:'';
  const exHtml=exCol('он-чтение:',ex.on)+exCol('кун-чтение:',ex.kun);
  return`<div class="kcard${single?' kpage':''}${sel?' sel':''}"${attrs}>
      ${mark}${statusMark(statusOf(p,w.id))}
      <div class="kc-top">
        <div class="kc-k">${esc(w.kanji)}</div>
        <div class="kc-info">
          ${w.on_reading||w.kun_reading?`<div class="kc-reads">${read('он:',esc(two(w.on_reading)))}${read('кун:',renderKun(two(w.kun_reading)))}</div>`:''}
          ${mean.length?`<div class="kc-mean"><span class="kc-l2">значение:</span><span class="kc-mv">${esc((single?mean:mean.slice(0,2)).join(', '))}</span></div>`:''}
        </div>
      </div>
      ${exHtml?`<i class="kc-div"></i><div class="kc-ex">${exHtml}</div>`:''}
      ${folderTag(w,showFolder)}
    </div>`;
}
// Список отдельно от поля поиска: при вводе обновляется только он (фокус и IME не сбрасываются)
function buildWordsResults(){
  const{type,d,folders,wf,base,list}=wordsList(),p=pr(type);
  const showFolderTag=wf==='all'&&folders.length>1;
  const item=w=>{
    const{sel,attrs,mark}=selAttrs(w);
    const reading=esc(w.reading||'');
    const meaning=esc(shownMeaning(w));
    return`<div class="ditem${sel?' sel':''}"${attrs}>
        ${mark}<span class="ditem-k">${esc(w.kanji)}</span>
        <span class="ditem-info">${reading?`<span class="ditem-r">${reading}</span>`:''}${meaning?`<span class="ditem-m">${meaning}</span>`:''}${folderTag(w,showFolderTag)}</span>
        ${statusMark(statusOf(p,w.id))}
      </div>`;
  };
  if(!d.length)return`<div class="empty"><div class="ei">${type==='kanji'?'㊙️':'📖'}</div><div class="et">Нет ${type==='kanji'?'кандзи':'слов'}</div><div class="eb">Импортируйте CSV/TSV файл</div><button class="btn btn-p" style="margin:0 16px;width:calc(100% - 32px)" data-a="words-import">Импортировать</button></div>`;
  if(!base.length)return`<div class="empty"><div class="ei">📁</div><div class="et">Папка пуста</div><div class="eb">В папке «${esc(wf)}» пока нет ${type==='kanji'?'кандзи':'слов'}</div></div>`;
  const shown=list.slice(0,S.wordsLimit);
  const more=list.length>shown.length?`<button class="btn btn-s" style="margin:8px 16px;width:calc(100% - 32px)" data-a="words-more">Показать ещё (${list.length-shown.length})</button>`:'';
  const body=type==='kanji'
    ?(S.kanjiView==='single'
      ?`<div class="kpages">${shown.map(w=>kanjiCard(w,p,true,showFolderTag)).join('')}</div>`
      :`<div class="kgrid">${shown.map(w=>kanjiCard(w,p,false,showFolderTag)).join('')}</div>`)
    :`<div class="dlist">${shown.map(item).join('')}</div>`;
  return`${body}${more}
    ${list.length!==base.length?`<div style="font-size:12px;color:var(--al);text-align:center;padding:6px">Найдено: ${list.length} из ${base.length}</div>`:''}`;
}
// Панель выбора: счётчик → «В папку» → существующая или новая папка
function buildSelBar(){
  const n=S.selIds.length,type=S.wordsTab;
  if(!S.selSheet)return`<div class="selbar">
      <span class="selbar-n">Выбрано: ${n}</span>
      <button class="dtool" data-a="sel-all">Все</button>
      <button class="dtool on" data-a="sel-sheet"${n?'':' disabled'}>В папку</button>
    </div>`;
  const existing=foldersOf(type).filter(f=>f!=='Общая');
  return`<div class="selbar sheet">
      <div class="selbar-t">Добавить ${n} в папку</div>
      ${existing.length?`<div class="chips">${existing.map(f=>`<button class="chip" data-a="sel-to-folder:${esc(f)}">${esc(f)}</button>`).join('')}</div>`:''}
      <input id="sel-folder-name" class="quiz-inp" type="text" placeholder="Новая папка" autocomplete="off" autocorrect="off" autocapitalize="off">
      <div class="btn-row"><button class="btn btn-s" data-a="sel-sheet-close">Назад</button><button class="btn btn-p" data-a="sel-new-folder">Создать</button></div>
      <div class="selbar-hint">Записи остаются и в своих папках, прогресс общий</div>
    </div>`;
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
    <div style="margin-bottom:6px;padding:0 16px"><div class="sset-lbl">Отметки «Ошибка в задании» (формы глаголов)</div></div>
    <div class="sset">
      <div class="srow"><span class="srow-l">Отмечено карточек</span><span class="srow-r">${S.verbReports.length}</span></div>
      ${S.verbReports.length?`<div class="srow" data-a="verb-reports"><span class="srow-l">Скачать CSV отметок</span><span class="srow-r">↓</span></div>
      <div class="srow" data-a="verb-reports-clear"><span class="srow-l" style="color:var(--y)">Очистить отметки</span><span class="srow-r">›</span></div>`:''}
    </div>
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
      <div style="font-size:12px;color:var(--al);margin-bottom:8px">Папка: ${esc(importTargetFolder())} · уже известные ${S.importType==='kanji'?'кандзи':'слова'} не дублируются: значение обновится, прогресс сохранится</div>
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
