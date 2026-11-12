const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const {runApp}=require('./load-app.cjs');

const WORDS=[
 ['傘','かさ','зонт'],['食べる','たべる','есть'],['勉強','べんきょう','учёба'],['電車','でんしゃ','поезд'],
 ['靴','くつ','обувь'],['鍵','かぎ','ключ'],['大きい','おおきい','большой'],['ねこ','ねこ','кошка'],
].map(([kanji,reading,meaning],i)=>({id:'w'+i,kanji,reading,meaning,folder:i<4?'Общая':'Genki'}));
const SERVER={key:'傘|かさ',variant:3,prompt_v:1,data:{
 s:{t:[['雨','あめ','дождь'],['が','','частица'],['降る','ふる','идти (о дожде)'],['から','','потому что'],['、','',''],['傘','かさ','зонт'],['を','','частица'],['持つ','もつ','брать'],['。','','']],
    i:5,ru:'Идёт дождь, поэтому беру зонт.',wrong:[['靴','くつ'],['鍵','かぎ'],['財布','さいふ']],c:[[0,1],[2,3],[5,6],[7]],orders:[[1,0,2,3]],extra:['傘に','かさに']},
 d:{t:[['雨','あめ','дождь'],['の','','частица'],['日','ひ','день'],['に','','в'],['使う','つかう','использовать'],['物','もの','вещь'],['。','','']]}}};

function app(){
 const storage=new Map();
 const nodes={app:{innerHTML:''},toast:{textContent:'',classList:{add(){},remove(){}}}};
 const document={getElementById:id=>nodes[id]||null,addEventListener(){},querySelector(){return null},activeElement:null};
 const ctx=vm.createContext({window:{},document,navigator:{},location:{hash:''},localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>{storage.set(k,v);}},setTimeout(){},clearTimeout(){},console,Blob,URL,atob});
 runApp(ctx);
 const run=code=>vm.runInContext(code,ctx);
 // все кандзи слов и примеров ученик «загрузил» — слова показываются кандзи
 run(`S.words=${JSON.stringify(WORDS)};S.progress={};S.kanjiItems=[...'傘食勉強電車靴鍵大雨降持財布日使物買'].map((c,i)=>({id:'k'+i,kanji:c,meaning:'x',folder:'Общая'}));`);
 return {run,nodes,storage,html:()=>nodes.app.innerHTML};
}
// отвечает на текущее задание: верно (right=true) или неверно
function answer(a,right){
 return a.run(`(()=>{const x=S.ex,q=x.q;
  if(q.type==='kanji'){const want=${right}?q.target:q.target.map(()=>'?');const used=[];
    for(const c of q.target.map((_,i)=>want[i])){let i=q.options.findIndex((o,k)=>o===c&&!used.includes(k));if(i<0)i=q.options.findIndex((o,k)=>!q.target.includes(o)&&!used.includes(k));used.push(i);exAct('pick:'+i);}
    if(!x.done){exAct('giveup');}}
  else if(q.type==='build'){const order=${right}?q.chunks:[...q.chunks].reverse();
    order.forEach(c=>exAct('pick:'+q.tiles.findIndex(t=>t.c===c)));}
  else exAct('ans:'+(${right}?q.correct:(q.correct+1)%q.options.length));
  return JSON.stringify({type:q.type,id:q.word.id,ok:x.ok,done:x.done});})()`);
}

test('home shows the «Упражнения» card for words with its own settings',()=>{
 const a=app();
 a.run(`render()`);
 assert.match(a.html(),/Упражнения/);
 assert.match(a.html(),/8 новых|0 повторить · 8 новых/);
 a.run(`act('home-open:exercises')`);
 assert.match(a.html(),/data-a="ex:count:40"/);
 assert.match(a.html(),/data-a="ex:folder:Genki"/);
 assert.match(a.html(),/data-a="ex:start"/);
 a.run(`act('ex:count:50');act('ex:folder:Genki')`);
 assert.equal(a.run(`S.exCfg.count+S.exCfg.folders.join()`),'50Genki');
 assert.match(a.storage.get('jl4'),/"exCfg":\{"count":"50","folders":\["Genki"\]\}/);
 assert.equal(a.run(`S.quizCfg.mode`),'choice6','quiz settings stay untouched');
 a.run(`act('home-tab:kanji')`);
 assert.doesNotMatch(a.html(),/ex:start/,'words only');
});

