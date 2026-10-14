const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const {runApp}=require('./load-app.cjs');
const source=['index.html','css/app.css',...require('./load-app.cjs').appScripts()].map(f=>fs.readFileSync(path.join(root,f),'utf8')).join('\n');
function app({storage=new Map(),tg=null,canStore=()=>true}={}){
 const handlers={};
 const nodes={app:{innerHTML:''},toast:{textContent:'',classList:{add(){},remove(){}}}};
 const document={getElementById:id=>nodes[id]||null,addEventListener(){},querySelector(){return null},activeElement:null};
 const ctx=vm.createContext({window:tg?{Telegram:{WebApp:tg}}:{},document,navigator:{},location:{hash:''},localStorage:{getItem:k=>storage.has(k)?storage.get(k):null,setItem:(k,v)=>{if(!canStore(k,v))throw Error('QuotaExceededError');storage.set(k,v);}},setTimeout(){},clearTimeout(){},console,Blob,URL,atob,FileReader:class{readAsText(f){this.onload({target:{result:f.text}});}}});
 runApp(ctx);
 return {run:code=>vm.runInContext(code,ctx),nodes,storage,handlers,ctx};
}
function searchInput(a){
 const listeners={};
 a.nodes['words-search']={addEventListener:(t,f)=>{listeners[t]=f;}};
 a.nodes['words-results']={innerHTML:''};
 a.run('bindAll()');
 return listeners;
}

test('dictionary search updates only the results, keeping the input (focus, IME) intact',()=>{
 const a=app();
 a.run(`S.tab='words';S.words=[{id:'1',kanji:'猫',reading:'ねこ',meaning:'кошка',folder:'Общая'},{id:'2',kanji:'犬',reading:'いぬ',meaning:'собака',folder:'Общая'}];`);
 const appBefore=a.nodes.app.innerHTML='SENTINEL';
 const on=searchInput(a);
 on.input({target:{value:'кош'},isComposing:false});
 assert.equal(a.nodes.app.innerHTML,appBefore,'whole app must not be re-rendered while typing');
 assert.match(a.nodes['words-results'].innerHTML,/猫/);
 assert.doesNotMatch(a.nodes['words-results'].innerHTML,/犬/);
});

test('dictionary search waits for IME composition to end',()=>{
 const a=app();
 a.run(`S.tab='words';S.words=[{id:'1',kanji:'猫',reading:'ねこ',meaning:'кошка',folder:'Общая'}];`);
 const on=searchInput(a);
 on.input({target:{value:'ね'},isComposing:true});
 assert.equal(a.run('S.wordsSearch'),'');
 on.compositionend({target:{value:'ねこ'}});
 assert.equal(a.run('S.wordsSearch'),'ねこ');
 assert.match(a.nodes['words-results'].innerHTML,/猫/);
});

test('unreadable saved data is backed up before it can be overwritten',()=>{
 const storage=new Map([['jl4','{"words":[{"id":"1"']]);
 const a=app({storage});
 assert.equal(storage.get('jl4.backup'),'{"words":[{"id":"1"');
 a.run(`act('hints-toggle:off')`);
 assert.equal(storage.get('jl4.backup'),'{"words":[{"id":"1"','backup survives later saves');
});

test('shuffle is an unbiased permutation and does not mutate input',()=>{
 const a=app();
 const src=[1,2,3,4,5];
 const out=a.run(`(()=>{const s=[1,2,3,4,5];const r=shuffle(s);return JSON.stringify({s,r:r.slice().sort()})})()`);
 assert.deepEqual(JSON.parse(out),{s:src,r:src});
 const first=JSON.parse(a.run(`(()=>{const c=[0,0,0];for(let i=0;i<30000;i++)c[shuffle([0,1,2])[0]]++;return JSON.stringify(c)})()`));
 for(const n of first)assert(Math.abs(n-10000)<600,`position counts skewed: ${first}`);
});

test('quiz settings empty state has a valid calc() width',()=>{
 assert.doesNotMatch(source,/calc\(100%-32px\)/);
});

