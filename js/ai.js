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
  S.ai={open:true,form,status:'loading',data:null,step:'read',picks:[],anim:true,reveal:true};
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
    aiMarkSeen(form,body.variant);
    const r={data:body.data,variant:body.variant,prompt_v:body.prompt_v};
    _aiCache.set(form,r);
    done({status:'ready',...r});
  }catch(e){done({status:'error',error:navigator.onLine===false?'Нет подключения к интернету':(e.message||'Не удалось получить объяснение')});}
}
function aiClose(){S.ai=null;_aiReq++;}
function aiMore(){
  const a=S.ai;if(!a)return;
  _aiCache.delete(a.form);
  Object.assign(a,{status:'loading',data:null,step:'read',picks:[],reported:false,shown:null});
  aiLoad(a.form,++_aiReq,0);
}
function aiPick(val){
  const a=S.ai;if(!a||a.status!=='ready')return;
  const[ei,oi]=val.split(':').map(Number);
  if(a.picks[ei]!=null||ei!==a.picks.length)return;   // по одному заданию, по порядку
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

/* ── Панель объяснения (Figma «Формы глаголов» 160:786) ──
 * Выезжает из-под канваса на месте банка чипов. Как в чатах с ИИ: ответы ИИ — текстом без пузыря (аватар — в шапке),
 * выбор ученика — пузырём справа, быстрые ответы вместо строки ввода. Новые сообщения проявляются
 * по очереди (как печать), остальные при перерисовке не мигают. */
function aiAvatar(){return`<span class="ai-ava" aria-hidden="true">${SPARK_SVG}</span>`;}
function aiSection(title,html){return`<div class="ai-sec"><div class="ai-sec-t">${SPARK_SVG}<span>${title}</span></div>${html}</div>`;}
function aiMessages(a,q){
  const m=[];   // [{k: ключ, html, me?}]
  if(a.status==='loading'){
    m.push({k:'load',html:`<div class="ai-think"><span class="ai-shimmer">umi AI разбирает правило…</span><i class="ai-skel"></i><i class="ai-skel w2"></i><i class="ai-skel w3"></i></div>`});
    return m;
  }
  if(a.status==='error'){
    m.push({k:'err',html:`<div class="ai-err">${esc(a.error)}</div>`});
    return m;
  }
  const d=a.data;
  // разбор формы с карточки — из нашего движка, не от модели
  const parts=q&&q.verbs?[q.stem.jp,...(q.modeB?q.accepted[0].seq:q.target)]:[];
  const breakdown=parts.length?`<div class="ai-parts">${parts.map((p,i)=>`<span class="ai-part${i?'':' stem'}">${esc(p)}</span>`).join('<span class="ai-plus">+</span>')}<span class="ai-eq">=</span><span class="ai-part res">${esc(parts.join(''))}</span></div>`:'';
  m.push({k:'ex',html:aiSection('Объяснение',`<p class="ai-p">${esc(d.summary)}</p><div class="ai-pattern">${esc(d.pattern)}</div>${breakdown}`)});
  m.push({k:'steps',html:`<ol class="ai-steps">${d.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`+
    (d.notes.length?`<div class="ai-notes">${d.notes.map(s=>`<p>${esc(s)}</p>`).join('')}</div>`:'')});
  if(a.step==='read')return m;
  m.push({k:'me-drill',me:true,html:'Понятно, дай задания'});
  m.push({k:'drill',html:aiSection('Закрепим','<p class="ai-p">Три коротких задания — выберите вариант.</p>')});
  for(let ei=0;ei<d.exercises.length&&ei<=a.picks.length;ei++){
    const ex=d.exercises[ei],opts=aiOptions(ex,ei),pick=a.picks[ei];
    m.push({k:'q'+ei,html:`<div class="ai-task"><div class="ai-q"><span class="ai-n">${ei+1}/3</span><span>${esc(ex.question)}</span></div>
      <div class="ai-verb"><b>${esc(ex.verb)}</b><span>${esc(ex.reading)} · ${esc(ex.meaning)}</span></div>
      <div class="ai-opts" role="radiogroup">${opts.map((o,oi)=>{
        const st=pick==null?'':o===ex.answer?' ok':oi===pick?' bad':' dim';
        return`<button class="ai-opt${st}" role="radio" aria-checked="${oi===pick}"${pick!=null?' aria-disabled="true"':''} data-a="ai-pick:${ei}:${oi}"><i class="ai-radio"></i><span>${esc(o)}</span></button>`;}).join('')}</div></div>`});
    if(pick!=null){
      const ok=opts[pick]===ex.answer;
      m.push({k:'a'+ei,me:true,html:`<span class="jp">${esc(opts[pick])}</span>`,bad:!ok});
      m.push({k:'r'+ei,html:`<div class="ai-verdict ${ok?'ok':'bad'}">${ok?'✓ Правильно!':'✗ Не совсем'}</div><p class="ai-p">${ok?'':`Верно: <b class="jp">${esc(ex.answer)}</b>. `}${esc(ex.why)}</p>`});
    }
  }
  if(a.picks.length===d.exercises.length){
    const n=d.exercises.filter((ex,ei)=>aiOptions(ex,ei)[a.picks[ei]]===ex.answer).length;
    m.push({k:'end',html:`<div class="ai-score"><b>${n} из 3</b>${n===3?' — форма закреплена.':' — перечитайте шаги выше и попробуйте эту форму ещё раз в тренировке.'}</div>`});
  }
  return m;
}
function buildAiDrawer(){
  const a=S.ai;if(!a||!a.open)return'';
  const q=S.quizQ;
  const msgs=aiMessages(a,q);
  // новые сообщения (которых не было в прошлой отрисовке) проявляются по очереди
  const before=a.shown||new Set();let n=0;
  const body=msgs.map(x=>{
    const fresh=!before.has(x.k),st=fresh?` style="animation-delay:${(n++)*140}ms"`:'';
    return x.me
      ?`<div class="ai-row me${fresh?' in':''}"${st}><div class="ai-bubble${x.bad?' bad':''}">${x.html}</div></div>`
      :`<div class="ai-row${fresh?' in':''}"${st}><div class="ai-text">${x.html}</div></div>`;
  }).join('');
  a.shown=new Set(msgs.map(x=>x.k));
  // быстрые ответы вместо строки ввода
  const chips=[];
  if(a.status==='error')chips.push(`<button class="ai-chip" data-a="ai-retry">Повторить</button>`);
  if(a.status==='ready'&&a.step==='read')chips.push(`<button class="ai-chip primary" data-a="ai-drill">Понятно, дай задания</button>`);
  if(a.status==='ready'&&a.picks.length===a.data.exercises.length)chips.push(`<button class="ai-chip" data-a="ai-more">Объясни по-другому</button>`,`<button class="ai-chip primary" data-a="next-q">Дальше</button>`);
  const anim=a.anim;a.anim=false;
  return`<section class="ai-drawer${anim?' anim':''}" aria-label="Объяснение правила">
    <div class="ai-panel">
      <div class="ai-head">${aiAvatar()}<div class="ai-who"><b>umi AI</b><span>${a.status==='loading'?'печатает…':esc(a.data?a.data.title:'объяснение правила')}</span></div>
        <button class="ai-x" data-a="ai-close" aria-label="Скрыть объяснение"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 9l4-4 4 4" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round"/></svg></button></div>
      <div class="ai-body" id="ai-body">${body}</div>
      ${chips.length?`<div class="ai-chips">${chips.join('')}</div>`:''}
      ${a.status==='ready'?`<div class="ai-foot"><span>Ответ сгенерирован ИИ и может содержать неточности</span><button class="ai-link" data-a="ai-report"${a.reported?' aria-disabled="true"':''}>${a.reported?'Отправлено':'Сообщить об ошибке'}</button></div>`:''}
    </div>
  </section>`;
}

// пример ответа для просмотра дизайна без сервера: открыть приложение с #aidemo
const AI_DEMO={form:'causative_masu_negative_past',title:'Каузатив · вежливое отрицание прошедшего',
  summary:'«Не заставил(а) / не разрешил(а) сделать» в вежливом стиле: действие, которое вы не заставили или не позволили сделать другому, в прошлом.',
  pattern:'V-ない-основа + せ/させ + ませんでした',
  steps:['Найдите ない-основу: у годан — ряд «а» (寄る → 寄ら), у итидан — основа без る (食べる → 食べ).','Добавьте каузатив: годан + せ, итидан + させ; する → させ, 来る → 来させ.','Вежливое отрицание прошедшего: вместо る — ませんでした.'],
  notes:['Без контекста форма значит и «не заставил», и «не разрешил».','Частая ошибка — взять основу на «и» (寄りせ…), как у ます.'],
  exercises:[
    {verb:'書く',reading:'かく',meaning:'писать',question:'Как вежливо сказать «не заставил(а) написать»?',options:['書かせませんでした','書かせました','書かれませんでした','書けませんでした'],answer:'書かせませんでした',why:'Годан: 書く → 書か + せ, отрицание прошедшего — ませんでした.'},
    {verb:'食べる',reading:'たべる',meaning:'есть',question:'«Не дал(а) съесть» — вежливо:',options:['食べさせませんでした','食べさせません','食べられませんでした','食べませんでした'],answer:'食べさせませんでした',why:'Итидан берёт させ, а прошедшее отрицание — ませんでした.'},
    {verb:'待つ',reading:'まつ',meaning:'ждать',question:'Выберите «не заставил(а) ждать» (вежливо):',options:['待たせませんでした','待たせなかった','待てませんでした','待ちませんでした'],answer:'待たせませんでした',why:'待つ → 待た + せ; 待たせなかった — тоже отрицание, но не вежливое.'},
  ]};
