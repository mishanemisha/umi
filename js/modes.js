'use strict';
// Построение вопросов: квиз, мультиполя, составление слов, пары, сопоставление, формы глаголов
/* ── #2 Меньше повторов + больше рандома ──
 * Исключаем недавно показанные, дальше — просроченные вперёд, внутри тира случайно. */
function rankPool(pool,type){
  const now=Date.now(),pp=pr(type),rec=S.quizRecent||[];
  let cand=pool.filter(w=>!rec.includes(w.id));
  if(!cand.length)cand=pool.slice(); // все недавно были — берём всех
  const dueP=shuffle(cand.filter(w=>dueOf(pp,w.id)<=now));
  const restP=shuffle(cand.filter(w=>dueOf(pp,w.id)>now));
  return[...dueP,...restP];
}
function noteRecent(id,poolSize){
  if(!id)return;
  S.quizRecent=S.quizRecent||[];
  S.quizRecent.push(id);
  const cap=Math.max(1,Math.min(15,(poolSize||1)-1));
  while(S.quizRecent.length>cap)S.quizRecent.shift();
}

function buildQuizQ(){
  const{type,mode,filter}=S.quizCfg;
  const af=arr(S.quizCfg.answer)[0];
  const qFields=arr(S.quizCfg.question);
  const optN=(mode==='choice4'?4:6);
  const pool=quizLimit(filtered(type,filter,'all',S.quizCfg.folders).filter(w=>w[af]&&qFields.some(f=>w[f])),pr(type));
  if(pool.length<2)return null;
  const all=ds(type).filter(w=>w[af]);
  if(all.length<optN)return null;
  const qw=rankPool(pool,type)[0];
  if(!qw)return null;
  noteRecent(qw.id,pool.length);
  // Wrongs must be unique and != correct
  const correctVal=qw[af];
  const wrongPool=[];
  const seen=new Set([correctVal]);
  for(const w of shuffle(all)){
    if(w.id===qw.id)continue;
    if(seen.has(w[af]))continue;
    seen.add(w[af]);
    wrongPool.push(w[af]);
    if(wrongPool.length>=optN-1)break;
  }
  if(wrongPool.length<optN-1)return null;
  const options=shuffle([correctVal,...wrongPool]);
  const mixInput=mode==='mix'?Math.random()<0.5:null;
  return{word:qw,qFields,aField:af,options,correct:options.indexOf(correctVal),mixInput};
}
/* ── #3 Мультиполевой квиз ──
 * «Что отгадываем» — мультивыбор. На каждое выбранное поле своя группа
 * вариантов (или поле ввода). Заменяет прежний режим «Все три». */
function buildMultiQ(){
  const{type,mode,filter,count}=S.quizCfg;
  const qFields=arr(S.quizCfg.question);
  const aFields=arr(S.quizCfg.answer).filter(Boolean);
  const optN=mode==='choice4'?4:6;
  const all=ds(type);
  const pool=quizLimit(filtered(type,filter,'all',S.quizCfg.folders)
    .filter(w=>qFields.some(f=>w[f])&&aFields.some(f=>w[f])),pr(type));
  if(pool.length<2)return null;
  const qw=rankPool(pool,type)[0];
  if(!qw)return null;
  noteRecent(qw.id,pool.length);
  const useInput=mode==='input'||(mode==='mix'&&Math.random()<0.5);
  const groups=[];
  for(const f of aFields){
    const correct=qw[f];if(!correct)continue;
    let options=null,correctIdx=-1;
    if(!useInput){
      const seen=new Set([correct]);const distract=[];
      for(const w of shuffle(all)){
        if(w.id===qw.id||!w[f]||seen.has(w[f]))continue;
        seen.add(w[f]);distract.push(w[f]);
        if(distract.length>=optN-1)break;
      }
      options=shuffle([correct,...distract]);
      correctIdx=options.indexOf(correct);
    }
    groups.push({field:f,correct,options,correctIdx});
  }
  if(!groups.length)return null;
  return{multi:true,word:qw,qFields,aFields,mode,useInput,groups,picks:{},inputs:{}};
}
/* ── Compose mode (Figma: Составить слова) ──
 * Слово из 2–3 кандзи собирается из 6 иероглифов. */