function fakeTelegram(){
 const back={visible:false,show(){this.visible=true;},hide(){this.visible=false;},onClick(f){this.cb=f;}};
 return {BackButton:back,expand(){},ready(){},isVersionAtLeast:()=>true,setHeaderColor(){},setBackgroundColor(){},disableVerticalSwipes(){this.swipesOff=true;}};
}
const manyWords=n=>`S.words=Array.from({length:${n}},(_,i)=>({id:'w'+i,kanji:'語'+i,reading:'ご'+i,meaning:'слово '+i,folder:'Общая'}));`;

test('quiz «Количество» fixes the set of words and ends the session after N questions',()=>{
 const a=app();
 a.run(manyWords(200)+`S.quizCfg={...S.quizCfg,type:'words',mode:'choice4',question:['kanji'],answer:['reading'],count:'50',filter:'all',folders:[]};act('start-quiz');`);
 const r=JSON.parse(a.run(`(()=>{const seen=new Set();let n=0;while(S.quizQ&&n<300){seen.add(S.quizQ.word.id);n++;if(n%2){act('quiz-ans:0');act('next-q');}else act('skip-q');}return JSON.stringify({ids:[...seen],n,res:S.quizResults})})()`));
 assert.equal(r.n,50,'session stops after the chosen count');
 assert(r.ids.length<=50&&r.ids.length>30,'session covers most of its words');
 assert.equal(r.res.total,50);
 assert.match(a.run('buildApp()'),/Набор пройден/);
 a.run(`act('stop-quiz');act('start-quiz')`);
 assert.equal(a.run('S.quizLimit&&S.quizLimit.ids.size'),50,'a new session draws a new set');
});

test('compose «Количество» is not always the first N words of the bank',()=>{
 const a=app();
 a.run(`S.kanjiItems=[...new Set(BUILTIN_WORDS.flatMap(w=>[...w.w]).filter(isKanjiChar))].map((c,i)=>({id:'k'+i,kanji:c,folder:'Общая'}));S.quizCfg={...S.quizCfg,mode:'compose',composeMode:'normal',count:'50',filter:'all'};`);
 const firstN=new Set(JSON.parse(a.run(`JSON.stringify(builtinComposeWords().slice(0,50).map(w=>w.id))`)));
 const asked=new Set(JSON.parse(a.run(`(()=>{const r=[];for(let k=0;k<5;k++){act('stop-quiz');act('start-quiz');for(let i=0;i<20;i++){r.push(S.quizQ.word.id);act('skip-q');}}return JSON.stringify(r)})()`)));
 assert([...asked].some(id=>!firstN.has(id)),'compose pool must be sampled, not sliced');
});

test('a failed save tells the user instead of failing silently',()=>{
 let full=false;const a=app({canStore:()=>!full});
 full=true;a.run(`act('hints-toggle:off')`);
 assert.match(a.nodes.toast.textContent,/Не удалось сохранить/);
});

test('CSV download works even without the stored raw file',()=>{
 const a=app();
 a.run(`S.words=[{id:'1',kanji:'猫',reading:'ねこ',meaning:'кошка, кот',folder:'Общая'}];S.wordsCsv='';`);
 assert.match(a.run('buildSettings()'),/download-csv:words/);
 assert.equal(a.run(`itemsCsv('words')`),'kanji,reading,meaning,translation,notes,folder\n猫,ねこ,"кошка, кот",,,Общая\n');
});

test('unreadable practice save is backed up before it can be overwritten',()=>{
 const storage=new Map([['umi.practice.v1','{"version":1,"attempts":[']]);
 const a=app({storage});
 assert.equal(storage.get('umi.practice.v1.backup'),'{"version":1,"attempts":[');
 a.run(`uAction('mode:grammar')`);
 assert.equal(storage.get('umi.practice.v1.backup'),'{"version":1,"attempts":[');
});

