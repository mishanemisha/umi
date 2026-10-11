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
 return {run:code=>vm.runInContext(code,ctx),nodes,storage,handlers};
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

test('quiz «Количество» fixes the set of words for the whole session',()=>{
 const a=app();
 a.run(manyWords(200)+`S.quizCfg={...S.quizCfg,type:'words',mode:'choice4',question:['kanji'],answer:['reading'],count:'50',filter:'all',folders:[]};act('start-quiz');`);
 const ids=JSON.parse(a.run(`(()=>{const seen=new Set();for(let i=0;i<300;i++){seen.add(S.quizQ.word.id);act('skip-q');}return JSON.stringify([...seen])})()`));
 assert(ids.length<=50,`asked ${ids.length} different words with count 50`);
 assert(ids.length>40,'session should cover most of its words');
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
 a.run(manyKanji(8)+`S.quizCfg={...S.quizCfg,type:'kanji',mode:'match6',matchLeft:['meaning'],matchRight:['kanji'],filter:'unknown',count:'50',folders:[]};act('start-quiz');`);
 for(let r=0;r<4;r++){assert(a.run('Boolean(S.quizQ&&S.quizQ.match)'),'round '+r+' must have a question');solveMatch(a);a.run(`act('next-q')`);}
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
 assert.match(grid,/kex-l">on<\/span><span class="kex-w">先.<\/span><span class="kex-r"><b>せん<\/b>/,'on example with highlighted reading');
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