test('a session asks every word once with a random task and ends with a summary',()=>{
 for(let round=0;round<25;round++){
  const a=app();
  a.run(`act('ex:start')`);
  const seen=[],types=new Set();
  for(let i=0;i<8;i++){
   assert.equal(a.run(`!!S.ex.q`),true);
   assert.match(a.html(),/ex-task/);
   assert.match(a.html(),new RegExp(`${i+1} / 8`));
   const r=JSON.parse(answer(a,i%3!==0));
   assert.equal(r.done,true,`task ${r.type} was graded`);
   assert.equal(r.ok,i%3!==0,`task ${r.type} grading`);
   seen.push(r.id);types.add(r.type);
   a.run(`act('ex:next')`);
  }
  assert.equal(new Set(seen).size,8,'no word repeats');
  assert.match(a.html(),/Итог тренировки/);
  assert.equal(a.run(`S.ex.results.ok+':'+S.ex.results.bad`),'5:3');
  assert.match(a.html(),/Повторить ошибки/);
  a.run(`act('ex:retry')`);
  assert.equal(a.run(`S.ex.ids.length`),3);
  a.run(`act('ex:stop')`);
  assert.equal(a.run(`S.ex`),null);
  assert.equal(a.run(`Object.keys(S.progress).length`),8,'answers reach the shared review schedule');
 }
});

