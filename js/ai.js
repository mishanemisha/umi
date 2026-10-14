'use strict';
// «Объясни почему» (формы глаголов): объяснение формы и 3 задания на закрепление от umi AI.
// Ключ OpenAI живёт только на сервере (server/, Cloudflare Worker); приложение шлёт подписанный
// Telegram initData и id формы — без слов, прогресса и личных данных.
let AI_API='https://umi-ai.umi-app.workers.dev';  // Cloudflare Worker (server/), задеплоен 14.10.2026
const AI_STORE='umi.ai.v1';         // какие варианты объяснений ученик уже видел (чтобы получать новые)

function aiSeen(){try{return JSON.parse(localStorage.getItem(AI_STORE)||'{}').seen||{};}catch{return{};}}
function aiMarkSeen(form,variant){
  try{const d=JSON.parse(localStorage.getItem(AI_STORE)||'{}');d.seen=d.seen||{};
    const a=d.seen[form]=d.seen[form]||[];if(!a.includes(variant))a.push(variant);
    localStorage.setItem(AI_STORE,JSON.stringify(d));}catch{}
}
// ответы текущего запуска: повторное открытие той же формы — мгновенно и без сети
const _aiCache=new Map();
let _aiReq=0;

function aiOpen(){
  const q=S.quizQ;if(!q||!q.verbs||!S.quizDone)return;
  const form=q.rule.id,req=++_aiReq;
  S.ai={open:true,form,status:'loading',data:null,picks:[]};
  if(_aiCache.has(form)){Object.assign(S.ai,_aiCache.get(form),{status:'ready'});return;}
  aiLoad(form,req,0);
}
async function aiLoad(form,req,attempt){
  const done=(patch)=>{if(req!==_aiReq||!S.ai||S.ai.form!==form)return;Object.assign(S.ai,patch);render();};
  if(location.hash==='#aidemo'){setTimeout(()=>done({status:'ready',data:AI_DEMO,variant:0}),700);return;}
  if(!AI_API){done({status:'error',error:'Сервис объяснений ещё не подключён'});return;}
  try{
    const res=await fetch(AI_API+'/v1/explain',{method:'POST',
      headers:{'content-type':'application/json','x-telegram-init-data':tg?.initData||''},
      body:JSON.stringify({form,seen:aiSeen()[form]||[]})});
    const body=await res.json().catch(()=>null);
    if(res.status===202&&attempt<6){setTimeout(()=>aiLoad(form,req,attempt+1),((body&&body.retry_after)||3)*1000);return;}
    if(!res.ok||!body||!body.data)throw new Error((body&&body.message)||'Не удалось получить объяснение');
    aiMarkSeen(form,body.prompt_v+':'+body.variant);
    const r={data:body.data,variant:body.variant,prompt_v:body.prompt_v};
    _aiCache.set(form,r);
    done({status:'ready',...r});
  }catch(e){done({status:'error',error:navigator.onLine===false?'Нет подключения к интернету':(e.message||'Не удалось получить объяснение')});}
}
function aiClose(){S.ai=null;_aiReq++;}
function aiMore(){
  const a=S.ai;if(!a)return;
  _aiCache.delete(a.form);
  Object.assign(a,{status:'loading',data:null,picks:[],reported:false,shown:null});
  aiLoad(a.form,++_aiReq,0);
}
function aiPick(val){
  const a=S.ai;if(!a||a.status!=='ready')return;
  const[ei,oi]=val.split(':').map(Number);
  if(!a.data.exercises[ei]||a.picks[ei]!=null)return;   // ответ на задание — один раз
  a.picks[ei]=oi;
  const ex=a.data.exercises[ei];
  haptic(aiOptions(ex,ei)[oi]===ex.answer?'light':'medium');
}
// варианты задания в стабильном перемешанном порядке (правильный не всегда первый)
function aiOptions(ex,ei){
  const o=ex.options.slice(),seed=[...ex.answer].reduce((s,c)=>s+c.charCodeAt(0),ei*7);
  for(let i=o.length-1;i>0;i--){const j=(seed*(i+3))%(i+1);[o[i],o[j]]=[o[j],o[i]];}
  return o;
}
function aiReport(){
  const a=S.ai;if(!a||a.status!=='ready'||a.reported)return;
  a.reported=true;toast('Спасибо! Объяснение отправлено на проверку');
  if(!AI_API||location.hash==='#aidemo')return;
  fetch(AI_API+'/v1/report',{method:'POST',headers:{'content-type':'application/json','x-telegram-init-data':tg?.initData||''},
    body:JSON.stringify({form:a.form,variant:a.variant,prompt_v:a.prompt_v})}).catch(()=>{});
}

