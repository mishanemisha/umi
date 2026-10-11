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
/* ── Иконки таббара (Figma «Обновление дизайна» 155:4322): цвет = currentColor ── */
const TAB_SVG={"home": "<svg preserveAspectRatio=\"none\" overflow=\"visible\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><g id=\"&#208;&#147;&#208;&#187;&#208;&#176;&#208;&#178;&#208;&#189;&#208;&#176;&#209;&#143;\" clip-path=\"url(#clip0_0_12)\"><g opacity=\"0.9\"><path d=\"M10.7092 25.5449L11.8519 10.7228L16.3704 11.0712L15.2277 25.8932L10.7092 25.5449Z\" fill=\"currentColor\"/><path d=\"M11.5331 21.3386L30.465 26.1439L29.4974 29.9559L10.5656 25.1506L11.5331 21.3386Z\" fill=\"currentColor\"/><path d=\"M4.0232 2.25733L10.2231 6.80728L8.03368 9.79071L1.83375 5.24075L4.0232 2.25733Z\" fill=\"currentColor\"/><path d=\"M13.7458 1.27434L16.7224 8.36528L13.3102 9.7976L10.3336 2.70666L13.7458 1.27434Z\" fill=\"currentColor\"/><path d=\"M29.3101 5.94862L12.6606 7.84548L12.2417 4.16866L28.8912 2.27179L29.3101 5.94862Z\" fill=\"currentColor\"/><path d=\"M17.7901 30.3152L21.2651 8.4011L25.3153 9.04337L21.8403 30.9575L17.7901 30.3152Z\" fill=\"currentColor\"/><path d=\"M25.7721 26.1098L27.0274 9.82646L30.7171 10.1109L29.4617 26.3943L25.7721 26.1098Z\" fill=\"currentColor\"/><path d=\"M11.8036 11.3023L31.0417 7.92599L31.9256 12.9626L12.6875 16.3389L11.8036 11.3023Z\" fill=\"currentColor\"/><path d=\"M9.41667 17.6959L31.9197 18.0972L31.8537 21.7973L9.35067 21.3959L9.41667 17.6959Z\" fill=\"currentColor\"/><path d=\"M1.81525 9.42727L8.42744 13.3541L6.53782 16.5359L-0.074369 12.6091L1.81525 9.42727Z\" fill=\"currentColor\"/><path d=\"M1.1789 24.2493L7.75331 20.2595L10.3281 24.5023L3.75369 28.4921L1.1789 24.2493Z\" fill=\"currentColor\"/></g></g><defs><clipPath id=\"clip0_0_12\"><rect width=\"32\" height=\"32\" fill=\"white\"/></clipPath></defs></svg>", "words": "<svg preserveAspectRatio=\"none\" overflow=\"visible\" width=\"32\" height=\"32\" viewBox=\"0 0 32 32\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><g id=\"&#208;&#161;&#208;&#187;&#208;&#190;&#208;&#178;&#208;&#176;&#209;&#128;&#209;&#140;\" clip-path=\"url(#clip0_0_5)\"><g opacity=\"0.9\"><path d=\"M-0.229417 4.55651L8.75141 2.8963L9.75691 8.33548L0.776077 9.99569L-0.229417 4.55651Z\" fill=\"currentColor\"/><path d=\"M11.5357 2.86507L31.2089 2.46417L31.3363 8.71956L11.6632 9.12047L11.5357 2.86507Z\" fill=\"currentColor\"/><path d=\"M12.0029 11.1069L31.6457 12.2708L31.1785 20.1554L11.5357 18.9914L12.0029 11.1069Z\" fill=\"currentColor\"/><path d=\"M11.7086 21.7255L31.3591 20.7003L31.7706 28.5879L12.1201 29.6131L11.7086 21.7255Z\" fill=\"currentColor\"/><path d=\"M1.09695 12.29L10.1799 13.9436L9.18917 19.3855L0.106213 17.7319L1.09695 12.29Z\" fill=\"currentColor\"/><path d=\"M0.318433 22.3719L9.80073 22.5111L9.71954 28.0419L0.237244 27.9027L0.318433 22.3719Z\" fill=\"currentColor\"/></g></g><defs><clipPath id=\"clip0_0_5\"><rect width=\"32\" height=\"32\" fill=\"white\"/></clipPath></defs></svg>", "practice": "<svg preserveAspectRatio=\"none\" overflow=\"visible\" width=\"29.6\" height=\"30.3111\" viewBox=\"0 0 29.6 30.3111\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><g><path opacity=\"0.6\" d=\"M5.33333 30.3111L0 22.4889L20.2667 20L25.6 27.8222L5.33333 30.3111Z\" fill=\"currentColor\"/><path opacity=\"0.6\" d=\"M9.33333 25.3111L4 17.4889L24.2667 15L29.6 22.8222L9.33333 25.3111Z\" fill=\"currentColor\"/><path opacity=\"0.6\" d=\"M5.33333 16.3111L0 8.48889L20.2667 6L25.6 13.8222L5.33333 16.3111Z\" fill=\"currentColor\"/><path opacity=\"0.6\" d=\"M5.33333 10.3111L0 2.48889L20.2667 0L25.6 7.82222L5.33333 10.3111Z\" fill=\"#1D1D1D\"/></g></svg>", "settings": "<svg preserveAspectRatio=\"none\" overflow=\"visible\" width=\"32\" height=\"32.7121\" viewBox=\"0 0 32 32.7121\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\"><g opacity=\"0.9\"><path d=\"M13.1919 2.6507L25.4875 8.66521L22.9326 13.8882L10.637 7.87365L13.1919 2.6507Z\" fill=\"currentColor\"/><path d=\"M22.0461 6.26495L28.4249 18.3756L23.2805 21.0852L16.9017 8.97453L22.0461 6.26495Z\" fill=\"currentColor\"/><path d=\"M29.6466 17.068L21.3583 27.9611L16.7311 24.4404L25.0194 13.5473L29.6466 17.068Z\" fill=\"currentColor\"/><path d=\"M20.6369 29.3208L7.26371 26.4026L8.50331 20.7219L21.8764 23.6401L20.6369 29.3208Z\" fill=\"currentColor\"/><path d=\"M6.80708 25.7127L3.81015 12.357L9.4834 11.0839L12.4803 24.4396L6.80708 25.7127Z\" fill=\"currentColor\"/><path d=\"M3.81016 12.0472L14.6543 3.69479L18.2022 8.30115L7.35809 16.6535L3.81016 12.0472Z\" fill=\"currentColor\"/><path d=\"M3.5033 15.0684L3.40837 7.12852L9.22228 7.05901L9.3172 14.9989L3.5033 15.0684Z\" fill=\"currentColor\"/><path d=\"M11.0433 3.3774L18.2297 0L20.7027 5.26215L13.5164 8.63955L11.0433 3.3774Z\" fill=\"currentColor\"/><path d=\"M22.1401 5.5012L29.6134 8.18439L27.6487 13.6567L20.1753 10.9735L22.1401 5.5012Z\" fill=\"currentColor\"/><path d=\"M25.9038 15.4034L29.3007 22.5805L24.0453 25.0679L20.6484 17.8907L25.9038 15.4034Z\" fill=\"currentColor\"/><path d=\"M22.5818 27.653L16.4616 32.7121L12.7572 28.2307L18.8773 23.1716L22.5818 27.653Z\" fill=\"currentColor\"/><path d=\"M8.24303 26.0747L1.28765 22.2441L4.09255 17.1511L11.0479 20.9816L8.24303 26.0747Z\" fill=\"currentColor\"/><path d=\"M15.6598 9.69582L7.85257 8.24735L8.9132 2.53058L16.7204 3.97905L15.6598 9.69582Z\" fill=\"currentColor\"/><path d=\"M20.9714 12.2136L19.0535 4.50822L24.6957 3.1039L26.6136 10.8092L20.9714 12.2136Z\" fill=\"currentColor\"/><path d=\"M22.9302 18.7684L27.0133 11.9583L32 14.9481L27.9169 21.7583L22.9302 18.7684Z\" fill=\"currentColor\"/><path d=\"M17.0946 25.3554L24.7948 23.4166L26.2144 29.055L18.5143 30.9937L17.0946 25.3554Z\" fill=\"currentColor\"/><path d=\"M10.7676 21.5647L14.5421 28.5506L9.42672 31.3145L5.65217 24.3286L10.7676 21.5647Z\" fill=\"currentColor\"/><path d=\"M9.55961 12.8493L4.45152 18.9286L0 15.1882L5.1081 9.10892L9.55961 12.8493Z\" fill=\"currentColor\"/></g></svg>"};



