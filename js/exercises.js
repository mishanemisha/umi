'use strict';
// «Упражнения» (блок «слова»): квиз, в котором случайно выпадают и слово, и тип задания.
// Перевод, кандзи и хвост слова собираются на устройстве; предложения и описания приходят
// с сервера (server/, POST /v1/exercise) и каждый раз новые. Нет ответа сервера — берётся
// пример из data/dict или другой тип задания, тренировка не ждёт сеть.
const EX_STORE='umi.ex.v1';          // какие варианты предложений ученик уже видел
const EX_COUNTS=['30','40','50'];
const EX_TYPES=['jr','rj','desc','kanji','tail','gap','build'];
const EX_REMOTE=['desc','gap','build'];
const EX_LABEL={jr:'Перевод',rj:'Перевод',desc:'По описанию',kanji:'Кандзи слова',tail:'Хвост слова',gap:'Пропуск в предложении',build:'Собери предложение'};
const EX_TAILS=['る','う','い','く','す','む','つ','える','べる','ける','れる','める','しい','かい','った','って'];
const EX_ICON=`<svg width="104" height="84" viewBox="0 0 104 84" fill="none" aria-hidden="true"><polygon points="8,35 36,33 37,47 9,49" fill="#383737" fill-opacity=".9"/><polygon points="74,33 98,35 97,49 73,47" fill="#383737" fill-opacity=".9"/><polygon points="8,59 58,57 59,71 9,73" fill="#383737" fill-opacity=".9"/><polygon points="64,58 91,59 90,73 63,72" fill="#383737" fill-opacity=".9"/><rect x="41.5" y="33.5" width="28" height="14" stroke="#3f6fcf" stroke-opacity=".55"/><polygon points="40,18 70,9 73,22 43,31" fill="#3f6fcf" fill-opacity=".9"/></svg>`;
// словарь data/dict (разбивка чтений, примеры), ответы сервера по ключу «слово|чтение»
const EX={dictState:'',byKey:new Map(),sents:null,content:new Map(),req:0,bank:null};