function isKanjiChar(c){const n=c.codePointAt(0);return(n>=0x4e00&&n<=0x9fff)||(n>=0x3400&&n<=0x4dbf)||(n>=0xf900&&n<=0xfaff);}
function kanjiChars(str){return[...String(str||'')].filter(isKanjiChar);}

/* ── Мэтчинг встроенного банка слов с загруженным словарём кандзи ── */
function userKanjiSet(){
  const s=new Set();
  S.kanjiItems.forEach(k=>{const c=String(k.kanji||'');if([...c].length===1)s.add(c);});
  return s;
}
// Слово подходит, если все его кандзи есть в загруженном словаре кандзи
function wordMatchesKanji(word,ks){
  const kc=kanjiChars(word);
  return kc.length>0&&kc.every(c=>ks.has(c));
}
// Пример-слова для иероглифа: только встроенный банк из CSV (по загруженным кандзи)
function exampleWords(ch){
  const ks=userKanjiSet(),out=[],seen=new Set();
  BUILTIN_WORDS.forEach(bw=>{
    if(seen.has(bw.w)||bw.w===ch||![...bw.w].includes(ch))return;
    if(!wordMatchesKanji(bw.w,ks))return;
    seen.add(bw.w);out.push({kanji:bw.w,reading:bw.r});
  });
  return out;
}
// Встроенные слова 2–3 кандзи, все кандзи которых загружены — источник для «Составить слова»
function builtinComposeWords(){
  const ks=userKanjiSet();
  return BUILTIN_WORDS.filter(bw=>{
    const ch=[...bw.w];
    return ch.length>=2&&ch.length<=3&&ch.every(isKanjiChar)&&ch.every(c=>ks.has(c));
  }).map(bw=>({id:'bw_'+bw.w,kanji:bw.w,reading:bw.r,meaning:bw.m,seg:bw.k||null,folder:'Общая',_builtin:true}));
}
// Числовые кандзи — слова с ними скрываем из ultra (数字 малополезны: «один человек» и т.п.).
// Считаем только по символам самого слова, не по чтениям.
const NUM_KANJI=new Set([...'一二三四五六七八九十']);
// Ultra: слова из additional-банка. Известность считаем ПО ИМПОРТУ юзера:
// в слове должен быть ≥1 незнакомый кандзи (нет в импорте — он «стоит» на месте
// как учимый) и ≥1 знакомый (есть в импорте — его юзер подставляет по значению).
function ultraComposeWords(){
  const ks=userKanjiSet();
  const diff=S.quizCfg.ultraDifficulty||'all';
  return ADDITIONAL_WORDS.filter(w=>{
    if(diff!=='all'&&w.d!==diff)return false;
    const ch=[...w.w];
    if(ch.some(c=>NUM_KANJI.has(c)))return false; // скрываем слова с числовыми кандзи
    if(ch.length<2||ch.length>3||!ch.every(isKanjiChar))return false;
    const unknown=ch.filter(c=>!ks.has(c)).length;
    const known=ch.filter(c=>ks.has(c)).length;
    return unknown>=1&&known>=1;
  }).map(w=>({id:'aw_'+w.w,kanji:w.w,reading:w.r,meaning:w.m,seg:w.k||null,folder:'Общая',_ultra:true}));
}
function buildComposeQ(){
  const{filter}=S.quizCfg;
  const mode=S.quizCfg.composeMode||'normal';
  const reverse=mode==='reverse',ultra=mode==='ultra';
  const p=pr('words');
  let matched=ultra?ultraComposeWords():builtinComposeWords();
  // reverse (собрать кану) требует сегментов чтения по кандзи
  if(reverse)matched=matched.filter(w=>w.seg&&w.seg.length>=2);
  let pool=matched;
  if(filter!=='all')pool=pool.filter(w=>statusOf(p,w.id)===filter);
  pool=quizLimit(pool,p);
  if(!pool.length)return null;
  const qw=rankPool(pool,'words')[0];
  if(!qw)return null;
  noteRecent(qw.id,pool.length);
  if(reverse){
    const target=qw.seg.map(s=>s.r);
    const bag=new Set();
    matched.forEach(w=>{if(w.id===qw.id)return;(w.seg||[]).forEach(s=>{if(!target.includes(s.r))bag.add(s.r);});});
    const distract=shuffle([...bag]);
    const need=Math.max(0,6-target.length);
    const options=shuffle([...target,...distract.slice(0,need)]);
    if(options.length<target.length+1)return null;
    return{compose:true,reverse:true,word:qw,target,options,picks:[],result:null};
  }
  if(ultra){
    const ks=userKanjiSet();
    // позиции слова: незнакомые (нет в импорте) — стоят; знакомые — слоты для подстановки
    const positions=[...qw.kanji].map(c=>({c,known:ks.has(c)}));
    const target=positions.filter(pp=>pp.known).map(pp=>pp.c); // знакомые кандзи по порядку — их выбирает юзер
    // дистракторы — только знакомые кандзи (из импорта юзера)
    const bag=new Set([...ks].filter(c=>!target.includes(c)));
    const distract=shuffle([...bag]);
    const need=Math.max(0,6-target.length);
    const options=shuffle([...target,...distract.slice(0,need)]);
    if(!target.length||options.length<target.length+1)return null;
    return{compose:true,ultra:true,word:qw,positions,target,options,picks:[],result:null};
  }
  // normal: собираем всё слово из кандзи
  const target=[...qw.kanji];
  const bag=new Set();
  matched.forEach(w=>{[...w.kanji].forEach(c=>{if(!target.includes(c))bag.add(c);});});
  const distract=shuffle([...bag]);
  const need=Math.max(0,6-target.length);
  const options=shuffle([...target,...distract.slice(0,need)]);
  if(options.length<target.length+1)return null;
  return{compose:true,reverse:false,word:qw,target,options,picks:[],result:null};
}