test('every local task type can be built, rendered and answered',()=>{
 const a=app();
 a.run(`S.words.forEach(w=>smUpdate(S.progress,w.id,4));S.ex={ids:[],wish:{},i:0,q:null,done:false,sel:-1,last:[],score:{ok:0,bad:0},fixed:[],errors:[],results:null}`);
 const make=(type,id)=>a.run(`(()=>{const x=S.ex;x.done=false;x.hint=false;x.hinted=false;x.sel=-1;x.q=exMake('${type}',S.words.find(w=>w.id==='${id}'),S.words);render();return !!x.q;})()`);
 assert(make('kanji','w2'));
 assert.match(a.html(),/Собери слово из кандзи/);
 assert.doesNotMatch(a.html(),/べん/,'reading is a hint, hidden by default');
 a.run(`act('ex:hint')`);
 assert.match(a.html(),/ex-furi">べん</);
 JSON.parse(answer(a,true));
 assert.equal(a.run(`S.ex.ok`),true);
 assert.equal(a.run(`S.progress.w2.reps`),2);
 assert(a.run(`S.progress.w2.ef`)<2.5,'a hint lowers the grade');
 assert(make('tail','w1'));
 assert.match(a.html(),/Допиши слово каной/);
 assert.equal(a.run(`S.ex.q.head+'|'+S.ex.q.tail`),'食|べる');
 assert.equal(a.run(`new Set(S.ex.q.options).size`),4);
 assert.equal(make('tail','w0'),false,'no kana tail — no task');
 assert.equal(make('kanji','w7'),false,'kana word — no kanji task');
 assert.equal(make('gap','w0'),false,'no sentence yet — falls back to another type');
 assert.equal(make('desc','w0'),false);
 assert(make('rj','w7'));
 assert.match(a.html(),/кошка/);
});

test('server sentences drive gap, build and description tasks and are marked as seen',()=>{
 const a=app();
 a.run(`S.words.forEach(w=>smUpdate(S.progress,w.id,4));S.ex={ids:[],wish:{},i:0,q:null,done:false,sel:-1,last:[],score:{ok:0,bad:0},fixed:[],errors:[],results:null}`);
 const make=type=>a.run(`(()=>{const x=S.ex;x.done=false;x.hint=false;x.hinted=false;x.sel=-1;EX.content.set('傘|かさ',${JSON.stringify(SERVER)});x.q=exMake('${type}',S.words[0],S.words);render();return !!x.q;})()`);
 assert(make('gap'));
 assert.match(a.html(),/ex-blank/);
 assert.match(a.html(),/data-more="雨 【あめ】\nдождь" data-more-kind="tok"/,'words can be held for reading and meaning');
 assert.doesNotMatch(a.html(),/Идёт дождь/,'translation is hidden until asked');
 assert.equal(a.run(`[...S.ex.q.options].sort().join()`),['傘','靴','鍵','財布'].sort().join());
 assert.equal(a.run(`EX.content.size`),0,'a served variant is used once');
 assert.match(a.storage.get('umi.ex.v1'),/"傘\|かさ":\["1:3"\]/);
 answer(a,true);
 assert.match(a.html(),/Идёт дождь/);
 assert(make('build'));
 assert.match(a.html(),/Собери предложение/);
 assert.equal(a.run(`S.ex.q.tiles.length`),5,'one extra tile');
 a.run(`[1,0,2,3].forEach(i=>exAct('pick:'+S.ex.q.tiles.findIndex(t=>t.i===i)))`);
 assert.equal(a.run(`S.ex.ok`),true,'an alternative word order is accepted');
 assert(make('build'));
 answer(a,false);
 assert.equal(a.run(`S.ex.ok`),false);
 assert(make('desc'));
 assert.match(a.html(),/Какое слово здесь описано/);
 answer(a,true);
 assert.equal(a.run(`S.ex.ok`),true);
});

test('dictionary examples are used when the server has nothing',()=>{
 const a=app();
 a.run(`S.words.forEach(w=>smUpdate(S.progress,w.id,4));S.ex={ids:[],wish:{},i:0,q:null,done:false,sel:-1,last:[],score:{ok:0,bad:0},fixed:[],errors:[],results:null};
  EX.byKey.set('傘|かさ',{w:'傘',r:'かさ',k:[{c:'傘',r:'かさ'}],s:[0]});
  EX.sents=[{jp:'傘を買った。',ru:'Я купил зонт.',src:{ja:1,ru:2,by:['a','b']},t:[['{傘|かさ}','','かさ','зонт'],['を','','','частица'],['{買|か}った','買う','かう','покупать']]}];
  S.ex.q=exMake('gap',S.words[0],S.words);render();`);
 assert.equal(a.run(`S.ex.q.segs[S.ex.q.ti].s`),'傘');
 assert.match(a.html(),/<ruby>買<rt>か<\/rt><\/ruby>った/);
 answer(a,true);
 assert.match(a.html(),/Я купил зонт/);
});

test('kana mode (off by default): kanji the learner has not loaded fall back to kana',()=>{
 const a=app();
 a.run(`EX.kana=true;S.kanjiItems=S.kanjiItems.filter(k=>'雨日'.includes(k.kanji));S.words.forEach(w=>smUpdate(S.progress,w.id,4));
  S.ex={ids:[],wish:{},i:0,q:null,done:false,sel:-1,last:[],score:{ok:0,bad:0},fixed:[],errors:[],results:null}`);
 const make=type=>a.run(`(()=>{const x=S.ex;x.done=false;x.hint=false;x.hinted=false;x.sel=-1;EX.content.set('傘|かさ',${JSON.stringify(SERVER)});x.q=exMake('${type}',S.words[0],S.words);render();return !!x.q;})()`);
 assert.equal(make('kanji'),false,'no kanji task for an unknown kanji');
 assert.equal(a.run(`!!exMake('tail',S.words[1],S.words)`),false);
 assert(make('jr'));
 assert.match(a.html(),/ex-word jp">かさ</);
 assert(make('rj'));
 assert.doesNotMatch(a.run(`S.ex.q.options.map(o=>o.t).join()`),/[\u4e00-\u9fff]/);
 assert(make('gap'));
 assert.equal(a.run(`S.ex.q.options[S.ex.q.correct]`),'かさ');
 assert.equal(a.run(`[...S.ex.q.options].sort().join()`),['かさ','くつ','かぎ','さいふ'].sort().join());
 assert.match(a.html(),/<ruby>雨<rt>あめ<\/rt><\/ruby>/,'known kanji keep furigana');
 assert.match(a.html(),/>ふる</,'unknown kanji are written in kana');
 assert.doesNotMatch(a.html().replace(/data-more="[^"]*"/g,'').replace(/<nav[\s\S]*$/,''),/[降持傘靴鍵財布]/);
 assert(make('build'));
 assert.equal(a.run(`S.ex.q.chunks.join('|')`),'雨が|ふるから|かさを|もつ');
 answer(a,false);
 assert.match(a.html(),/ex-chunk">雨が<\/span><span class="ex-chunk">ふるから/,'the right sentence replaces the wrong one in the canvas');
});

test('after an answer the canvas marks the result itself: no drawer, the right answer as a note',()=>{
 const a=app();
 a.run(`S.words.forEach(w=>smUpdate(S.progress,w.id,4));S.ex={ids:[],wish:{},i:0,q:null,done:false,sel:-1,last:[],score:{ok:0,bad:0},fixed:[],errors:[],results:null}`);
 const make=(type,i)=>a.run(`(()=>{const x=S.ex;x.done=false;x.hint=false;x.hinted=false;x.sel=-1;x.q=exMake('${type}',S.words[${i}],S.words);render();return !!x.q;})()`);
 assert(make('kanji',0),'kanji tasks do not depend on the kanji list');
 assert(make('rj',0));
 assert.match(a.html(),/[\u4e00-\u9fff]/,'kanji are shown');
 answer(a,true);
 assert.match(a.html(),/quiz-q ok/);
 assert.doesNotMatch(a.html(),/ex-fix|cv-drop|Правильно/,'a right answer is not repeated');
 assert(make('rj',0));
 answer(a,false);
 assert.match(a.html(),/quiz-q bad/);
 assert.match(a.html(),/ex-fix">Правильно: <b class="jp">傘<\/b> <span class="jp">かさ<\/span>/);
 assert.doesNotMatch(a.html(),/cv-drop/);
 assert(make('kanji',2));
 answer(a,false);
 assert.match(a.html(),/ex-fix">Показан правильный ответ/);
 assert.doesNotMatch(a.html(),/ex-slot[^"]*bad/);
});

test('meanings show the first sense only, the rest on a long tap',()=>{
 const a=app();
 a.run(`S.words[0].meaning='зонт; зонтик от солнца; укрытие';S.words[0].translation='';S.words.forEach(w=>smUpdate(S.progress,w.id,4));
  S.ex={ids:[],wish:{},i:0,q:null,done:false,sel:-1,last:[],score:{ok:0,bad:0},fixed:[],errors:[],results:null};
  S.ex.q=exMake('rj',S.words[0],S.words);render();`);
 assert.match(a.html(),/ex-prompt" data-more="зонт\nзонтик от солнца\nукрытие">зонт<i class="more-i"/);
 a.run(`S.ex.q=exMake('jr',S.words[0],S.words);render();`);
 assert.match(a.html(),/class="qopt [^>]*data-more="зонт\nзонтик от солнца\nукрытие"[^>]*>зонт<i class="more-i"/);
});

test('a word with several spellings and readings uses the first of each',()=>{
 const a=app();
 a.run(`S.words[0].kanji='格好いい, 格好良い';S.words[0].reading='かっこいい, かっこよい, カッコイイ';S.words[0].meaning='to come true (of a dream, wish, etc.), to be realized, to be fulfilled, to be granted';`);
 assert.equal(a.run(`exKey(S.words[0])`),'格好いい|かっこいい');
 assert.equal(a.run(`exShow(S.words[0])`),'格好いい');
 assert(a.run(`exM(S.words[0]).length`)<=24,'the meaning sent to the server and shown is short');
});

test('words that wait for a server sentence are held back until it arrives',()=>{
 const a=app();
 a.run(`act('ex:start');const x=S.ex,ids=x.ids.slice(x.i+1);
  ids.forEach(id=>x.wish[id]='jr');x.wish[ids[0]]='gap';
  globalThis.K=exKey(S.words.find(w=>w.id===ids[0]));globalThis.FIRST=ids[0];EX.wait=new Set([K]);act('ex:skip')`);
 assert.notEqual(a.run(`S.ex.ids[S.ex.i]`),a.run(`FIRST`),'a ready word goes first');
 assert.equal(a.run(`S.ex.ids.length`),8);
 a.run(`EX.wait.delete(K);const w=S.words.find(w=>w.id===FIRST);if(K==='傘|かさ')EX.content.set(K,${JSON.stringify(SERVER)});act('ex:skip')`);
 assert.equal(a.run(`S.ex.ids[S.ex.i]`),a.run(`FIRST`),'and the held word comes right after the answer arrives');
});