/* ── Фуригана ──
 * Текст модели: чтения в разметке 漢字[かな] → <ruby>. Формы глаголов (примеры, варианты ответа) строит
 * наш движок, их чтение считаем сами по словарной форме и чтению глагола. */
function aiFuriText(s){
  return esc(s).replace(/([\u3400-\u9fff\uf900-\ufaff々〆]+)\[([\u3041-\u309f\u30a0-\u30ffー]+)\]/g,'<ruby>$1<rt>$2</rt></ruby>')
    .replace(/\[([\u3041-\u309f\u30a0-\u30ffー]+)\]/g,'');   // чтение без кандзи перед ним — убираем скобки
}
function aiFuriForm(dict,reading,form){
  const d=[...String(dict||'')],r=[...String(reading||'')];let k=0;
  while(k<d.length&&k<r.length&&d[d.length-1-k]===r[r.length-1-k])k++;
  const head=d.slice(0,d.length-k).join('');let read=r.slice(0,r.length-k).join('');
  const f=String(form||'');
  if(!head||![...head].some(isKanjiChar)||!read||!f.startsWith(head))return esc(f);
  // 来る: чтение 来 зависит от формы — こ(ない/よう/させ/られ/い), き(ます/た/て), く(る/れば)
  if(dict==='来る'){const nx=f[head.length]||'';read='なさらよいこ'.includes(nx)?'こ':'またて'.includes(nx)?'き':'く';}
  return`<ruby>${esc(head)}<rt>${esc(read)}</rt></ruby>${esc(f.slice(head.length))}`;
}

/* ── Панель объяснения (Figma «Формы глаголов» 160:786) ──
 * Выезжает из-под канваса, банк вариантов уходит ниже (до него — обычной прокруткой). Ответ ИИ —
 * по формуле: «Как собрать» (шаги) → «Примеры» → «Проверка» (3 задания сразу, отмечаются галочкой).
 * Как в чатах с ИИ: текст без пузырей, аватар в шапке, новые блоки проявляются по очереди. */