/* ── Pairs mode (Figma: Выбери пару) ──
 * Пул из пар кандзи с одинаковым он-чтением. */
function onKey(s){
  const t=String(s||'').split(/[、・,\s]+/).filter(Boolean)[0]||'';
  // хирагана → катакана, чтобы группировать одинаково
  return[...t].map(c=>{const cc=c.charCodeAt(0);return(cc>=0x3041&&cc<=0x3096)?String.fromCharCode(cc+0x60):c;}).join('');
}
function buildPairsQ(){
  const{filter}=S.quizCfg;
  const pool=quizLimit(filtered('kanji',filter,'all',S.quizCfg.folders).filter(w=>w.on_reading&&onKey(w.on_reading)),pr('kanji'));
  const groups={};
  shuffle(pool).forEach(w=>{const k=onKey(w.on_reading);(groups[k]=groups[k]||[]).push(w);});
  let pairs=Object.values(groups).filter(g=>g.length>=2).map(g=>shuffle(g).slice(0,2));
  if(pairs.length<2)return null;
  pairs=shuffle(pairs).slice(0,5);
  const options=[];
  pairs.forEach((g,pi)=>g.forEach(w=>options.push({
    id:w.id,kanji:w.kanji,on:onKey(w.on_reading),onRaw:w.on_reading,
    meaning:(String(w.meaning||'').split(/;/)[0]||'').trim(),pairId:pi,
  })));
  return{pairs:true,options:shuffle(options),total:pairs.length,found:[],firstPick:null,result:null,wrong:0};
}

/* ── Сопоставь пары (Duolingo-style match) ──
 * Две колонки по 6 плиток из пользовательской базы: слева и справа — наборы полей
 * из настроек (значение ↔ слово/кана, у кандзи — он/кун в любых сочетаниях). */
