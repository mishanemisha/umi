'use strict';
// Состояние, хранение, CSV-импорт, SM-2 и общие помощники
const practiceAvailable=Boolean(window.UMI_BANK&&typeof buildPractice==='function');
const tg=window.Telegram?.WebApp;
if(tg){tg.expand();tg.ready();}
function haptic(t='light'){tg?.HapticFeedback?.impactOccurred(t);}

/* ── Field defs ── */
const FIELDS={
  kanji:{label:'Кандзи / Слово',short:'Кандзи'},
  reading:{label:'Чтение (кана)',short:'Кана'},
  on_reading:{label:'Он-чтение',short:'Он'},
  kun_reading:{label:'Кун-чтение',short:'Кун'},
  meaning:{label:'Значение',short:'Значение'},
  translation:{label:'Перевод',short:'Перевод'},
  notes:{label:'Заметки',short:'Заметки'},
};
const FK=Object.keys(FIELDS);
const WF=['kanji','reading','meaning'];
const KF=['kanji','on_reading','kun_reading','meaning'];
function fldShort(k,type){if(k==='kanji'&&type==='words')return'Кандзи/слово';return FIELDS[k]?.short||k;}
function fldLabel(k,type){if(k==='kanji'&&type==='words')return'Слово';return FIELDS[k]?.label||k;}
// стороны режима «Сопоставь пары» по умолчанию: слева значение, справа слово/иероглиф
function matchSide(type,side){
  if(side==='L')return['meaning'];
  return type==='kanji'?['kanji']:['kanji','reading'];
}

/* ── Ассеты нового дизайна (assets/*.png) ── */
const ASSETS={"logo":"assets/logo.png","navHome":"assets/navHome.png","navDict":"assets/navDict.png","navSet":"assets/navSet.png","cCards":"assets/cCards.png","cQuiz":"assets/cQuiz.png","cCompose":"assets/cCompose.png","cPair":"assets/cPair.png","cImport":"assets/cImport.png","cSearch":"assets/cSearch.png"};



// фильтры упражнений v3: каталог из verb_exercise_filters_v3_ru.csv (kind: form | modifier | register)
const VERB_CAT_BY_ID={};VERB_CATS_DATA.forEach(c=>{VERB_CAT_BY_ID[c.v]=c;});
const VERB_CATS_DEFAULT=['dictionary','masu','te_form','ta_form','nai_form','conditional','tai'];
const VERB_ICON='assets/verb.png';
const MATCH_ICON='assets/match.png';

/* ── State ── */
const S={
  tab:'home', homeTab:'words', testsSubTab:'cards',
  wordsTab:'words', wordsSearch:'', wordsFolder:'all', wordsLimit:300,
  words:[], progress:{},
  kanjiItems:[], kanjiProgress:{},
  wordsCsv:'', kanjiCsv:'',
  studyQueue:[], studyIdx:0, cardFlipped:false, studyResults:null,
  studyCfg:{type:'words',front:['kanji'],back:['reading','meaning'],filter:'all',count:'all',folders:[]},
  quizCfg:{type:'words',mode:'choice6',question:['kanji'],answer:['reading'],filter:'all',count:'all',folders:[],composeShow:{reading:true,meaning:false},composeMode:'normal',ultraDifficulty:'all',
    verbStyle:'both',verbMode:'A',verbLevel:'medium',verbSource:'all',verbCats:VERB_CATS_DEFAULT.slice(),
    matchLeft:['meaning'],matchRight:['kanji','reading'],matchSenses:'one'},
  quizQ:null, quizLimit:null, quizScore:{ok:0,bad:0}, quizDone:false, quizSel:-1, quizInputVal:'',
  quizHint:false, cardHint:false, quizRecent:[],
  wordDisplay:'full', // 'full' — слово целиком (кандзи), 'kana' — только кана
  hintsEnabled:true,  // подсказки в квизе/карточках кандзи (можно выключить в настройках)
  cfgScreen:null,     // 'cards' | 'quiz' — экран настроек режима, открытый с главной
  confirmPending:null,
  screen:'main', importType:'words', importStep:'type',
  importRaw:null, importMapping:[], importPreview:null, importErr:null, importReading:false,
  importFolder:'Общая', importNewFolder:false, importNewName:'',
};