// фильтры упражнений v3: каталог из verb_exercise_filters_v3_ru.csv (kind: form | modifier | register)
const VERB_CAT_BY_ID={};VERB_CATS_DATA.forEach(c=>{VERB_CAT_BY_ID[c.v]=c;});
const VERB_CATS_DEFAULT=['dictionary','masu','te_form','ta_form','nai_form','conditional','tai'];
const VERB_ICON='assets/verb.png';
const MATCH_ICON='assets/match.png';
const COUNTS=['all','20','50','100'];

/* ── State ── */
const S={
  tab:'home', homeTab:'words', testsSubTab:'cards',
  wordsTab:'words', wordsSearch:'', wordsFolder:'all', wordsLimit:300, kanjiView:'grid',
  selecting:false, selIds:[], selSheet:false,
  words:[], progress:{},
  kanjiItems:[], kanjiProgress:{},
  wordsCsv:'', kanjiCsv:'',
  studyQueue:[], studyIdx:0, cardFlipped:false, studyResults:null,
  studyCfg:{type:'words',front:['kanji'],back:['reading','meaning'],filter:'all',count:'all',folders:[]},
  quizCfg:{type:'words',mode:'choice6',question:['kanji'],answer:['reading'],filter:'all',count:'all',folders:[],composeShow:{reading:true,meaning:false},composeMode:'normal',ultraDifficulty:'all',
    verbStyle:'both',verbMode:'A',verbLevel:'medium',verbSource:'all',verbCats:VERB_CATS_DEFAULT.slice(),
    matchLeft:['meaning'],matchRight:['kanji','reading'],matchSenses:'one'},
  quizQ:null, quizLimit:null, quizSeen:{}, quizRound:0, quizScore:{ok:0,bad:0}, quizDone:false, quizSel:-1, quizInputVal:'',
  quizHint:false, cardHint:false, quizRecent:[],
  wordDisplay:'full', // 'full' — слово целиком (кандзи), 'kana' — только кана
  hintsEnabled:true,  // подсказки в квизе/карточках кандзи (можно выключить в настройках)
  cfgScreen:null,     // 'cards' | 'quiz' — экран настроек режима (формы глаголов из практики)
  homeOpen:null,      // раскрытая карточка режима на главной: 'cards' | 'quiz' | 'quiz-compose' | 'quiz-pairs' | 'quiz-match'
  homeAnim:null,      // карточка, раскрытая только что (анимация и прокрутка один раз)
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
    // «Количество» в новом дизайне: Все / 20 / 50 / 100
    if(!COUNTS.includes(S.studyCfg.count))S.studyCfg.count='all';
    if(!COUNTS.includes(S.quizCfg.count))S.quizCfg.count='all';
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
// Запись живёт в основной папке (folder) и может входить в дополнительные (folders) —
// их создаёт выбор в словаре и повторный импорт той же записи в другую папку.
function itemFolders(w){const f=[w.folder||'Общая'];(w.folders||[]).forEach(x=>{if(!f.includes(x))f.push(x);});return f;}
function inFolder(w,f){return itemFolders(w).includes(f);}
function addToFolder(w,f){if(inFolder(w,f))return false;(w.folders=w.folders||[]).push(f);return true;}
function foldersOf(type){
  const set=new Set(['Общая']);
  ds(type).forEach(w=>itemFolders(w).forEach(f=>set.add(f)));
  return[...set];
}
function allFolders(){
  const set=new Set(['Общая']);
  [...S.words,...S.kanjiItems].forEach(w=>itemFolders(w).forEach(f=>set.add(f)));
  return[...set];
}
/* ── Ключ дедупликации: слово + чтение ── */
function normKey(s){return String(s||'').trim().toLowerCase().replace(/\s+/g,'');}
function itemKey(w,type){
  return type==='kanji'
    ?normKey(w.kanji)+'\u0000'+normKey(w.on_reading)+'\u0000'+normKey(w.kun_reading)
    :normKey(w.kanji)+'\u0000'+normKey(w.reading);
}
function importMatchKey(w,type){return type==='kanji'?normKey(w.kanji):itemKey(w,'words');}
function importTargetFolder(){return(S.importNewFolder?(S.importNewName||'').trim():S.importFolder)||'Общая';}
function filtered(type,filter,count,folders){
  const p=pr(type);
  let arr=[...ds(type)];
  if(folders&&folders.length)arr=arr.filter(w=>folders.some(f=>inFolder(w,f)));
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
// Набор квиза фиксируется при старте сессии (до «Стоп» / нового старта): фильтр статуса
// и «Количество» применяются один раз. Иначе ответы переводят записи из «Не знаю» в «Учу»,
// и набор тает посреди тренировки. Внутри лимита — сначала просроченные по SM-2.
function quizLimit(pool,p){
  if(!S.quizLimit){
    const{filter,count}=S.quizCfg;
    let arr=filter&&filter!=='all'?pool.filter(w=>statusOf(p,w.id)===filter):pool;
    if(count&&count!=='all'){
      const now=Date.now();
      const due=shuffle(arr.filter(w=>dueOf(p,w.id)<=now)),rest=shuffle(arr.filter(w=>dueOf(p,w.id)>now));
      arr=[...due,...rest].slice(0,parseInt(count));
    }
    S.quizLimit={ids:new Set(arr.map(w=>w.id))};
  }
  return pool.filter(w=>S.quizLimit.ids.has(w.id));
}
// Давно не показанные — первыми (для раундов из нескольких записей: пары, сопоставление)
function leastRecent(pool){
  const seen=S.quizSeen||{};
  return shuffle(pool).sort((a,b)=>(seen[a.id]||0)-(seen[b.id]||0));
}
function markSeen(ids){
  S.quizSeen=S.quizSeen||{};S.quizRound=(S.quizRound||0)+1;
  ids.forEach(id=>{S.quizSeen[id]=S.quizRound;});
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