const MATCH_MAX=6;
// значения: одно основное или все (чтобы плитку не раздувало).
// Режем по ; ； 、 и запятой, но только вне скобок — «идти (о дожде, снеге)» остаётся одним значением.
function mSplit(v){
  const out=[];let cur='',d=0;
  for(const ch of String(v||'')){
    if('(（[（'.includes(ch))d++;
    else if(')）]'.includes(ch))d=Math.max(0,d-1);
    if(d===0&&';；、,'.includes(ch)){out.push(cur);cur='';continue;}
    cur+=ch;
  }
  out.push(cur);
  return out.map(x=>x.trim()).filter(Boolean);
}
function mSenses(v){
  const parts=mSplit(v);
  return(S.quizCfg.matchSenses==='all'?parts:parts.slice(0,1)).join(', ');
}
// одна сторона плитки: первое поле — крупно, остальные — подписью
function mSide(w,fields){
  const parts=[];
  fields.forEach(f=>{
    const v=(f==='meaning'||f==='translation')?mSenses(w[f]):String(w[f]||'').trim();
    if(v)parts.push({f,v});
  });
  if(!parts.length)return null;
  const html=parts.map((p,i)=>i
    ?`<span class="mt-sub">${esc(p.v)}</span>`
    :`<span class="mt-main${p.f==='kanji'?' jp':''}">${esc(p.v)}</span>`).join('');
  return{key:parts.map(p=>p.f+'\u0001'+p.v).join('\u0002'),html};
}
function buildMatchQ(){
  const{type,filter}=S.quizCfg;
  const left=arr(S.quizCfg.matchLeft),right=arr(S.quizCfg.matchRight);
  if(!left.length||!right.length)return null;
  const base=quizLimit(filtered(type,filter,'all',S.quizCfg.folders).filter(w=>left.some(f=>w[f])&&right.some(f=>w[f])),pr(type));
  // сначала записи, где заполнены все выбранные поля; если таких мало — добираем частичными
  const full=base.filter(w=>left.every(f=>w[f])&&right.every(f=>w[f]));
  let pool=full;
  if(full.length<MATCH_MAX){
    const has=new Set(full.map(w=>w.id));
    pool=[...full,...base.filter(w=>!has.has(w.id)&&left.some(f=>w[f])&&right.some(f=>w[f]))];
  }
  // дубли по тексту любой из сторон исключаем — иначе пара неоднозначна
  const seenL=new Set(),seenR=new Set(),items=[];
  for(const w of shuffle(pool)){
    const l=mSide(w,left),r=mSide(w,right);
    if(!l||!r||l.key===r.key||seenL.has(l.key)||seenR.has(r.key))continue;
    seenL.add(l.key);seenR.add(r.key);
    items.push({id:w.id,l,r});
    if(items.length>=MATCH_MAX)break;
  }
  if(items.length<3)return null;
  const ids=items.map((_,i)=>i);
  return{match:true,items,colL:shuffle(ids),colR:shuffle(ids),
         solved:[],selL:null,selR:null,bad:null,miss:{},wrong:0};
}

/* ── Формы глаголов (conjugation) ──
 * Глагол + задание из флагов; собрать нужную форму из окончаний. */
const VERB_CATS=VERB_CATS_DATA;
// токен-шаблона → ключ поверхностной формы конкретного глагола (verb.cj)
const VERB_STEM={BASE:'base',NEGBASE:'neg',DICT_M:'dm',DICT_H:'dh',MASU_LINK:'ml',NAI_LINK:'nl',
 BA_M:'bam',BA_H:'bah',TE_M:'tem',TE_H:'teh',TA_M:'tam',TA_H:'tah',POT_M:'potm',POT_H:'poth',
 PASS_M:'pasm',PASS_H:'pash',CAUSE_M:'caum',CAUSE_H:'cauh',CAUSEPASS_M:'cpm',CAUSEPASS_H:'cph',
 IMP_M:'impm',IMP_H:'imph',VOL_M:'volm',VOL_H:'volh',RANUKI_M:'ranm',RANUKI_H:'ranh'};
const LVL={easy:'e',medium:'m',hard:'h'};
// путающие окончания て/た-форм: варианты из других групп спряжения (て vs って vs いて…).
// нужны как дистракторы к слоту-основе TE_M/TA_H — иначе выбор угадывается без знания формы.
const STEM_CONFUSE={
  TE_M:['て','って','いて','いで','して','んで'],TE_H:['て','って','いて','いで','して','んで'],
  TA_M:['た','った','いた','いだ','した','んだ'],TA_H:['た','った','いた','いだ','した','んだ']};