/* ── Persist ── */
function load(){
  let raw=null;
  try{
    raw=localStorage.getItem('jl4');
    const d=JSON.parse(raw||'{}');
    S.words=d.words||[]; S.progress=d.progress||{};
    S.kanjiItems=d.kanjiItems||[]; S.kanjiProgress=d.kanjiProgress||{};
    S.wordsCsv=d.wordsCsv||''; S.kanjiCsv=d.kanjiCsv||'';
    S.studyCfg={...S.studyCfg,...(d.studyCfg||{})};
    S.quizCfg={...S.quizCfg,...(d.quizCfg||{})};
    if(typeof S.quizCfg.question==='string')S.quizCfg.question=[S.quizCfg.question];
    if(typeof S.studyCfg.front==='string')S.studyCfg.front=[S.studyCfg.front];
    // answer стал мультивыбором: строка → массив
    if(typeof S.quizCfg.answer==='string')S.quizCfg.answer=[S.quizCfg.answer];
    if(!Array.isArray(S.quizCfg.answer)||!S.quizCfg.answer.length)S.quizCfg.answer=[S.quizCfg.type==='kanji'?'on_reading':'reading'];
    // «Все три» больше не режим — если сохранён, приводим к обычному
    if(S.quizCfg.mode==='match')S.quizCfg.mode='choice6';
    if(!Array.isArray(S.studyCfg.folders))S.studyCfg.folders=[];
    if(!Array.isArray(S.quizCfg.folders))S.quizCfg.folders=[];
    if(!S.quizCfg.composeShow||typeof S.quizCfg.composeShow!=='object')S.quizCfg.composeShow={reading:true,meaning:false};
    if(typeof S.quizCfg.composeReverse==='boolean'){S.quizCfg.composeMode=S.quizCfg.composeReverse?'reverse':'normal';delete S.quizCfg.composeReverse;}
    if(!['normal','reverse','ultra'].includes(S.quizCfg.composeMode))S.quizCfg.composeMode='normal';
    if(!['all','easy','medium','hard'].includes(S.quizCfg.ultraDifficulty))S.quizCfg.ultraDifficulty='all';
    if(!['plain','polite','both'].includes(S.quizCfg.verbStyle))S.quizCfg.verbStyle='both';
    if(!['easy','medium','hard'].includes(S.quizCfg.verbLevel))S.quizCfg.verbLevel='medium';
    if(!['A','B'].includes(S.quizCfg.verbMode))S.quizCfg.verbMode='A';
    if(!['all','known'].includes(S.quizCfg.verbSource))S.quizCfg.verbSource='all';
    if(!Array.isArray(S.quizCfg.matchLeft)||!S.quizCfg.matchLeft.length)S.quizCfg.matchLeft=matchSide(S.quizCfg.type,'L');
    if(!Array.isArray(S.quizCfg.matchRight)||!S.quizCfg.matchRight.length)S.quizCfg.matchRight=matchSide(S.quizCfg.type,'R');
    if(!['one','all'].includes(S.quizCfg.matchSenses))S.quizCfg.matchSenses='one';
    if(!Array.isArray(S.quizCfg.verbCats))S.quizCfg.verbCats=[];
    S.quizCfg.verbCats=S.quizCfg.verbCats.filter(v=>VERB_CAT_BY_ID[v]);   // старые v2-категории отбрасываем
    if(!S.quizCfg.verbCats.some(v=>VERB_CAT_BY_ID[v].k==='form'))S.quizCfg.verbCats=VERB_CATS_DEFAULT.slice();
    if(d.wordDisplay==='kana'||d.wordDisplay==='full')S.wordDisplay=d.wordDisplay;
    if(typeof d.hintsEnabled==='boolean')S.hintsEnabled=d.hintsEnabled;
    // Папки: старые записи без папки → «Общая»
    S.words.forEach(w=>{if(!w.folder)w.folder='Общая';});
    S.kanjiItems.forEach(w=>{if(!w.folder)w.folder='Общая';});
    // Миграция on/kun: пересплитим безусловно — splitOnKun идемпотентен.
    // Раньше проверка пропускала случаи, когда импорт сложил всё в одно поле
    // (одна азбука), и второе оставалось пустым → на фронте дашы. В TG-вебвью
    // localStorage отдельный, и старые данные не правились.
    let migrated=false;
    S.kanjiItems.forEach(w=>{
      const combined=[w.reading,w.on_reading,w.kun_reading].filter(Boolean).join('・');
      if(!combined)return;
      const{on_reading,kun_reading}=splitOnKun(combined);
      const newOn=on_reading||'',newKun=kun_reading||'';
      if(newOn!==(w.on_reading||'')||newKun!==(w.kun_reading||'')||w.reading){
        w.on_reading=newOn;
        w.kun_reading=newKun;
        delete w.reading;
        migrated=true;
      }
    });
    if(migrated)save();
  }catch{
    // Нечитаемое сохранение: копируем как есть, пока следующий save() его не перезаписал
    try{if(raw&&!localStorage.getItem('jl4.backup'))localStorage.setItem('jl4.backup',raw);}catch{}
  }
}
function save(){
  try{
    localStorage.setItem('jl4',JSON.stringify({
      words:S.words,progress:S.progress,
      kanjiItems:S.kanjiItems,kanjiProgress:S.kanjiProgress,
      wordsCsv:S.wordsCsv,kanjiCsv:S.kanjiCsv,
      studyCfg:S.studyCfg,quizCfg:S.quizCfg,wordDisplay:S.wordDisplay,hintsEnabled:S.hintsEnabled,
    }));
    return true;
  }catch{
    toast('Не удалось сохранить на устройстве: не хватает места. Освободите память или скачайте CSV.');
    return false;
  }
}
/* ── Экспорт словаря в CSV (всё содержимое, а не только последний импорт) ── */
const CSV_COLS={words:['kanji','reading','meaning','translation','notes','folder'],kanji:['kanji','on_reading','kun_reading','meaning','translation','notes','folder']};
function csvCell(v){v=String(v??'');return/[",\n\r]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v;}
function itemsCsv(type){
  const cols=CSV_COLS[type];
  return[cols.join(','),...ds(type).map(w=>cols.map(c=>csvCell(w[c])).join(','))].join('\n')+'\n';
}
// Сохранение файла: в Telegram WebView blob-ссылки часто не скачиваются —
// пробуем системное «Поделиться», затем буфер обмена, иначе обычную загрузку.
function saveFile(name,text,mime){
  const nav=typeof navigator!=='undefined'?navigator:{};
  try{
    const file=typeof File==='function'?new File([text],name,{type:mime}):null;
    if(tg&&file&&nav.canShare?.({files:[file]})){nav.share({files:[file],title:name}).catch(()=>{});return;}
  }catch{}
  if(tg&&nav.clipboard?.writeText){
    nav.clipboard.writeText(text).then(()=>toast('Файл скопирован в буфер обмена'),()=>toast('Не удалось сохранить файл'));
    return;
  }
  const url=URL.createObjectURL(new Blob([text],{type:mime}));
  const a=document.createElement('a');
  a.href=url;a.download=name;
  document.body.appendChild(a);a.click();document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* ── CSV parser ── */
const ALIAS={
  слово:'kanji',word:'kanji',кандзи:'kanji',kanji:'kanji',
  чтение:'reading',кана:'reading',reading:'reading',kana:'reading',
  'он':'on_reading','он-чтение':'on_reading',on:'on_reading',on_reading:'on_reading',onyomi:'on_reading',
  'кун':'kun_reading','кун-чтение':'kun_reading',kun:'kun_reading',kun_reading:'kun_reading',kunyomi:'kun_reading',
  значение:'meaning',meaning:'meaning',english:'meaning',eng:'meaning',
  перевод:'translation',translation:'translation',russian:'translation',rus:'translation',
  заметки:'notes',notes:'notes',note:'notes',
};
function parseLine(line,sep){
  const out=[];let cur='',q=false;
  for(let i=0;i<line.length;i++){
    const c=line[i];
    if(c==='"'){if(q&&line[i+1]==='"'){cur+='"';i++;}else q=!q;}
    else if(c===sep&&!q){out.push(cur.trim());cur='';}
    else cur+=c;
  }
  out.push(cur.trim());return out;
}
function detectSep(text){
  const row=text.split('\n')[0];
  const t=(row.match(/\t/g)||[]).length;
  // TAB имеет приоритет: табы никогда не встречаются внутри ячеек
  if(t>0)return'\t';
  const c=(row.match(/,/g)||[]).length,s=(row.match(/;/g)||[]).length;
  if(s>c)return';';return',';
}
function parseFile(text){
  if(text.charCodeAt(0)===0xFEFF)text=text.slice(1);
  const sep=detectSep(text);
  const rows=text.split(/\r?\n/).filter(l=>l.trim());
  if(rows.length<1)throw new Error('Файл пустой');
  const first=parseLine(rows[0],sep);
  const hasH=first.some(h=>{const k=h.toLowerCase().replace(/[\s\-]/g,'_');return!!(ALIAS[k]||ALIAS[h.toLowerCase()]);});
  if(!hasH){const rawRows=rows.map(r=>parseLine(r,sep));return{rawRows,colCount:first.length,hasHeaders:false};}
  const headers=first.map(h=>{const k=h.toLowerCase().replace(/[\s\-]/g,'_');return ALIAS[k]||ALIAS[h.toLowerCase()]||k;});
  const rawRows=rows.slice(1).map(r=>parseLine(r,sep));
  return{...applyMapping(rawRows,headers,S.importType==='kanji'),hasHeaders:true};
}
function uid(){return Math.random().toString(36).slice(2,9)+Date.now().toString(36);}
/* ── Katakana / Hiragana sets (explicit, from user spec) ── */
const KATA_SET=new Set([...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲンガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポァィゥェォッャュョヴ']);
const HIRA_SET=new Set([...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをんがぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっゃゅょゔ']);
// ー (U+30FC) — нейтральный знак: определяем по предыдущему токену
function isHira(s){return[...s].some(c=>HIRA_SET.has(c));}
function isKata(s){return[...s].some(c=>KATA_SET.has(c));}
function splitOnKun(str){
  // Разбиваем по запятой, японской запятой, средней точке (・) и пробелам
  const parts=str.split(/[,、・\s]+/).filter(Boolean);
  const on=[],kun=[];
  for(let i=0;i<parts.length;i++){
    const p=parts[i];
    // Убираем ー и прочие нейтральные знаки для классификации
    const s=p.replace(/[ーー・～\u30FC\u30FE]/g,'');
    if(!s){
      // Токен состоит только из нейтральных знаков (напр. "ー")
      // Определяем по предыдущему классифицированному токену
      if(kun.length>0&&on.length===0)kun.push(p);
      else on.push(p);
      continue;
    }
    const hasKana=[...s].some(c=>HIRA_SET.has(c)||KATA_SET.has(c));
    if(!hasKana)continue; // не-кана (английский, цифры) — это не чтение, дропаем
    if(isKata(s)&&!isHira(s))on.push(p);
    else if(isHira(s)&&!isKata(s))kun.push(p);
    else on.push(p); // смешанный (кана+кана) → он
  }
  return{on_reading:on.join('・'),kun_reading:kun.join('・')};
}
function applyMapping(rawRows,mapping,isKanji=false){
  const words=[];
  for(const vals of rawRows){
    if(vals.every(v=>!v))continue;
    const w={id:uid()};
    mapping.forEach((fk,j)=>{if(fk)w[fk]=(vals[j]||'').trim();});
    if(isKanji){
      // Сплит on/kun: объединяем reading + on_reading + kun_reading и переразбиваем
      // по алфавиту (катакана → on, хирагана → kun). Идемпотентно для корректных данных.
      const hasLegacy=!!w.reading;
      const onBroken=w.on_reading&&isHira(w.on_reading);
      const kunBroken=w.kun_reading&&isKata(w.kun_reading);
      if(hasLegacy||onBroken||kunBroken){
        const combined=[w.reading,w.on_reading,w.kun_reading].filter(Boolean).join('・');
        const{on_reading,kun_reading}=splitOnKun(combined);
        w.on_reading=on_reading||'';
        w.kun_reading=kun_reading||'';
        delete w.reading;
      }
    }
    if(!w.kanji&&w.reading)w.kanji=w.reading.split(',')[0].trim();
    if(w.kanji)words.push(w);
  }
  if(!words.length)throw new Error('Нет записей с полем кандзи');
  // foundFields берём из реальных данных, а не из маппинга
  // (после сплита reading → on_reading+kun_reading маппинг уже не актуален)
  const flds=isKanji?KF:WF;
  const foundFields=flds.filter(f=>words.some(w=>w[f]));
  return{words,headers:foundFields,hasHeaders:true};
}
function defaultMapping(colCount,isKanji=false){
  let d;
  if(isKanji){
    // 3 кол.: kanji / смешанные он+кун / значение  → reading автосплитнется на он/кун
    // 4+ кол.: kanji / он / кун / значение / ...
    // 3 кол.: kanji / смешанные он+кун (мапим в on_reading, потом applyMapping
    //          увидит хирагану в on_reading и автосплитнет на он/кун) / значение
    // 4+ кол.: kanji / он / кун / значение / ...
    d=colCount<=3
      ?['kanji','on_reading','meaning']
      :['kanji','on_reading','kun_reading','meaning','translation','notes'];
  }else{
    d=['kanji','reading','meaning','translation','notes'];
  }
  return Array.from({length:colCount},(_,i)=>d[i]||'');
}

/* ── SM-2 lite ──
 * Per-item progress object:
 *   {reps, lapses, ef, interval, due, lastSeen}
 * Status is derived from reps/interval, not stored, чтобы не рассинхронизировать.
 * quality 0..5 (как в классическом SM-2): <3 — провал; ≥3 — успех.
 *   choice correct  → 4
 *   input  correct  → 5
 *   any    wrong    → 1
 *   mark "знаю"     → 5
 *   mark "учу"      → 3
 *   mark "не знаю"  → 0
 */
const SM={DAY:86400000,KNOW_REPS:3,KNOW_INTERVAL:7,DEFAULT_EF:2.5,MIN_EF:1.3};
function defaultProg(){return{reps:0,lapses:0,ef:SM.DEFAULT_EF,interval:0,due:0,lastSeen:0};}
function getProg(p,id){
  const v=p[id];
  if(!v)return defaultProg();
  if(typeof v==='string'){
    // Legacy migration: status string → object с разумными значениями
    const e=defaultProg();
    if(v==='know'){e.reps=SM.KNOW_REPS;e.interval=SM.KNOW_INTERVAL;e.due=Date.now()+SM.KNOW_INTERVAL*SM.DAY;}
    else if(v==='learning'){e.reps=1;e.lapses=1;e.interval=1;e.due=Date.now()+SM.DAY;}
    return e;
  }
  return{...defaultProg(),...v};
}
function statusOf(p,id){
  const v=p[id];
  if(!v)return'unknown';
  if(typeof v==='string')return v;
  const reps=v.reps||0,lapses=v.lapses||0,interval=v.interval||0;
  if(reps===0&&lapses===0)return'unknown';
  if(reps>=SM.KNOW_REPS&&interval>=SM.KNOW_INTERVAL)return'know';
  return'learning';
}
function smUpdate(p,id,quality){
  const e=getProg(p,id);
  if(quality<3){
    e.reps=0;e.interval=1;e.lapses=(e.lapses||0)+1;
  } else {
    if(e.reps===0)e.interval=1;
    else if(e.reps===1)e.interval=6;
    else e.interval=Math.max(1,Math.round(e.interval*(e.ef||SM.DEFAULT_EF)));
    e.reps=(e.reps||0)+1;
  }
  const ef=(e.ef||SM.DEFAULT_EF)+(0.1-(5-quality)*(0.08+(5-quality)*0.02));
  e.ef=Math.max(SM.MIN_EF,ef);
  e.lastSeen=Date.now();
  e.due=Date.now()+e.interval*SM.DAY;
  p[id]=e;
}
function smOverwrite(p,id,quality){
  // Кнопки в флэшкарте: явный overwrite от пользователя (без накопления reps)
  if(quality>=5){p[id]={reps:SM.KNOW_REPS,lapses:0,ef:SM.DEFAULT_EF,interval:SM.KNOW_INTERVAL,due:Date.now()+SM.KNOW_INTERVAL*SM.DAY,lastSeen:Date.now()};}
  else if(quality>=3){p[id]={reps:1,lapses:0,ef:SM.DEFAULT_EF,interval:1,due:Date.now()+SM.DAY,lastSeen:Date.now()};}
  else {p[id]={reps:0,lapses:1,ef:SM.DEFAULT_EF,interval:0,due:Date.now(),lastSeen:Date.now()};}
}
function dueOf(p,id){const v=p[id];if(!v||typeof v==='string')return 0;return v.due||0;}

/* ── Data helpers ── */
function ds(type){return type==='kanji'?S.kanjiItems:S.words;}
function pr(type){return type==='kanji'?S.kanjiProgress:S.progress;}
/* ── Папки ── */
function foldersOf(type){
  const set=new Set(['Общая']);
  ds(type).forEach(w=>set.add(w.folder||'Общая'));
  return[...set];
}
function allFolders(){
  const set=new Set(['Общая']);
  S.words.forEach(w=>set.add(w.folder||'Общая'));
  S.kanjiItems.forEach(w=>set.add(w.folder||'Общая'));
  return[...set];
}
/* ── Ключ дедупликации: слово + чтение ── */
function normKey(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,'');}
function itemKey(w,type){
  return type==='kanji'
    ?normKey(w.kanji)+'\u0000'+normKey(w.on_reading)+'\u0000'+normKey(w.kun_reading)
    :normKey(w.kanji)+'\u0000'+normKey(w.reading);
}
function importTargetFolder(){return(S.importNewFolder?(S.importNewName||'').trim():S.importFolder)||'Общая';}
function filtered(type,filter,count,folders){
  const p=pr(type);
  let arr=[...ds(type)];
  if(folders&&folders.length)arr=arr.filter(w=>folders.includes(w.folder||'Общая'));
  if(filter!=='all')arr=arr.filter(w=>statusOf(p,w.id)===filter);
  // SM-2: для лимита берём сначала просроченные (due<=now), затем добиваем случайными
  if(count&&count!=='all'){
    const n=parseInt(count),now=Date.now();
    const due=shuffle(arr.filter(w=>dueOf(p,w.id)<=now));
    const rest=shuffle(arr.filter(w=>dueOf(p,w.id)>now));
    arr=[...due,...rest].slice(0,n);
  }
  return arr;
}
// «Количество» в квизе: набор записей фиксируется на всю сессию (до «Стоп» / нового старта).
// Внутри набора сначала просроченные по SM-2, затем случайные.
function quizLimit(pool,p){
  const count=S.quizCfg.count;
  if(!count||count==='all')return pool;
  if(!S.quizLimit){
    const now=Date.now();
    const due=shuffle(pool.filter(w=>dueOf(p,w.id)<=now)),rest=shuffle(pool.filter(w=>dueOf(p,w.id)>now));
    S.quizLimit={ids:new Set([...due,...rest].slice(0,parseInt(count)).map(w=>w.id))};
  }
  return pool.filter(w=>S.quizLimit.ids.has(w.id));
}
function shuffle(arr){const a=[...arr];for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function buildStudyQueue(){
  // Карточки: просроченные первыми, далее по lastSeen (давно не виденные раньше)
  const arr=filtered(S.studyCfg.type,S.studyCfg.filter,S.studyCfg.count,S.studyCfg.folders);
  const p=pr(S.studyCfg.type),now=Date.now();
  return arr.sort((a,b)=>{
    const da=dueOf(p,a.id),db=dueOf(p,b.id);
    const aDue=da<=now,bDue=db<=now;
    if(aDue!==bDue)return aDue?-1:1;
    return da-db;
  });
}
function arr(x){return Array.isArray(x)?x:(x==null?[]:[x]);}
// Отображение слова: 'kana' → показываем чтение вместо кандзи-формы (только для слов)
function wordGlyph(w,type){
  if(type==='words'&&S.wordDisplay==='kana'&&w.reading)return w.reading;
  return w.kanji;
}