/* ── Данные ── */
const exHasKanji=s=>[...String(s||'')].some(isKanjiChar);
function exM(w){return String(shownMeaning(w)||'').split(/[;\n]/)[0].trim();}
function exWordOk(w){return!!(w&&w.kanji&&exM(w));}
function exKey(w){return String(w.kanji||'')+'|'+toHira(w.reading||'');}
// Кандзи показываем, только если ученик загрузил их в «кандзи»; иначе слово пишется каной.
function exKs(){
  if(EX.ksSrc!==S.kanjiItems||EX.ksN!==S.kanjiItems.length){EX.ks=userKanjiSet();EX.ksSrc=S.kanjiItems;EX.ksN=S.kanjiItems.length;}
  return EX.ks;
}
function exKnown(s){const ks=exKs();return kanjiChars(s).every(c=>ks.has(c));}
const exForm=(s,r)=>exKnown(s)||!r?String(s||''):String(r);   // вид слова на экране: кандзи или кана
const exShow=w=>exForm(w.kanji,w.reading);
function exRuby(t,r){return r&&exHasKanji(t)?`<ruby>${esc(t)}<rt>${esc(r)}</rt></ruby>`:esc(t);}
function exLoadDict(){
  if(EX.dictState||typeof fetch!=='function')return;
  EX.dictState='loading';
  Promise.all(['words','sentences'].map(f=>fetch(`data/dict/${f}.json`).then(r=>r.ok?r.json():Promise.reject(new Error(f)))))
    .then(([w,s])=>{w.forEach(x=>EX.byKey.set(x.w+'|'+toHira(x.r),x));EX.sents=s;EX.dictState='ok';})
    .catch(()=>{EX.dictState='';});
}
// посимвольная разбивка чтения: словарь, затем встроенный банк, затем слово с одним кандзи
function exParts(w){
  if(!EX.bank){EX.bank=new Map();[...BUILTIN_WORDS,...ADDITIONAL_WORDS].forEach(b=>{if(b.k)EX.bank.set(b.w,b.k);});}
  const d=EX.byKey.get(exKey(w));
  return segmentWord(String(w.kanji||''),w.reading||'',(d&&d.k)||EX.bank.get(w.kanji)||null);
}
function exSeen(){try{return JSON.parse(localStorage.getItem(EX_STORE)||'{}').seen||{};}catch{return{};}}
function exMarkSeen(key,item){
  try{const d=JSON.parse(localStorage.getItem(EX_STORE)||'{}');d.seen=d.seen||{};
    const a=d.seen[key]=d.seen[key]||[],v=`${item.prompt_v}:${item.variant}`;
    if(!a.includes(v))a.push(v);if(a.length>40)a.shift();
    localStorage.setItem(EX_STORE,JSON.stringify(d));}catch{}
}
// Просим сервер только о словах, которым выпало задание с предложением или описанием.
async function exPrefetch(words){
  const init=tg?.initData;
  if(!init||typeof fetch!=='function'||!words.length)return;
  const req=++EX.req,seen=exSeen();
  for(let i=0;i<words.length;i+=6){
    if(req!==EX.req||!S.ex)return;
    const part=words.slice(i,i+6).map(w=>({w:String(w.kanji),r:toHira(w.reading||''),m:exM(w)}));
    const sn={};part.forEach(p=>{const k=p.w+'|'+p.r;if(seen[k])sn[k]=seen[k];});
    try{
      const res=await fetch(AI_API+'/v1/exercise',{method:'POST',
        headers:{'content-type':'application/json','x-telegram-init-data':init},body:JSON.stringify({words:part,seen:sn})});
      if(!res.ok)return;
      const b=await res.json();
      arr(b.items).forEach(it=>{if(it&&it.key&&it.data)EX.content.set(it.key,it);});
    }catch{return;}
  }
}
// ответ сервера по слову: используется один раз, чтобы в следующей тренировке пришёл новый
function exTake(w,part){
  const key=exKey(w),it=EX.content.get(key);
  if(!it||!it.data||!it.data[part])return null;
  EX.content.delete(key);exMarkSeen(key,it);
  return it.data[part];
}
const exServerSegs=t=>arr(t).map(x=>{
  const s=String(x[0]||''),r=String(x[1]||''),known=exKnown(s);
  return{tok:x[2]?1:0,s,d:exForm(s,r),html:known?exRuby(s,r):esc(r||s),tip:[s+(r&&r!==s?` 【${r}】`:''),String(x[2]||'')]};
});
// разметка «{漢字|かんじ}» из data/dict: знакомые кандзи — с фуриганой, незнакомые — каной
function exMarkup(m,plain){
  return String(m).split(/(\{[^|}]*\|[^}]*\})/).map(p=>{
    const r=/^\{([^|}]*)\|([^}]*)\}$/.exec(p);
    if(!r)return plain?p:esc(p);
    return exKnown(r[1])?(plain?r[1]:`<ruby>${esc(r[1])}<rt>${esc(r[2])}</rt></ruby>`):(plain?r[2]:esc(r[2]));
  }).join('');
}
// пример из data/dict: слово должно стоять в предложении в словарной форме
function exBankSegs(s){
  const jp=String(s.jp||''),out=[];let pos=0;
  for(const t of s.t){
    const plain=plainMarkup(t[0]),at=jp.indexOf(plain,pos);
    if(at<0)continue;
    if(at>pos)out.push({s:jp.slice(pos,at)});
    const lemma=t[1]||plain;
    out.push({tok:1,s:plain,d:exMarkup(t[0],true),html:exMarkup(t[0]),tip:[lemma+(t[2]&&t[2]!==lemma?` 【${t[2]}】`:''),t[3]||'']});
    pos=at+plain.length;
  }
  if(pos<jp.length)out.push({s:jp.slice(pos)});
  return out;
}
function exBankSent(w){
  const d=EX.byKey.get(exKey(w));
  if(!d||!EX.sents)return null;
  for(const si of shuffle(arr(d.s))){
    const s=EX.sents[si];
    if(!s||!Array.isArray(s.t))continue;
    const segs=exBankSegs(s),ti=segs.findIndex(x=>x.tok&&x.s===w.kanji);
    if(ti>=0)return{segs,ti,ru:s.ru||'',src:s.src||null};
  }
  return null;
}