// один токен → {jp, stem} (stem=часть основы глагола, иначе универсальная карточка)
function vbResolve(v,tok){
  if(VERB_STEM[tok]!=null)return{jp:v.cj[VERB_STEM[tok]]||'',stem:true};
  const c=VERB_CH[tok];return{jp:c?c.j:'',stem:false};
}
// gate v3: verb_gate_column правила (rule.g) против train_* глагола.
// verb.x — список закрытых gate-суффиксов; напр. у 降る нет passive/causative/imperative.
function vbGateOk(v,rule){return !(rule.g&&v.x&&v.x.indexOf(rule.g)>=0);}
// доступна ли форма у глагола: если нужный кусок основы пуст (колонка отсутствует) — формы нет.
// '∅' (чтение меняется, символ не добавляется — kuru/suru) считается валидным, '' — нет.
function vbFormAvail(v,rule,lvl){
  if(!vbGateOk(v,rule))return false;
  const tmpl=rule[lvl]||rule.m;
  for(const card of tmpl.split('|'))for(let t of card.split('+')){
    t=t.trim();
    if(VERB_STEM[t]!=null){const val=v.cj[VERB_STEM[t]];if(val==null||val==='')return false;}
  }
  return true;
}
// шаблон → массив карточек [{jp, stem, toks}] (| = карточка, + = склейка, пустые/∅ отбрасываем).
// на hard-уровне сами куски основы могут содержать внутренний | (напр. пассив か|れ) — тоже дробим.
function vbCards(v,rule,lvl){
  const tmpl=rule[lvl]||rule.m,out=[];
  tmpl.split('|').forEach(card=>{
    let jp='',stem=false;const toks=[];
    card.split('+').forEach(t=>{t=t.trim();const r=vbResolve(v,t);if(r.jp&&r.jp!=='∅'){jp+=r.jp;toks.push(t);if(r.stem)stem=true;}});
    jp.split('|').forEach(part=>{if(part)out.push({jp:part,stem,toks});});
  });
  return out;
}
// русское задание из формы (иногда — альтернативный вариант, напр. «тогда не мог пойти»)
function vbTask(v,rule){
  let tmpl=rule.tp;
  if(rule.al&&Math.random()<0.4)tmpl=rule.al;
  return tmpl.replace(/\{ru_([a-z0-9_]+)\}/g,(m,k)=>v.ru[k]||('{'+k+'}'));
}
// дистракторы для одной карточки-слота
function vbCardDistractors(v,card){
  const pool=new Set();
  // て/た-окончание → путающие формы других групп (て・って・いて・いで・して・んで);
  // прочие stem-слоты (потенциал/пассив/…) — одиночные каны ряда из v.sd
  const confTok=card.toks.find(t=>STEM_CONFUSE[t]);
  if(confTok){ STEM_CONFUSE[confTok].forEach(x=>{if(x!==card.jp)pool.add(x);}); }
  else if(card.stem){ (v.sd||[]).forEach(x=>{if(x!==card.jp)pool.add(x);}); }
  card.toks.forEach(t=>{
    const c=VERB_CH[t];if(!c)return;
    (c.c||[]).forEach(cf=>{const d=VERB_CH[cf];if(d&&d.j!==card.jp)pool.add(d.j);});
    for(const k in VERB_CH){const o=VERB_CH[k];if(o.f===c.f&&o.j!==card.jp)pool.add(o.j);}
  });
  return shuffle([...pool]);
}
// матч правила и чипа-фильтра по колонке из каталога
function vbCatMatch(rule,c){
  if(c.c==='filter_form_tags')return rule.ff.indexOf(c.mv)>=0;
  if(c.c==='filter_semantic_tags')return rule.fs.indexOf(c.mv)>=0;
  if(c.c==='filter_register_tags')return rule.fr.indexOf(c.mv)>=0;
  if(c.c==='filter_question')return String(rule.fq)===String(c.mv);
  return false;
}
// exact → fallback (verb_training_logic_v3.md): сначала пересечение «любая выбранная форма
// + все выбранные модификаторы»; если пересечения нет — объединяем правила выбранных форм
// и правила выбранных модификаторов, чтобы упражнение не обнулилось.
// filter_default_pool=0 (rare/ら抜き) подключается только вместе с register-чипом «Разговорные».
function vbPool(extra){
  const sel=(S.quizCfg.verbCats||[]).map(v=>VERB_CAT_BY_ID[v]).filter(Boolean);
  const forms=sel.filter(c=>c.k==='form'),mods=sel.filter(c=>c.k!=='form');
  const rare=sel.some(c=>c.k==='register');
  const base=VERB_RULES.filter(r=>vbStyleOk(r)&&(r.fp||rare)&&(!extra||extra(r)));
  const exact=base.filter(r=>(!forms.length||forms.some(c=>vbCatMatch(r,c)))&&mods.every(c=>vbCatMatch(r,c)));
  if(exact.length)return exact;
  const union=base.filter(r=>forms.some(c=>vbCatMatch(r,c))||mods.some(c=>vbCatMatch(r,c)));
  return union.length?union:base;
}
function vbStyleOk(rule){
  const st=S.quizCfg.verbStyle;
  if(rule.st==='-')return true;               // нейтральные (て-форма, условные) — всегда
  if(st==='plain')return rule.st==='plain';
  if(st==='polite')return rule.st==='polite';
  return true;                                // both
}
// банк глаголов с учётом настройки «Знакомые / Все»
function vbActiveBank(){
  if(S.quizCfg.verbSource==='known'){
    const set=new Set(S.words.map(w=>String(w.kanji||'').trim()).filter(Boolean));
    const f=VERB_BANK.filter(v=>set.has(v.d));
    if(f.length)return f;
  }
  return VERB_BANK;
}
// банк, суженный до глаголов, которые проходят хотя бы один gate доступных форм:
// иначе узкие gate'ы (passive — 52 глагола из 458) тратят все 40 попыток впустую
function vbGateBank(bank,forms){
  const f=bank.filter(v=>forms.some(r=>vbGateOk(v,r)));
  return f.length?f:bank;
}
function buildVerbQ(){
  if(S.quizCfg.verbMode==='B')return buildVerbQB();
  const lvl=LVL[S.quizCfg.verbLevel]||'m';
  const forms=vbPool();
  const bank=vbGateBank(vbActiveBank(),forms);
  if(!bank.length||!forms.length)return null;
  const rec=S.quizRecent||[];
  // до 40 попыток найти корректную (>=1 слот, форма существует у глагола) не-недавнюю пару
  let v,rule,cards,task;
  for(let att=0;att<40;att++){
    const cv=shuffle(bank)[0],cr=shuffle(forms)[0];
    if(!vbFormAvail(cv,cr,lvl))continue;       // формы нет у глагола (напр. ら抜き у годан)
    const cc=vbCards(cv,cr,lvl);
    if(cc.length<2)continue;                  // нужна хотя бы основа + 1 слот
    const tk=vbTask(cv,cr);
    if(!tk||tk.indexOf('—')>=0||tk.indexOf('∅')>=0||/\{/.test(tk))continue; // у глагола нет такой формы
    if(rec.includes(cv.id+'|'+cr.id+'|'+lvl)&&att<28)continue;
    v=cv;rule=cr;cards=cc;task=tk;break;
  }
  if(!cards)return null;
  noteRecent(v.id+'|'+rule.id+'|'+lvl,bank.length*forms.length);
  const stem=cards[0];                         // основа — показана в канвасе
  const slotCards=cards.slice(1);              // слоты, которые собирает юзер
  const target=slotCards.map(c=>c.jp);
  const opts=[...target];const used=new Set(target);
  const cap=target.length+5;
  slotCards.forEach(c=>{for(const d of vbCardDistractors(v,c)){if(opts.length>=cap)break;if(!used.has(d)){opts.push(d);used.add(d);}}});
  // добор случайными универсальными окончаниями, если мало
  if(opts.length<target.length+3){const keys=shuffle(Object.keys(VERB_CH));for(const k of keys){if(opts.length>=target.length+3)break;const j=VERB_CH[k].j;if(!used.has(j)){opts.push(j);used.add(j);}}}
  const options=shuffle(opts);
  return{verbs:true,verb:v,rule,level:lvl,stem,cards,target,options,picks:[],result:null,task};
}

// Mode B: показываем только смысл, принимаем несколько грамматических конструкций.
// Группируем формы по mode_b_semantic_key; принимаем любую сборку из группы, что резолвится
// для глагола и имеет ту же основу. Длина ответа варьируется → проверка по кнопке «Проверить».
function seqEq(a,b){return a.length===b.length&&a.every((x,i)=>x===b[i]);}
function buildVerbQB(){
  const lvl=LVL[S.quizCfg.verbLevel]||'m';
  const forms=vbPool(r=>r.mb);
  const bank=vbGateBank(vbActiveBank(),forms);
  if(!bank.length||!forms.length)return null;
  const rec=S.quizRecent||[];
  let v,rule,stem,accepted,task;
  for(let att=0;att<40;att++){
    const cv=shuffle(bank)[0],cr=shuffle(forms)[0];
    if(!vbFormAvail(cv,cr,lvl))continue;
    const primary=vbCards(cv,cr,lvl);
    if(primary.length<2)continue;
    const tk=vbTask(cv,cr);
    if(!tk||tk.indexOf('—')>=0||tk.indexOf('∅')>=0||/\{/.test(tk))continue;
    if(rec.includes('B|'+cv.id+'|'+cr.mk+'|'+lvl)&&att<28)continue;
    // группа: все mode_b-формы с тем же смысловым ключом (включая саму)
    const group=VERB_RULES.filter(r=>r.mb&&r.mk===cr.mk&&vbGateOk(cv,r));
    const acc=[];const seen=new Set();
    group.forEach(g=>{
      if(!vbFormAvail(cv,g,lvl))return;             // напр. ら抜き недоступна годан-глаголу
      const cc=vbCards(cv,g,lvl);
      if(cc.length<2)return;
      if(cc[0].jp!==primary[0].jp)return;          // общая основа со стволом задания
      const seq=cc.slice(1).map(c=>c.jp),key=seq.join('');
      if(seen.has(key))return;seen.add(key);
      acc.push({id:g.id,seq});
    });
    if(!acc.length)continue;
    v=cv;rule=cr;stem=primary[0];accepted=acc;task=tk;break;
  }
  if(!accepted)return null;
  noteRecent('B|'+v.id+'|'+rule.mk+'|'+lvl,bank.length*forms.length);
  // банк: объединение чипов всех принимаемых ответов (с нужной кратностью) + дистракторы
  const need={};
  accepted.forEach(a=>{const cnt={};a.seq.forEach(j=>{cnt[j]=(cnt[j]||0)+1;});for(const j in cnt)need[j]=Math.max(need[j]||0,cnt[j]);});
  const opts=[];Object.keys(need).forEach(j=>{for(let i=0;i<need[j];i++)opts.push(j);});
  const maxLen=Math.max(...accepted.map(a=>a.seq.length));
  const used=new Set(opts);const cap=opts.length+5;
  // дистракторы — из семейств чипов первого принимаемого ответа
  const primaryCards=vbCards(v,rule,lvl).slice(1);
  primaryCards.forEach(c=>{for(const d of vbCardDistractors(v,c)){if(opts.length>=cap)break;if(!used.has(d)){opts.push(d);used.add(d);}}});
  if(opts.length<maxLen+3){const keys=shuffle(Object.keys(VERB_CH));for(const k of keys){if(opts.length>=maxLen+3)break;const j=VERB_CH[k].j;if(!used.has(j)){opts.push(j);used.add(j);}}}
  const options=shuffle(opts);
  return{verbs:true,modeB:true,verb:v,rule,level:lvl,stem,accepted,maxLen,options,picks:[],result:null,task};
}

function nextQuizQ(){
  const m=S.quizCfg.mode;
  if(m==='compose')return buildComposeQ();
  if(m==='pairs')return buildPairsQ();
  if(m==='match6')return buildMatchQ();
  if(m==='verbs')return buildVerbQ();
  if(arr(S.quizCfg.answer).length>1)return buildMultiQ();
  return buildQuizQ();
}
function startQuizError(){
  const m=S.quizCfg.mode;
  if(m==='compose'){
    if(S.quizCfg.composeMode==='ultra')return'Нет слов: нужны кандзи из импорта для известных частей';
    return'Нужны слова из 2–3 кандзи (проверьте фильтр)';
  }
  if(m==='pairs')return'Нужно ≥2 пар кандзи с общим он-чтением';
  if(m==='match6')return'Нужно ≥3 записи с заполненными полями обеих колонок';
  if(m==='verbs')return'Выберите хотя бы одну группу форм';
  return'Недостаточно данных (нужно ≥4 с заполненными полями)';
}
function checkAns(user,correct){
  const n=s=>s.trim().toLowerCase().replace(/\s+/g,' ');
  const u=n(user);if(!u)return false;
  return correct.split(/[,;、。・\n]/).map(v=>n(v)).filter(Boolean).some(v=>v===u);
}
function sessionEnd(){
  const p=pr(S.studyCfg.type),res={know:0,learning:0,unknown:0};
  S.studyQueue.forEach(w=>{const s=statusOf(p,w.id);res[s]=(res[s]||0)+1;});
  S.studyResults=res;
}
