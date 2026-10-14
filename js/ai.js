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
  S.ai={open:true,form,qid:q,status:'loading',data:null,step:'read',picks:[],anim:true};
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

/* ── Выпадашка с чатом ── */
function aiBubble(html,cls=''){return`<div class="ai-msg${cls?' '+cls:''}">${html}</div>`;}
function buildAiSheet(){
  const a=S.ai;if(!a||!a.open)return'';
  const q=S.quizQ;
  const anim=a.anim;a.anim=false;
  const head=`<div class="ai-head"><span class="ai-badge">umi AI</span><span class="ai-title">${esc(a.data?a.data.title:'Объясняю правило')}</span>
    <button class="ai-x" data-a="ai-close" aria-label="Закрыть">×</button></div>`;
  let body='';
  if(a.status==='loading')body=aiBubble(`<span class="ai-typing"><i></i><i></i><i></i></span>`,'typing');
  else if(a.status==='error')body=aiBubble(esc(a.error),'err')+`<div class="ai-row"><button class="ai-btn" data-a="ai-retry">Повторить</button></div>`;
  else{
    const d=a.data;
    // разбор формы с карточки — из нашего движка, не от модели
    const parts=q&&q.verbs?[q.stem.jp,...(q.modeB?q.accepted[0].seq:q.target)]:[];
    const breakdown=parts.length?`<div class="ai-parts">${parts.map((p,i)=>`<span class="ai-part${i?'':' stem'}">${esc(p)}</span>`).join('<span class="ai-plus">+</span>')}</div>`:'';
    const msgs=[
      aiBubble(`<p>${esc(d.summary)}</p><div class="ai-pattern">${esc(d.pattern)}</div>${breakdown}`),
      aiBubble(`<ol class="ai-steps">${d.steps.map(s=>`<li>${esc(s)}</li>`).join('')}</ol>`+
        (d.notes.length?`<ul class="ai-notes">${d.notes.map(s=>`<li>${esc(s)}</li>`).join('')}</ul>`:'')),
    ];
    if(a.step==='read'){
      msgs.push(`<div class="ai-row"><button class="ai-btn primary" data-a="ai-drill">Понятно, дай задания</button></div>`);
    }else{
      msgs.push(aiBubble('Закрепим: 3 коротких задания.','short'));
      for(let ei=0;ei<d.exercises.length&&ei<=a.picks.length;ei++){
        const ex=d.exercises[ei],opts=aiOptions(ex,ei),pick=a.picks[ei];
        msgs.push(aiBubble(`<div class="ai-q"><span class="ai-n">${ei+1}/3</span>${esc(ex.question)}</div>
          <div class="ai-verb"><b>${esc(ex.verb)}</b> ${esc(ex.reading)} · ${esc(ex.meaning)}</div>
          <div class="ai-opts">${opts.map((o,oi)=>{
            const cls=pick==null?'':o===ex.answer?' ok':oi===pick?' bad':' dim';
            return`<button class="ai-opt${cls}"${pick!=null?' aria-disabled="true"':''} data-a="ai-pick:${ei}:${oi}">${esc(o)}</button>`;}).join('')}</div>`));
        if(pick!=null){
          const ok=opts[pick]===ex.answer;
          msgs.push(aiBubble(esc(opts[pick]),'me'+(ok?' ok':' bad')));
          msgs.push(aiBubble(`${ok?'Верно.':`Правильно: <b class="jp">${esc(ex.answer)}</b>.`} ${esc(ex.why)}`,'short'));
        }
      }
      if(a.picks.length===d.exercises.length){
        const n=d.exercises.filter((ex,ei)=>aiOptions(ex,ei)[a.picks[ei]]===ex.answer).length;
        msgs.push(aiBubble(n===3?'3 из 3 — форма закреплена.':`${n} из 3. Перечитайте шаги выше и попробуйте эту форму ещё раз в тренировке.`,'short'));
      }
    }
    body=msgs.join('')+`<div class="ai-foot"><button class="ai-link" data-a="ai-report"${a.reported?' aria-disabled="true"':''}>${a.reported?'Отправлено на проверку':'Ошибка в объяснении?'}</button><span>Ответ сгенерирован ИИ</span></div>`;
  }
  return`<div class="ai-scrim" data-a="ai-close"></div>
    <section class="ai-sheet${anim?' anim':''}" role="dialog" aria-label="Объяснение правила">${head}<div class="ai-body" id="ai-body">${body}</div></section>`;
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