/* ── Задания ── */
function exDistinct(w,pool,val,n,skip){
  const seen=new Set([val(w)]),out=[];
  for(const x of shuffle(pool)){
    if(x.id===w.id||(skip&&skip(x)))continue;
    const v=val(x);
    if(!v||seen.has(v))continue;
    seen.add(v);out.push(x);
    if(out.length===n)break;
  }
  return out.length===n?out:null;
}
function exTrQ(w,dir,pool){
  const wrong=exDistinct(w,pool,dir==='jr'?exM:exShow,3,x=>exM(x)===exM(w)||exShow(x)===exShow(w));
  if(!wrong)return null;
  const opts=shuffle([w,...wrong]);
  return{type:dir,word:w,options:opts.map(x=>dir==='jr'?{t:exM(x)}:{t:exShow(x),r:x.reading||''}),correct:opts.indexOf(w)};
}
function exKanjiQ(w,pool){
  const chars=[...String(w.kanji)],target=chars.filter(isKanjiChar);
  if(!target.length||target.length>4||!exKnown(w.kanji))return null;
  // лишние плитки — тоже из знакомых кандзи
  const have=new Set(target),need=Math.max(2,6-target.length);
  const extra=shuffle([...exKs()].filter(c=>!have.has(c))).slice(0,need);
  if(extra.length<2)return null;
  return{type:'kanji',word:w,chars,target,parts:exParts(w),options:shuffle([...target,...extra.slice(0,need)]),picks:[]};
}
function exTail(s){const m=/^(.*[㐀-鿿々])([ぁ-ゖー]+)$/.exec(String(s||''));return m?{head:m[1],tail:m[2]}:null;}
function exTailQ(w,pool){
  const ht=exTail(w.kanji);
  if(!ht||!exKnown(w.kanji))return null;
  const cand=shuffle(pool.map(x=>exTail(x.kanji)).filter(Boolean).map(x=>x.tail)).concat(shuffle(EX_TAILS))
    .sort((a,b)=>Math.abs(a.length-ht.tail.length)-Math.abs(b.length-ht.tail.length));
  const seen=new Set([ht.tail]),wrong=[];
  for(const t of cand){if(seen.has(t))continue;seen.add(t);wrong.push(t);if(wrong.length===3)break;}
  const options=shuffle([ht.tail,...wrong]);
  return{type:'tail',word:w,head:ht.head,tail:ht.tail,parts:exParts(w),options,correct:options.indexOf(ht.tail)};
}
function exGapQ(w,pool){
  const sv=exTake(w,'s');
  let segs,ti,ru,src=null,wrong;
  if(sv){segs=exServerSegs(sv.t);ti=sv.i;ru=sv.ru;wrong=arr(sv.wrong).slice(0,3).map(x=>exForm(x[0],x[1]));}
  else{
    const b=exBankSent(w);
    if(!b)return null;
    ({segs,ti,ru,src}=b);
    const picked=exDistinct(w,pool,exShow,3,x=>exShow(x)===segs[ti].d);
    if(!picked)return null;
    wrong=picked.map(exShow);
  }
  if(!segs[ti])return null;
  const correct=segs[ti].d;
  wrong=[...new Set(wrong)].filter(x=>x&&x!==correct);
  if(wrong.length<3)return null;
  const options=shuffle([correct,...wrong]);
  return{type:'gap',word:w,segs,ti,ru,src,options,correct:options.indexOf(correct)};
}
function exBuildQ(w){
  const sv=exTake(w,'s');
  if(!sv||arr(sv.c).length<3)return null;
  // плитка — группа соседних токенов предложения; показываем её в том же виде, что и текст (кандзи или кана)
  const chunks=sv.c.map(ix=>ix.map(k=>exForm(sv.t[k][0],sv.t[k][1])).join(''));
  const extra=sv.extra&&sv.extra[0]?exForm(sv.extra[0],sv.extra[1]):'';
  const tiles=shuffle([...chunks.map((c,i)=>({c,i})),...(extra&&!chunks.includes(extra)?[{c:extra,i:-1}]:[])]);
  return{type:'build',word:w,ru:sv.ru,chunks,orders:arr(sv.orders),tiles,picks:[]};
}
function exDescQ(w,pool){
  const wrong=exDistinct(w,pool,exShow,3,x=>exM(x)===exM(w));
  if(!wrong)return null;
  const d=exTake(w,'d');
  if(!d)return null;
  const opts=shuffle([w,...wrong]);
  return{type:'desc',word:w,segs:exServerSegs(d.t),options:opts.map(x=>({t:exShow(x),r:x.reading||''})),correct:opts.indexOf(w)};
}
function exMake(type,w,pool){
  switch(type){
    case'jr':case'rj':return exTrQ(w,type,pool);
    case'kanji':return exKanjiQ(w,pool);
    case'tail':return exTailQ(w,pool);
    case'gap':return exGapQ(w,pool);
    case'build':return exBuildQ(w);
    case'desc':return exDescQ(w,pool);
  }
  return null;
}
// Тип случайный. Незнакомое слово первый раз приходит переводом; один тип — не больше двух раз подряд.
function exQuestion(w){
  const x=S.ex,pool=S.words.filter(exWordOk),wish=x.wish[w.id];
  let order=[wish,...shuffle(EX_TYPES.filter(t=>t!==wish))];
  if(statusOf(S.progress,w.id)==='unknown')order=[...shuffle(['jr','rj']),...order.filter(t=>t!=='jr'&&t!=='rj')];
  const repeat=t=>x.last.length===2&&x.last[0]===t&&x.last[1]===t;
  for(const pass of[0,1])for(const t of order){
    if(!pass&&repeat(t))continue;
    const q=exMake(t,w,pool);
    if(q){x.last=[t,x.last[0]].filter(Boolean);return q;}
  }
  return null;
}