function aiAvatar(){return`<span class="ai-ava" aria-hidden="true">${SPARK_SVG}</span>`;}
function aiSection(n,title,html){return`<div class="ai-sec"><div class="ai-sec-t"><span class="ai-sec-n">${n}</span><span>${title}</span></div>${html}</div>`;}
function aiBlocks(a,q){
  const m=[];   // [{k: ключ, html}]
  if(a.status==='loading'){
    m.push({k:'load',html:`<div class="ai-think"><span class="ai-shimmer">umi AI разбирает правило…</span><i class="ai-skel"></i><i class="ai-skel w2"></i><i class="ai-skel w3"></i></div>`});
    return m;
  }
  if(a.status==='error'){m.push({k:'err',html:`<div class="ai-err">${esc(a.error)}</div>`});return m;}
  const d=a.data;
  // 1. Как собрать: смысл, схема, разбор формы с карточки (наш движок), шаги
  const parts=q&&q.verbs?[q.stem.jp,...(q.modeB?q.accepted[0].seq:q.target)]:[];
  const breakdown=parts.length?`<div class="ai-parts">${parts.map((p,i)=>`<span class="ai-part${i?'':' stem'}">${esc(p)}</span>`).join('<span class="ai-plus">+</span>')}<span class="ai-eq">=</span><span class="ai-part res">${q?aiFuriForm(q.verb.d,q.verb.r,parts.join('')):esc(parts.join(''))}</span></div>`:'';
  m.push({k:'build',html:aiSection(1,'Как собрать',
    `<p class="ai-p">${aiFuriText(d.summary)}</p><div class="ai-pattern">${esc(d.pattern)}</div>${breakdown}
     <ol class="ai-steps">${d.steps.map(x=>`<li>${aiFuriText(x)}</li>`).join('')}</ol>`+
    (d.notes&&d.notes.length?`<div class="ai-notes">${d.notes.map(x=>`<p>${aiFuriText(x)}</p>`).join('')}</div>`:''))});
  // 2. Примеры: формы разных типов глаголов (движок) и предложения (модель, с чтениями)
  const ex=(d.examples||[]).map(e=>`<li><span class="ai-ex-jp">${aiFuriForm(e.verb,e.reading,e.form)}</span><span class="ai-ex-ru">${esc(e.ru)}</span></li>`).join('');
  const sent=(d.sentences||[]).map(x=>`<div class="ai-sent"><p class="ai-sent-jp">${aiFuriText(x.jp)}</p><p class="ai-sent-ru">${esc(x.ru)}</p></div>`).join('');
  if(ex||sent)m.push({k:'examples',html:aiSection(2,'Примеры',(ex?`<ul class="ai-ex">${ex}</ul>`:'')+sent)});
  // 3. Проверка: все три задания сразу, вариант отмечается галочкой
  const tasks=d.exercises.map((x,ei)=>{
    const opts=aiOptions(x,ei),pick=a.picks[ei];
    const ok=pick!=null&&opts[pick]===x.answer;
    return`<div class="ai-task"><div class="ai-q"><span class="ai-n">${ei+1}</span><span>${aiFuriText(x.question)}</span></div>
      <div class="ai-verb"><b class="jp">${aiFuriForm(x.verb,x.reading,x.verb)}</b><span>${esc(x.meaning)}</span></div>
      <div class="ai-opts" role="radiogroup">${opts.map((o,oi)=>{
        const st=pick==null?'':o===x.answer?' ok':oi===pick?' bad':' dim';
        return`<button class="ai-opt${st}" role="radio" aria-checked="${oi===pick}"${pick!=null?' aria-disabled="true"':''} data-a="ai-pick:${ei}:${oi}"><i class="ai-check"></i><span class="jp">${aiFuriForm(x.verb,x.reading,o)}</span></button>`;}).join('')}</div>
      ${pick!=null?`<div class="ai-why-t ${ok?'ok':'bad'}"><b>${ok?'✓ Правильно':'✗ Неверно'}</b> ${ok?'':`— верно <span class="jp">${aiFuriForm(x.verb,x.reading,x.answer)}</span>. `}${aiFuriText(x.why)}</div>`:''}
    </div>`;
  }).join('');
  const done=d.exercises.filter((_,ei)=>a.picks[ei]!=null).length;
  const n=d.exercises.filter((x,ei)=>a.picks[ei]!=null&&aiOptions(x,ei)[a.picks[ei]]===x.answer).length;
  const score=done===d.exercises.length?`<div class="ai-score"><b>${n} из ${done}</b>${n===done?' — форма закреплена.':' — загляните в шаги выше и попробуйте эту форму ещё раз.'}</div>`:'';
  m.push({k:'check',html:aiSection(3,'Проверка',`<p class="ai-p ai-sub">Отметьте правильный вариант.</p>${tasks}${score}`)});
  return m;
}
function buildAiDrawer(){
  const a=S.ai;if(!a||!a.open)return'';
  const blocks=aiBlocks(a,S.quizQ);
  // новые блоки (которых не было в прошлой отрисовке) проявляются по очереди
  const before=a.shown||new Set();let n=0;
  const body=blocks.map(x=>{
    const fresh=!before.has(x.k);
    return`<div class="ai-row${fresh?' in':''}" data-key="ai-${x.k}"${fresh?` style="animation-delay:${(n++)*160}ms"`:''}>${x.html}</div>`;
  }).join('');
  a.shown=new Set(blocks.map(x=>x.k));
  const chips=[];
  if(a.status==='error')chips.push(`<button class="ai-chip primary" data-a="ai-retry">Повторить</button>`);
  if(a.status==='ready')chips.push(`<button class="ai-chip" data-a="ai-more">Объясни по-другому</button>`);
  return`<section class="ai-drawer" data-key="ai-drawer" aria-label="Объяснение правила">
    <div class="ai-panel">
      <div class="ai-head">${aiAvatar()}<div class="ai-who"><b>umi AI</b><span>${a.status==='loading'?'печатает…':esc(a.data?a.data.title:'объяснение правила')}</span></div>
        <button class="ai-x" data-a="ai-close" aria-label="Скрыть объяснение"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 9l4-4 4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></button></div>
      <div class="ai-body">${body}</div>
      ${chips.length?`<div class="ai-chips">${chips.join('')}</div>`:''}
      ${a.status==='ready'?`<div class="ai-foot"><span>Ответ сгенерирован ИИ и может содержать неточности</span><button class="ai-link" data-a="ai-report"${a.reported?' aria-disabled="true"':''}>${a.reported?'Отправлено':'Сообщить об ошибке'}</button></div>`:''}
    </div>
  </section>`;
}