test('practice save compacts finished-session answer details when storage is full',()=>{
 let limit=Infinity;const a=app({canStore:(k,v)=>k!=='umi.practice.v1'||v.length<limit});
 a.run(`UP.attempts=Array.from({length:2000},(_,i)=>({id:'old.'+i,sessionId:'old',exerciseId:UMI.exercises[0].id,selection:{choice:'x'.repeat(40)},firstAnswerCorrect:true,hintUsed:false,revealedAnswer:false,slotResults:[]}));
  UP.attempts.push({id:'live.1',sessionId:'live',exerciseId:UMI.exercises[0].id,selection:{choice:'keep'},firstAnswerCorrect:true,hintUsed:false,revealedAnswer:false,slotResults:[]});
  UP.sessions={x:{id:'live',lessonId:'x',exerciseIds:['a'],position:0}};`);
 limit=a.run('JSON.stringify(UP).length')-50000;
 assert.equal(a.run('uSave()'),true);
 assert.equal(a.run(`UP.attempts.filter(x=>x.selection).map(x=>x.id).join()`),'live.1');
});

test('dictionary renders long lists in pages',()=>{
 const a=app();
 a.run(manyWords(1000)+`S.tab='words';`);
 const count=()=>(a.run('buildWordsResults()').match(/class="ditem"/g)||[]).length;
 assert.equal(count(),300);assert.match(a.run('buildWordsResults()'),/words-more/);
 a.run(`act('words-more')`);assert.equal(count(),600);
 a.run(`act('words-tab:words')`);assert.equal(count(),300);
});

test('Telegram BackButton mirrors in-app navigation',()=>{
 const tg=fakeTelegram();const a=app({tg});
 a.run(manyWords(10)+'render()');
 assert.equal(tg.BackButton.visible,false);assert.equal(tg.swipesOff,true);
 a.run(`act('open-cfg:cards')`);assert.equal(tg.BackButton.visible,true);
 tg.BackButton.cb();assert.equal(a.run('S.cfgScreen'),null);assert.equal(tg.BackButton.visible,false);
 a.run(`act('tab:practice');uAction('catalog')`);assert.equal(tg.BackButton.visible,true);
 tg.BackButton.cb();assert.equal(a.run('UP.view'),'menu');assert.equal(tg.BackButton.visible,false);
 a.run(`act('go-import-home')`);assert.equal(tg.BackButton.visible,true);
 tg.BackButton.cb();assert.equal(a.run('S.screen'),'main');
});

test('source files contain no raw NUL bytes',()=>{
 assert(!source.includes('\0'));
});

/* ── Апдейт 11.10: словарь, папки, сопоставление ── */
const manyKanji=(n,extra='')=>`S.kanjiItems=Array.from({length:${n}},(_,i)=>({id:'k'+i,kanji:String.fromCodePoint(0x4e00+i*7),on_reading:'オン'+i,kun_reading:'くん.'+i,meaning:'смысл '+i,folder:'Общая'${extra}}));`;
function solveMatch(a){a.run(`(()=>{const q=S.quizQ;q.items.forEach((_,i)=>{act('match-pick:L:'+i);act('match-pick:R:'+i);});})()`);}

test('match session survives rounds even when filter «Не знаю» empties out',()=>{
 const a=app();
 a.run(manyKanji(8)+`S.quizCfg={...S.quizCfg,type:'kanji',mode:'match6',matchLeft:['meaning'],matchRight:['kanji'],filter:'unknown',count:'all',folders:[]};act('start-quiz');`);
 for(let r=0;r<4;r++){assert(a.run('Boolean(S.quizQ&&S.quizQ.match)'),'round '+r+' must have a question');solveMatch(a);a.run(`act('next-q')`);}
});

test('match with «Количество» ends once every word of the set was shown',()=>{
 const a=app();
 a.run(manyKanji(30)+`S.quizCfg={...S.quizCfg,type:'kanji',mode:'match6',matchLeft:['meaning'],matchRight:['kanji'],filter:'all',count:'20',folders:[]};act('start-quiz');`);
 const seen=new Set();let rounds=0;
 while(a.run('Boolean(S.quizQ)')&&rounds<20){for(const id of JSON.parse(a.run('JSON.stringify(S.quizQ.items.map(x=>x.id))')))seen.add(id);solveMatch(a);a.run(`act('next-q')`);rounds++;}
 assert.equal(seen.size,20);assert.equal(rounds,4);
 assert(a.run('Boolean(S.quizResults)'));
});