/* ── Сессия ── */
function exPool(){return filtered('words','all','all',S.exCfg.folders).filter(exWordOk);}
function exPlan(){
  const all=exPool(),now=Date.now(),n=+S.exCfg.count;
  const fresh=all.filter(w=>statusOf(S.progress,w.id)==='unknown').length;
  const due=all.filter(w=>statusOf(S.progress,w.id)!=='unknown'&&dueOf(S.progress,w.id)<=now).length;
  return{total:all.length,due:Math.min(due,n),fresh:Math.min(fresh,Math.max(0,n-Math.min(due,n)))};
}
function exStart(only){
  let list;
  if(only)list=only.map(id=>S.words.find(w=>w.id===id)).filter(exWordOk);
  else{
    const all=exPool(),now=Date.now();
    if(all.length<4){toast('Нужно минимум 4 слова с переводом');return;}
    const due=shuffle(all.filter(w=>dueOf(S.progress,w.id)<=now)),rest=shuffle(all.filter(w=>dueOf(S.progress,w.id)>now));
    list=shuffle([...due,...rest].slice(0,+S.exCfg.count));
  }
  if(!list.length)return;
  const wish={};list.forEach(w=>{wish[w.id]=EX_TYPES[Math.floor(Math.random()*EX_TYPES.length)];});
  // первые задания — те, что не ждут сервер: предложения успеют прийти
  const early=list.filter(w=>!EX_REMOTE.includes(wish[w.id])).slice(0,4);
  list=[...early,...list.filter(w=>!early.includes(w))];
  S.ex={ids:list.map(w=>w.id),wish,i:-1,q:null,done:false,ok:false,sel:-1,hint:false,hinted:false,last:[],
    score:{ok:0,bad:0},fixed:[],errors:[],results:null};
  exLoadDict();
  exPrefetch(list.filter(w=>EX_REMOTE.includes(wish[w.id])));
  exAdvance();
}
function exAdvance(){
  const x=S.ex;
  x.done=false;x.ok=false;x.sel=-1;x.hint=false;x.hinted=false;x.q=null;
  while(++x.i<x.ids.length){
    const w=S.words.find(v=>v.id===x.ids[x.i]);
    const q=w&&exQuestion(w);
    if(q){x.q=q;return;}
  }
  x.results={ok:x.score.ok,bad:x.score.bad};
}
function exGrade(ok){
  const x=S.ex,q=x.q;
  x.done=true;x.ok=ok;
  const quality=!ok?1:(x.hint||x.hinted)?3:(q.type==='jr'||q.type==='rj')?4:5;
  smUpdate(S.progress,q.word.id,quality);
  // задание на кандзи двигает и график самих кандзи, если они есть в списке
  if(q.type==='kanji')q.target.forEach(c=>{const k=S.kanjiItems.find(i=>i.kanji===c);if(k)smUpdate(S.kanjiProgress,k.id,quality);});
  if(ok){x.score.ok++;x.fixed.push(q.word.id);haptic('light');}
  else{x.score.bad++;x.errors.push(q.word.id);haptic('medium');}
  save();
}
function exAct(val){
  const ci=val.indexOf(':'),cmd=ci>-1?val.slice(0,ci):val,arg=ci>-1?val.slice(ci+1):'';
  const x=S.ex,q=x&&x.q;
  switch(cmd){
    case'count':if(EX_COUNTS.includes(arg)){S.exCfg.count=arg;save();}break;
    case'folder':{
      const f=S.exCfg.folders;
      if(arg==='__all__')S.exCfg.folders=[];
      else S.exCfg.folders=f.includes(arg)?f.filter(v=>v!==arg):[...f,arg];
      save();break;}
    case'start':exStart();break;
    case'retry':if(x)exStart([...new Set(x.errors)]);break;
    case'stop':EX.req++;S.ex=null;break;
    case'hint':if(q&&!x.done){x.hint=!x.hint;x.hinted=true;haptic('light');}break;
    case'giveup':if(q&&!x.done){x.sel=-1;exGrade(false);}break;
    case'ans':
      if(q&&!x.done&&q.options&&q.correct!=null){x.sel=+arg;exGrade(x.sel===q.correct);}
      break;
    case'pick':{
      if(!q||x.done||!q.picks||q.picks.includes(+arg))break;
      q.picks.push(+arg);haptic('light');
      if(q.type==='kanji'&&q.picks.length===q.target.length)exGrade(q.picks.map(i=>q.options[i]).join('')===q.target.join(''));
      if(q.type==='build'&&q.picks.length===q.chunks.length){
        const seq=q.picks.map(i=>q.tiles[i].i).join();
        exGrade([q.chunks.map((c,i)=>i),...q.orders].some(o=>o.join()===seq));
      }
      break;}
    case'unpick':if(q&&!x.done&&q.picks){q.picks.splice(+arg,1);haptic('light');}break;
    case'next':case'skip':if(x&&!x.results)exAdvance();break;
  }
  render();
}