// пример ответа для просмотра дизайна без сервера: открыть приложение с #aidemo
const AI_DEMO={form:'causative_masu_negative_past',title:'Каузатив · вежливое отрицание прошедшего',
  summary:'«Не заставил(а) / не разрешил(а) сделать» в вежливом стиле — о том, что вы не заставили или не позволили сделать другому.',
  pattern:'V-ない-основа + せ/させ + ませんでした',
  steps:['Возьмите ない-основу: у годан — слог ряда «а» (書[か]く → 書[か]か), у итидан — основа без る (食[た]べる → 食[た]べ).','Добавьте каузатив: годан + せ (書[か]かせ), итидан + させ (食[た]べさせ); する → させ, 来[く]る → 来[こ]させ.','Вежливое отрицание прошедшего: る меняется на ませんでした — 書[か]かせませんでした.'],
  notes:['Без контекста форма значит и «не заставил», и «не разрешил».'],
  examples:[{verb:'食べる',reading:'たべる',meaning:'есть',form:'食べさせませんでした',ru:'не заставил(а) поесть · вежливо'},{verb:'書く',reading:'かく',meaning:'писать',form:'書かせませんでした',ru:'не заставил(а) написать · вежливо'},{verb:'する',reading:'する',meaning:'делать',form:'させませんでした',ru:'не заставил(а) сделать · вежливо'},{verb:'来る',reading:'くる',meaning:'приходить',form:'来させませんでした',ru:'не заставил(а) прийти · вежливо'}],
  sentences:[{jp:'子[こ]どもにお菓子[かし]を食[た]べさせませんでした。',ru:'Я не дал(а) ребёнку есть сладости.'},{jp:'先生[せんせい]は宿題[しゅくだい]を書[か]かせませんでした。',ru:'Учитель не заставил писать домашнее задание.'}],
  exercises:[
    {verb:'書く',reading:'かく',meaning:'писать',question:'Как вежливо сказать «не заставил(а) написать»?',options:['書かせませんでした','書かせました','書かれませんでした','書けませんでした'],answer:'書かせませんでした',why:'Годан: 書[か]く → 書[か]か + せ, вежливое отрицание прошедшего — ませんでした.'},
    {verb:'食べる',reading:'たべる',meaning:'есть',question:'«Не дал(а) поесть» — вежливо:',options:['食べさせませんでした','食べさせません','食べられませんでした','食べませんでした'],answer:'食べさせませんでした',why:'Итидан берёт させ, а прошедшее отрицание — ませんでした.'},
    {verb:'待つ',reading:'まつ',meaning:'ждать',question:'Выберите «не заставил(а) ждать» (вежливо):',options:['待たせませんでした','待たせなかった','待てませんでした','待ちませんでした'],answer:'待たせませんでした',why:'待[ま]つ → 待[ま]た + せ; 待[ま]たせなかった — тоже отрицание, но не вежливое.'},
  ]};