test('match rounds cycle through the pool before repeating',()=>{
 const a=app();
 a.run(manyKanji(30)+`S.quizCfg={...S.quizCfg,type:'kanji',mode:'match6',matchLeft:['meaning'],matchRight:['kanji'],filter:'all',count:'all',folders:[]};act('start-quiz');`);
 const seen=new Set();
 for(let r=0;r<5;r++){for(const id of JSON.parse(a.run('JSON.stringify(S.quizQ.items.map(x=>x.id))')))seen.add(id);solveMatch(a);a.run(`act('next-q')`);}
 assert.equal(seen.size,30);
});

test('pairs rounds cycle through on-reading groups before repeating',()=>{
 const a=app();
 a.run(`S.kanjiItems=Array.from({length:20},(_,i)=>({id:'k'+i,kanji:String.fromCodePoint(0x4e00+i),on_reading:'オン'+Math.floor(i/2),meaning:'m',folder:'Общая'}));S.quizCfg={...S.quizCfg,type:'kanji',mode:'pairs',filter:'all',count:'all',folders:[]};act('start-quiz');`);
 const groups=new Set();
 for(let r=0;r<2;r++){for(const on of JSON.parse(a.run('JSON.stringify(S.quizQ.options.map(o=>o.on))')))groups.add(on);a.run(`act('skip-q')`);}
 assert.equal(groups.size,10);
});