/* ── Экраны ── */
function exPlanLine(){
  if(S.homeTab!=='words'||!S.words.length)return'';
  const p=exPlan();
  return p.total<4?'':`<span class="ex-planline">${p.due} повторить · ${p.fresh} новых</span>`;
}
function exHomeBody(){
  const p=exPlan(),c=S.exCfg;
  if(p.total<4)return`<div class="mempty">Нужно минимум 4 слова с переводом (сейчас ${p.total})</div><button class="mstart" data-a="go-import-home">Импорт</button>`;
  const stat=(n,l,cls)=>`<div class="ex-plan-i ${cls}"><b>${n}</b><span>${l}</span></div>`;
  const rows=[[mFolders('words',c.folders,'ex:folder'),mGroup('Количество',mPick(EX_COUNTS.map(v=>({v,l:v})),c.count,'ex:count'))]];
  return`<div class="ex-plan">${stat(p.due,'повторить','y')}${stat(p.fresh,'новых','b')}${stat('≈ '+Math.max(1,Math.round(Math.min(+c.count,p.total)/4)),'минут','')}</div>
    <div class="mcard-sub">Настроить:</div>${mRows(rows)}<button class="mstart" data-a="ex:start">Старт</button>`;
}
function exTokHtml(s){
  return s.tok?`<span class="ex-tok" data-more="${esc(s.tip.join('\n'))}" data-more-kind="tok">${s.html}</span>`:esc(s.s);
}
function exWordRow(w){
  const shown=exShow(w);
  return`<div class="ex-row"><span class="ex-row-w jp">${esc(shown)}</span><span class="ex-row-m">${w.reading&&w.reading!==shown?`<i class="jp">${esc(w.reading)}</i>`:''}${esc(exM(w))}</span></div>`;
}
// После ответа из-под канваса выезжает блок: при ошибке — правильный ответ, затем слово и перевод предложения
function exAnswerText(q){
  switch(q.type){
    case'jr':return exM(q.word);
    case'gap':return q.options[q.correct];
    case'tail':return q.head+q.tail;
    case'build':return q.chunks.join('');
    default:return exShow(q.word);
  }
}
function exDrop(){
  const x=S.ex,q=x.q;
  return`<div class="cv-drop ex-drop" data-key="ex-drop"><div class="ex-drop-in">
    ${x.ok?'':`<div class="cmp-correct">Правильно: <span>${esc(exAnswerText(q))}</span></div>`}
    ${exWordRow(q.word)}
    ${q.ru&&q.type!=='build'?`<p class="ex-rv-ru">${esc(q.ru)}</p>`:''}
    ${q.src?sentBy(q.src):''}
  </div></div>`;
}
function exDone(){
  const x=S.ex,word=id=>S.words.find(w=>w.id===id),err=new Set(x.errors);
  const errors=[...err].map(word).filter(Boolean);
  return`<div class="pg ex-done">
    <h2 class="ex-done-h">Итог тренировки</h2>
    <div class="res-grid" style="grid-template-columns:repeat(2,1fr)">
      <div class="rc g"><div class="rn">${x.results.ok}</div><div class="rl">Верно</div></div>
      <div class="rc r"><div class="rn">${x.results.bad}</div><div class="rl">Ошибки</div></div>
    </div>
    ${errors.length?`<div class="quiz-panel ex-list"><div class="ex-list-h">Ошибки</div>${errors.map(exWordRow).join('')}
      <button class="qact-btn ex-wide" data-a="ex:retry">Повторить ошибки</button></div>`:''}
    <div class="btn-row"><button class="btn btn-p" data-a="ex:start">Ещё раз</button><button class="btn btn-s" data-a="ex:stop">Готово</button></div>
  </div>`;
}
function buildEx(){
  const x=S.ex;
  if(!x)return'';
  if(x.results)return exDone();
  if(!x.q)return'';
  const q=x.q,w=q.word,done=x.done,show=x.hint||done;
  const pill=t=>done?'':`<button class="cv-hint${x.hint?' on':''}" data-a="ex:hint" aria-pressed="${!!x.hint}">${t}</button>`;
  const opts=(html,jp)=>`<div class="quiz-opts">${html.map((h,i)=>{
    const cls=done?(i===q.correct?'ok':i===x.sel?'bad':''):'';
    return`<button class="qopt ${jp?'jp ':''}${cls}"${done?' aria-disabled="true"':''} data-a="ex:ans:${i}">${h}</button>`;}).join('')}</div>`;
  const tiles=(items)=>`<div class="ex-tiles">${items.map((t,i)=>`<button class="qopt jp${q.picks.includes(i)?' used':''}"${done?' aria-disabled="true"':''} data-a="ex:pick:${i}">${esc(t)}</button>`).join('')}</div>`;
  const meaning=`<div class="ex-prompt">${esc(exM(w))}</div>`;
  let task='',inner='',hint='',lbl='',panel='';
  switch(q.type){
    case'jr':
      task='Что значит это слово?';lbl='Выберите значение:';
      inner=`<div class="ex-word jp">${show?exRuby(exShow(w),w.reading):esc(exShow(w))}</div>`;
      hint=exHasKanji(exShow(w))&&w.reading?pill('Фуригана'):'';
      panel=opts(q.options.map(o=>esc(o.t)));break;
    case'rj':
      task='Как это по-японски?';lbl='Выберите слово:';inner=meaning;hint=q.options.some(o=>exHasKanji(o.t))?pill('Фуригана'):'';
      panel=opts(q.options.map(o=>show?exRuby(o.t,o.r):esc(o.t)),true);break;
    case'desc':
      task='Какое слово здесь описано?';lbl='Выберите слово:';hint=w.reading?pill('Подсказка'):'';
      inner=`<div class="ex-sent jp">${q.segs.map(exTokHtml).join('')}</div>${x.hint&&!done?`<div class="ex-note">Чтение начинается на «${esc([...w.reading][0])}»</div>`:''}`;
      panel=opts(q.options.map(o=>done?exRuby(o.t,o.r):esc(o.t)),true);break;
    case'kanji':{
      task='Собери слово из кандзи';lbl='Выберите кандзи:';hint=w.reading?pill('Фуригана'):'';
      let k=0;
      const cells=q.chars.map((c,ci)=>{
        if(!isKanjiChar(c))return`<span class="ex-kana">${esc(c)}</span>`;
        const at=k++,pick=q.picks[at],val=done?c:pick!=null?q.options[pick]:'';
        const rt=show&&q.parts?esc(q.parts[ci].r):'';
        return`<span class="ex-cell"><i class="ex-furi">${rt}</i><span class="ex-slot${val?' on':''}${done?(x.ok?' ok':' bad'):''}"${val&&!done?` data-a="ex:unpick:${at}"`:''}>${esc(val)}</span></span>`;
      }).join('');
      inner=`${meaning}<div class="ex-build jp">${cells}</div>${show&&!q.parts?`<div class="ex-note jp">${esc(w.reading)}</div>`:''}`;
      panel=tiles(q.options);break;}
    case'tail':{
      task='Допиши слово каной';lbl='Выберите окончание:';hint=w.reading?pill('Фуригана'):'';
      const head=show&&q.parts?[...q.head].map((c,i)=>isKanjiChar(c)?exRuby(c,q.parts[i].r):esc(c)).join(''):esc(q.head);
      inner=`${meaning}<div class="ex-build jp">${head}<span class="ex-blank${done?(x.ok?' ok':' bad'):''}">${done?esc(q.tail):''}</span></div>`;
      panel=opts(q.options.map(esc),true);break;}
    case'gap':
      task='Подставь подходящее слово';lbl='Выберите слово:';hint=q.ru?pill('Перевод'):'';
      inner=`<div class="ex-sent jp">${q.segs.map((s,i)=>i===q.ti?`<span class="ex-blank${done?' ok':''}">${done?esc(s.d||s.s):''}</span>`:exTokHtml(s)).join('')}</div>${x.hint&&!done?`<div class="ex-note">${esc(q.ru)}</div>`:''}`;
      panel=opts(q.options.map(esc),true);break;
    case'build':
      task='Собери предложение';lbl='Соберите из предложенного:';
      inner=`<div class="ex-prompt sm">${esc(q.ru)}</div><div class="ex-sent ex-line jp${done?(x.ok?' ok':' bad'):''}">${q.picks.map((ti,at)=>`<button class="ex-chunk"${done?'':` data-a="ex:unpick:${at}"`}>${esc(q.tiles[ti].c)}</button>`).join('')}</div>`;
      panel=tiles(q.tiles.map(t=>t.c));break;
  }
  const pills=hint+(done?'':`<button class="cv-hint" data-a="ex:giveup">Ответ</button>`);
  return`<div class="pg">
    <div class="cv-wrap"><div class="quiz-q ex-q${done?(x.ok?' ok':' bad'):''}">
      <div class="qscore"><div class="qbadge qok" aria-label="Верно">${x.score.ok}</div><div class="qbadge qbad" aria-label="Неверно">${x.score.bad}</div><div class="qbadge">${x.i+1} / ${x.ids.length}</div></div>
      <div class="ex-type">${EX_LABEL[q.type]}</div>
      <div class="qbody"><div class="ex-task">${task}</div>${inner}</div>
      ${pills?`<div class="cv-pills">${pills}</div>`:''}
    </div>${done?exDrop():''}</div>
    <div class="quiz-panel"><div class="quiz-panel-lbl">${lbl}</div>${panel}</div>
    <div class="quiz-actions">
      <button class="qact-btn" data-a="ex:stop">Стоп</button>
      <button class="qact-btn" data-a="ex:skip"${done?' aria-disabled="true"':''}>Пропустить</button>
      <button class="qact-btn primary" ${done?'data-a="ex:next"':'aria-disabled="true" tabindex="-1"'}>Дальше</button>
    </div>
  </div>`;
}