test('kun readings keep the grey okurigana in match tiles',()=>{
 const a=app();
 a.run(`S.kanjiItems=['見','早','先','空'].map((c,i)=>({id:'k'+i,kanji:c,kun_reading:'み.る・はや.い',meaning:'m'+i,folder:'Общая'}));S.quizCfg={...S.quizCfg,type:'kanji',mode:'match6',matchLeft:['kun_reading'],matchRight:['kanji'],filter:'all',count:'all'};`);
 a.run(`S.kanjiItems.forEach((w,i)=>w.kun_reading='み.る'+i)`);a.run(`act('start-quiz')`);
 assert.match(a.run('buildMatchActive(S.quizQ)'),/color:#636363/);
});

test('re-importing a kanji updates its meaning and keeps id, folder and progress',()=>{
 const a=app();
 a.run(`S.kanjiItems=[{id:'old',kanji:'日',on_reading:'ニチ',kun_reading:'ひ',meaning:'day',folder:'Кандзи'}];S.kanjiProgress={old:{reps:3,lapses:0,ef:2.5,interval:9,due:1,lastSeen:1}};
  act('go-import-home');act('import-type:kanji');S.importFolder='Новая';readFile({text:'kanji,on,kun,meaning\\n日,ニチ・ジツ,ひ,день\\n月,ゲツ,つき,луна'});act('confirm-import');`);
 assert.equal(a.run('S.kanjiItems.length'),2);
 assert.equal(a.run(`JSON.stringify(S.kanjiItems[0])`),JSON.stringify({id:'old',kanji:'日',on_reading:'ニチ',kun_reading:'ひ',meaning:'день',folder:'Кандзи',folders:['Новая']}));
 assert.equal(a.run('S.kanjiProgress.old.interval'),9);
 assert.match(a.nodes.toast.textContent,/обновлено 1/);
});

test('selected dictionary words become a native folder without leaving their own',()=>{
 const a=app();
 a.run(manyWords(5)+`S.tab='words';act('sel-start');act('sel-toggle:w1');act('sel-toggle:w3');act('sel-sheet');`);
 a.nodes['sel-folder-name']={value:'  Сложные '};
 a.run(`act('sel-new-folder')`);
 assert.deepEqual(JSON.parse(a.run(`JSON.stringify(foldersOf('words'))`)),['Общая','Сложные']);
 assert.equal(a.run(`filtered('words','all','all',['Сложные']).map(w=>w.id).join()`),'w1,w3');
 assert.equal(a.run(`filtered('words','all','all',['Общая']).length`),5);
 assert.equal(a.run(`S.selecting`),false);assert.equal(a.run('S.wordsFolder'),'Сложные');
 a.run(`act('sel-start');act('sel-toggle:w1');act('sel-sheet');act('sel-to-folder:Сложные')`);
 assert.equal(a.run(`JSON.stringify(S.words[1].folders)`),'["Сложные"]','no duplicate membership');
});

test('kanji dictionary has a 2-column grid and a one-per-page view with example words',()=>{
 const a=app();
 a.run(`S.tab='words';S.wordsTab='kanji';S.kanjiItems=[{id:'k1',kanji:'先',on_reading:'セン',kun_reading:'さき・ま.ず',meaning:'перед',folder:'Общая'}];S.words=[{id:'w1',kanji:'先',reading:'さき',meaning:'конец',folder:'Общая'}];`);
 const grid=a.run('buildWordsResults()');
 assert.match(grid,/class="kgrid"/);
 // он-пример — самое частотное слово (先生), со значением и выделенной частью чтения
 assert.match(grid,/он-чтение:<\/span><span class="kc-t">учитель<\/span><span class="kc-t">先生<\/span><span class="kc-t kc-yomi"><b>せん<\/b>せい/,'on example with meaning and highlighted reading');
 assert.match(grid,/<b>さき<\/b>/,'kun example from own words');
 a.run(`act('kanji-view:single')`);
 assert.match(a.run('buildWordsResults()'),/class="kpages"/);
});

test('Telegram back leaves dictionary selection first',()=>{
 const tg=fakeTelegram();const a=app({tg});
 a.run(manyWords(3)+`act('tab:words');act('sel-start');act('sel-toggle:w0');act('sel-sheet')`);
 assert.equal(tg.BackButton.visible,true);
 tg.BackButton.cb();assert.equal(a.run('S.selSheet'),false);assert.equal(a.run('S.selecting'),true);
 tg.BackButton.cb();assert.equal(a.run('S.selecting'),false);assert.equal(tg.BackButton.visible,false);
});

test('home mode cards expand in place with their settings and one card open at a time',()=>{
 const a=app();
 a.run(manyWords(30)+`S.kanjiItems=Array.from({length:10},(_,i)=>({id:'k'+i,kanji:'字'+i,on_reading:'ジ',kun_reading:'あざ',meaning:'знак',folder:'Общая'}));`);
 assert.doesNotMatch(a.run('buildHome()'),/Настроить:/);
 a.run(`act('home-open:cards')`);
 let html=a.run('buildHome()');
 assert.equal(a.run('S.cfgScreen'),null,'no separate settings screen');
 assert.match(html,/Лицевая сторона/);assert.match(html,/data-a="start-study"/);
 a.run(`act('home-open:quiz')`);
 html=a.run('buildHome()');
 assert.equal((html.match(/Настроить:/g)||[]).length,1,'opening another card closes the first');
 assert.match(html,/Что в ответе/);assert.equal(a.run('S.quizCfg.mode'),'choice6');
 a.run(`act('home-open:quiz')`);assert.equal(a.run('S.homeOpen'),null,'tap on an open header collapses it');
 // режимы только для кандзи пропадают у слов
 a.run(`act('home-tab:kanji');act('home-open:quiz-compose')`);
 assert.equal(a.run(`S.quizCfg.type+'/'+S.quizCfg.mode`),'kanji/compose');
 a.run(`act('home-tab:words')`);assert.equal(a.run('S.homeOpen'),null);
 assert.doesNotMatch(a.run('buildHome()'),/Собрать слово/);
});

test('sessions started from a home card return to it, with results on top',()=>{
 const a=app();
 a.run(manyWords(30)+`act('home-open:cards');act('study-count:20');act('start-study')`);
 assert.equal(a.run('S.studyQueue.length'),20);
 a.run(`act('stop-study')`);
 assert.equal(a.run(`S.tab+'/'+S.homeOpen+'/'+S.cfgScreen`),'home/cards/null');
 a.run(`act('start-study');for(let i=0;i<20;i++)act('mark:know')`);
 assert.match(a.run('buildApp()'),/Сессия завершена/);
 a.run(`act('stop-study')`);assert.match(a.run('buildApp()'),/class="home"/);
 // формы глаголов из практики меняют режим квиза — раскрытая карточка «Квиз» его возвращает
 a.run(`act('home-open:quiz');act('open-cfg:quiz-verbs');act('tab:home')`);
 assert.equal(a.run('S.quizCfg.mode'),'choice6');
});

test('word bank: every reading split matches the word, no artificial «X и Y» pairs, preferred examples exist',()=>{
 const a=app();
 const r=JSON.parse(a.run(`(()=>{
  const all=[...BUILTIN_WORDS,...ADDITIONAL_WORDS];
  const bad=all.filter(w=>w.k&&!segmentWord(w.w,w.r,w.k)).map(w=>w.w);
  const dropped=['海山','春夏','秋冬','山野','上見','小方','小人','間男','自殺','早起','気持','食物','買物'].filter(x=>all.some(w=>w.w===x));
  const missing=Object.entries(EXAMPLE_FOR).flatMap(([k,ws])=>ws.filter(x=>!x.includes(k)||!all.some(w=>w.w===x)));
  const umi=kanjiExamples({kanji:'海',on_reading:'カイ',kun_reading:'うみ'});
  const eat=kanjiExamples({kanji:'食',on_reading:'ショク',kun_reading:'た.べる'});
  return JSON.stringify({bad,dropped,missing,on:umi.on&&umi.on.word,kun:umi.kun&&umi.kun.word,eatOn:eat.on.word,eatKun:eat.kun.word});
 })()`));
 assert.deepEqual(r.bad,[],'reading splits must rebuild the reading');
 assert.deepEqual(r.dropped,[],'removed words must stay removed');
 assert.deepEqual(r.missing,[]);
 assert.equal(r.on,'海外');assert.equal(r.kun,'海辺');
 assert.equal(r.eatOn,'食事');assert.equal(r.eatKun,'食べ物');
});

test('quiz options show the first meaning with a «more» mark; the rest is kept for the long-press bubble',()=>{
 const a=app();
 a.run(manyWords(10)+`S.words[0].meaning='есть; кушать; питаться';`);
 const html=a.run(`firstSense('есть; кушать; питаться')+'|'+moreAttr('есть; кушать; питаться')+'|'+firstSense('море')+'|'+moreAttr('море')`);
 const [first,more,single,noMore]=html.split('|');
 assert.match(first,/^есть<i class="more-i"/);
 assert.equal(more,' data-more="есть\nкушать\nпитаться"');
 assert.equal(single,'море');assert.equal(noMore,'');
});

test('training screens: Стоп / Пропустить / Дальше in one row and the tab bar collapses',()=>{
 const a=app();
 a.run(manyWords(20)+`act('home-open:quiz');act('start-quiz')`);
 let html=a.run('buildApp()');
 assert.match(html,/data-a="stop-quiz">Стоп[\s\S]*data-a="skip-q">Пропустить[\s\S]*aria-disabled="true"[^>]*>Дальше/);
 assert.match(html,/class="bnav mini"/);
 a.run(`act('quiz-ans:0')`);
 assert.match(a.run('buildApp()'),/class="qact-btn primary" data-a="next-q">Дальше/);
 a.run(`act('stop-quiz')`);
 assert.doesNotMatch(a.run('buildApp()'),/class="bnav mini"/);
});

test('verb forms: every generated task is answerable from its chips and the task names the form unambiguously',()=>{
 const a=app();
 const r=JSON.parse(a.run(`(()=>{
  const bad=[];let n=0;
  const allCats=VERB_CATS_DATA.map(c=>c.v);
  const ms=(arr)=>{const c={};arr.forEach(j=>{c[j]=(c[j]||0)+1;});return c;};
  const fits=(seq,opts)=>{const c=ms(opts);return seq.every(j=>c[j]-->0);};
  for(const mode of ['A','B'])for(const lvl of ['easy','medium','hard'])for(const style of ['plain','polite','both']){
   S.quizCfg.verbMode=mode;S.quizCfg.verbLevel=lvl;S.quizCfg.verbStyle=style;S.quizCfg.verbCats=allCats.slice();
   S.quizRecent=[];
   for(let i=0;i<400;i++){
    const q=buildVerbQ();if(!q){bad.push('null '+mode+lvl+style);break;}n++;
    const tag=q.verb.d+' '+q.rule.id+' '+lvl+': ';
    if(!vbTextOk(q.task))bad.push(tag+'task '+q.task);
    if(q.options.includes('∅')||(q.stem.jp==='∅'))bad.push(tag+'∅ chip');
    if(mode==='A'){if(!fits(q.target,q.options))bad.push(tag+'target not in chips');}
    else{
     if(!fits(q.accepted[0].seq,q.options))bad.push(tag+'primary not in chips');
     if(q.accepted[0].seq.join('|')!==vbCards(q.verb,q.rule,LVL[lvl]).slice(1).map(c=>c.jp).join('|'))bad.push(tag+'primary is not the asked form');
     // все принятые формы дают то же задание
     q.accepted.forEach(x=>{const r=VERB_RULES.find(r=>r.id===x.id);if(vbText(q.verb,r.tp)!==vbText(q.verb,q.rule.tp))bad.push(tag+'accepts '+x.id);});
    }
   }
  }
  // скриншоты-примеры: задание передаёт время/отрицание/вежливость
  const V=id=>VERB_BANK.find(v=>v.d===id);
  const R=id=>VERB_RULES.find(r=>r.id===id);
  const ex={
   cause:vbText(V('寄る'),R('causative_masu_negative_past').tp),
   peel:vbText(V('剥く'),R('teiru_negative_ba').tp),
   praise:vbText(V('褒める'),R('teiru_negative_te').tp),
   peelAcc:vbAccepted(V('剥く'),vbText(V('剥く'),R('teiru_negative').tp),'剥','m').map(x=>x.id),
  };
  return JSON.stringify({bad:bad.slice(0,20),n,ex});
 })()`));
 assert.deepEqual(r.bad,[]);
 assert(r.n>=7000);
 assert.equal(r.ex.cause,'не заставил(а) зайти · вежливо');
 assert.equal(r.ex.peel,'если сейчас не чищу');
 assert.equal(r.ex.praise,'сейчас не хвалю, и…');
 assert.deepEqual(r.ex.peelAcc,['teiru_negative'],'«сейчас не чищу» принимает только 〜ていない');
});

/* ── Апдейт 14.10: подсказки шторкой, переключатели на канвасе, отметки ошибок, повторный импорт ── */
test('kanji hints slide out under the canvas instead of squeezing it; compose switches live on the canvas',()=>{
 const a=app();
 a.run(`S.kanjiItems=['食','事','物','見'].map((c,i)=>({id:'k'+i,kanji:c,on_reading:'ショク'+i,kun_reading:'た.べる',meaning:'m'+i,folder:'Общая'}));S.quizCfg={...S.quizCfg,type:'kanji',mode:'choice4',question:['kanji'],answer:['on_reading'],count:'all'};act('start-quiz');S.quizQ.word=S.kanjiItems[0];act('toggle-hint')`);
 assert.match(a.nodes.app.innerHTML,/cv-drop anim/,'drop slides out when opened');
 const html=a.run('buildApp()');
 assert.match(html,/<\/div><div class="cv-drop">.*食べる.*たべる/s,'hint drop follows the canvas');
 assert.doesNotMatch(html.split('cv-drop')[0],/hchip/,'no hint chips inside the canvas');
 a.run(`act('stop-quiz');S.kanjiItems=[...new Set(BUILTIN_WORDS.flatMap(w=>[...w.w]).filter(isKanjiChar))].map((c,i)=>({id:'k'+i,kanji:c,folder:'Общая'}));S.quizCfg={...S.quizCfg,mode:'compose',composeMode:'normal'};act('start-quiz')`);
 const c=a.run('buildApp()');
 assert.match(c,/class="cv-pills">.*compose-switch:reading.*compose-switch:meaning/s);
 assert.doesNotMatch(c,/cmp-switch/);
});

test('verb card «Ошибка в задании» stores the task and answers and can be exported',()=>{
 const a=app();
 a.run(`S.quizCfg={...S.quizCfg,mode:'verbs',verbMode:'B'};act('start-quiz');act('verb-flag')`);
 assert.match(a.run('buildApp()'),/role="checkbox" aria-checked="true"/);
 a.run(`act('verb-pick:0');act('next-q')`);
 const r=JSON.parse(a.run('JSON.stringify(S.verbReports)'));
 assert.equal(r.length,1);
 assert(r[0].task&&r[0].answers.length&&r[0].form&&r[0].built,'report keeps task, answers, form and what was built');
 assert.match(a.run('verbReportsCsv()'),/^ts,verb,reading/);
 assert.equal(JSON.parse(a.storage.get('jl4')).verbReports.length,1,'reports persist');
 a.run(`act('verb-flag');act('verb-flag')`);
 assert.equal(a.run('S.verbReports.length'),1,'unflagging a card removes only its own report');
});

test('re-import updates every copy of a kanji, and examples prefer Russian meanings',()=>{
 const a=app();
 a.run(`S.kanjiItems=[{id:'a',kanji:'海',on_reading:'カイ',kun_reading:'うみ',meaning:'sea',folder:'Общая'},{id:'b',kanji:'海',on_reading:'カイ',kun_reading:'うみ',meaning:'sea',folder:'Моя'}];
  S.importType='kanji';S.importPreview={words:[{id:'n',kanji:'海',on_reading:'カイ',kun_reading:'うみ',meaning:'море'}],headers:['kanji','meaning']};act('confirm-import')`);
 assert.equal(a.run(`S.kanjiItems.map(w=>w.meaning).join(',')`),'море,море');
 assert.equal(a.run('S.kanjiItems.length'),2);
 a.run(`S.words=[{id:'w',kanji:'海辺',reading:'うみべ',meaning:'seaside',folder:'Общая'}]`);
 assert.doesNotMatch(a.run(`kanjiExamples({kanji:'海',on_reading:'カイ',kun_reading:'うみ'}).kun.meaning`),/[a-z]/i);
});

test('«Объясни почему»: button only after an answer, explanation then 3 drills in order, signed request, closes on next',async()=>{
 const a=app({tg:{...fakeTelegram(),initData:'signed'}});
 const calls=[];
 a.run(`S.quizCfg={...S.quizCfg,mode:'verbs',verbMode:'A'};act('start-quiz')`);
 assert.doesNotMatch(a.run('buildApp()'),/data-a="ai-open"/,'no button before the answer');
 a.run(`for(let i=0;i<S.quizQ.target.length;i++)act('verb-pick:'+S.quizQ.options.indexOf(S.quizQ.target[i]))`);
 assert.match(a.run('buildApp()'),/data-a="ai-open"/);
 a.run(`AI_API='https://ai.example';`);
 a.ctx.fetch=async(url,init)=>{calls.push({url,init});return{ok:true,status:200,json:async()=>({variant:1,prompt_v:1,data:a.run('AI_DEMO')})};};
 a.run(`act('ai-open')`);
 assert.match(a.run('buildApp()'),/ai-typing/,'loading state');
 await new Promise(r=>setImmediate(r));await new Promise(r=>setImmediate(r));
 assert.equal(calls[0].url,'https://ai.example/v1/explain');
 assert.equal(calls[0].init.headers['x-telegram-init-data'],'signed');
 assert.deepEqual(Object.keys(JSON.parse(calls[0].init.body)).sort(),['form','seen'],'only the form id goes to the server');
 let html=a.run('buildApp()');
 assert.match(html,/ai-pattern/);assert.match(html,/data-a="ai-drill"/);assert.doesNotMatch(html,/ai-opt/);
 a.run(`act('ai-drill')`);
 html=a.run('buildApp()');
 assert.equal((html.match(/data-a="ai-pick:/g)||[]).length,4,'one drill at a time');
 a.run(`act('ai-pick:1:0');act('ai-pick:0:0')`);
 assert.equal(a.run('S.ai.picks.length'),1,'drills are answered in order');
 a.run(`act('ai-pick:1:0');act('ai-pick:2:0')`);
 assert.match(a.run('buildApp()'),/из 3/);
 assert.equal(a.run(`localStorage.getItem('umi.ai.v1')`),JSON.stringify({seen:{[a.run('S.ai.form')]:[1]}}));
 a.run(`act('next-q')`);
 assert.equal(a.run('S.ai'),null);
});
