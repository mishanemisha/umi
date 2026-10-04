const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
const root=path.resolve(__dirname,'../..');
function app(storage=new Map()){
 const nodes={app:{innerHTML:''},toast:{textContent:'',classList:{add(){},remove(){}}}};
 const document={getElementById:id=>nodes[id]||null,addEventListener(){},querySelector(){return null},activeElement:null};
 const ctx=vm.createContext({window:{},document,location:{hash:''},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout(){},console,Blob,URL});
 for(const file of ['content/practice-data.js','content/practice.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx);
 const main=[...fs.readFileSync(path.join(root,'index.html'),'utf8').matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];vm.runInContext(main,ctx);
 vm.runInContext(`
 function answerCurrent(){const e=uCurrent(),a=uAnswer(e);if(e.type==='order')a.selection=e.acceptedSequences[0].slice();else if(e.type==='input')a.selection.text=e.acceptedTexts[0];else if(e.type==='gap')a.selection=Object.fromEntries(e.slots.map(s=>[s.id,s.acceptedOptionIds[0]]));else a.selection.choice=e.acceptedChoiceIds[0];uCheck();}
 function finishRun(){while(uCurrent()){answerCurrent();uAction('next');}}
 function pickFixture(id){const e=UEX[id];UP.session={id:'fixture.'+id,lessonId:e.lessonId,mode:'grammar',difficulty:'all',exerciseIds:[id],position:0,answers:{},optionOrders:{[id]:e.options.map(o=>o.id)}};UP.sessions[e.lessonId]=UP.session;UP.view='session';return e;}
 `,ctx);
 return {ctx,storage,run:code=>vm.runInContext(code,ctx)};
}
test('bank IDs, references, answer contracts, three choice-based interactions and provenance',()=>{
 const {run}=app(),bank=run('UMI');assert.equal(bank.lessons.length,23);assert(bank.exercises.length>1400);assert.equal(new Set(bank.exercises.map(e=>e.id)).size,bank.exercises.length);
 for(const l of bank.lessons){assert(l.exerciseIds.length>=45);assert(l.rules.length>=4);for(const id of l.exerciseIds)assert(bank.exercises.some(e=>e.id===id));for(const id of l.wordIds)assert(bank.words.some(w=>w.id===id));}
 for(const e of bank.exercises){const ids=e.options.map(o=>o.id);assert.equal(new Set(ids).size,ids.length,e.id);const keys=[...e.acceptedChoiceIds,...e.slots.flatMap(s=>s.acceptedOptionIds),...e.acceptedSequences.flat()];if(e.type==='input'){assert(e.acceptedTexts.length,e.id);assert.equal(ids.length,0);}else{assert(keys.length,e.id);assert(keys.every(id=>ids.includes(id)),e.id);}const markers=e.prompt.map(t=>t.text).join('').match(/\{\{([^}]+)\}\}/g)||[];assert.equal(markers.length,e.slots.length,e.id);assert.equal(e.status,'draft');assert.equal(e.provenance.editorialReview,'pending');if(e.type==='order')assert(e.options.length>=e.requiredCount);assert(['basic','standard','challenge'].includes(e.difficulty));}
});
test('all lessons provide 20 mixed questions by default with choice and order',()=>{
 const {run}=app();assert.equal(run(`UMI.lessons.every(l=>{UP.session=null;UP.mode='mixed';uStart(l.id);const es=UP.session.exerciseIds.map(id=>UEX[id]);return es.length===20&&new Set(es.map(e=>e.id)).size===20&&es.some(e=>e.type==='choice')&&es.some(e=>e.type==='gap')&&es.some(e=>e.type==='order')&&uValidSession(UP.session)&&es.every((e,i)=>!i||!e.skillIds.some(id=>es[i-1].skillIds.includes(id)));})`),true);
});
test('10, 40 and all sizes use real available counts without duplicates',()=>{
 const {run}=app();assert.equal(run(`['10','40','all'].every(size=>{UP.sessions={};UP.session=null;UP.count=size;uStart('umi-l17');return UP.session.exerciseIds.length===(size==='all'?ULESSONS['umi-l17'].exerciseIds.length:Number(size))&&new Set(UP.session.exerciseIds).size===UP.session.exerciseIds.length;})`),true);
});
test('all challenge pools have 20 harder questions and no basic exercise',()=>{
 const {run}=app();assert.equal(run(`UMI.lessons.every(l=>{UP.session=null;UP.sessions={};UP.mode='mixed';UP.difficulty='challenge';uStart(l.id);return UP.session.exerciseIds.length===20&&UP.session.exerciseIds.every(id=>UEX[id].difficulty==='challenge')&&UP.session.exerciseIds.some(id=>UEX[id].legacyInput);})`),true);
});
test('grammar includes sentence building; vocabulary avoids grammar',()=>{
 const {run}=app();assert.equal(run(`UP.mode='grammar';uStart('umi-l17');UP.session.exerciseIds.every(id=>UEX[id].focus!=='vocabulary'&&(UEX[id].focus==='grammar'||UEX[id].type==='order'))`),true);assert.equal(run(`UP.sessions={};UP.mode='vocabulary';uStart('umi-l17');UP.session.exerciseIds.every(id=>UEX[id].focus==='vocabulary')`),true);
});
test('repeat session prioritises fresh IDs while available, not just shuffled options',()=>{
 const {run}=app();assert.equal(run(`UP.count='20';uStart('umi-l17');const first=UP.session.exerciseIds.slice();finishRun();uStart('umi-l17');const second=UP.session.exerciseIds.slice();const fresh=second.every(id=>!first.includes(id));finishRun();uStart('umi-l17');fresh&&UP.session.exerciseIds.every(id=>!first.includes(id)&&!second.includes(id))`),true);
});
test('unfinished sessions in two lessons persist independently across reload',()=>{
 const a=app();a.run(`UP.mode='grammar';UP.difficulty='basic';uStart('umi-l04');uAction('pick:o1');const first=UP.session.id;uStart('umi-l08');uAction('pick:o1');uSave();`);const snapshot=a.run('JSON.stringify(UP.sessions)');const b=app(a.storage);assert.equal(b.run('JSON.stringify(UP.sessions)'),snapshot);assert.equal(b.run(`uAction('resume:umi-l04');UP.session.id`),a.run('first'));
 assert.equal(b.run(`uAction('resume:umi-l04');uAnswer(uCurrent()).selection.answer==='o1'`),true);
 assert.equal(b.run(`uAction('resume:umi-l08');uAnswer(uCurrent()).selection.answer==='o1'`),true);
});
test('starting an incomplete lesson resumes it instead of replacing its answers',()=>{
 const {run}=app();assert.equal(run(`uStart('umi-l06');const saved=UP.session.id;answerCurrent();uAction('next');uStart('umi-l07');uStart('umi-l06');UP.session.id===saved&&UP.session.position===1`),true);
});
test('legacy five-question saves migrate and retain progress and option order',()=>{
 const a=app();a.run(`UP.mode='grammar';UP.difficulty='basic';uStart('umi-l04');UP.session.exerciseIds=UP.session.exerciseIds.slice(0,5);uAction('pick:o1');uSave();`);const old=JSON.parse(a.storage.get('umi.practice.v1'));delete old.sessions;delete old.history;delete old.count;delete old.difficulty;a.storage.set('umi.practice.v1',JSON.stringify(old));const b=app(a.storage);assert.equal(b.run(`UP.count==='20'&&UP.session.exerciseIds.length===5&&UP.sessions['umi-l04'].id===UP.session.id&&uAnswer(uCurrent()).selection.answer==='o1'`),true);
});
test('wrong first attempt remains wrong after correction and cannot double count',()=>{
 const {run}=app();assert.equal(run(`const e=pickFixture('umi-l01.g01.gap'),a=uAnswer(e);a.selection.answer='o1';uCheck();a.selection.answer='o0';a.checked=false;uCheck();uCheck();UP.attempts.length===1&&!UP.attempts[0].firstAnswerCorrect&&UP.attempts[0].corrected&&Boolean(UP.mistakes[e.id])&&UP.skills[e.skillIds[0]].independentCorrect===0`),true);
});
test('hint and reveal remain separate from independent knowledge',()=>{
 const {run}=app();assert.equal(run(`const e=pickFixture('umi-l02.g01.gap'),a=uAnswer(e);uAction('hint');a.selection.answer='o0';uCheck();UP.attempts[0].hintUsed&&UP.skills[e.skillIds[0]].independentCorrect===0&&Boolean(UP.mistakes[e.id])`),true);const b=app();assert.equal(b.run(`pickFixture('umi-l03.g01.gap');uAction('reveal');UP.attempts.length===1&&UP.attempts[0].revealedAnswer&&!UP.attempts[0].firstAnswerCorrect`),true);
});
test('all former typed exercises now use multiple options with accepted aliases',()=>{
 const {run}=app();assert.equal(run(`UMI.exercises.every(e=>e.type!=='input'&&!e.instructionRu.includes('Запиши'))&&UMI.exercises.filter(e=>e.legacyInput).every(e=>e.options.length>=4&&e.acceptedTexts.every(text=>e.options.some(o=>uNormalize(o.text)===uNormalize(text)&&e.acceptedChoiceIds.includes(o.id))))`),true);
});
test('legacy typed unfinished answer migrates to choice and survives reload',()=>{
 const a=app();a.run(`const e=pickFixture('umi-l17.g03.variant.input');uAnswer(e).selection={text:e.acceptedTexts[0]};UP.session.optionOrders[e.id]=[];uSave();`);const b=app(a.storage);assert.equal(b.run(`uAnswer(uCurrent()).selection.choice===uCurrent().acceptedChoiceIds[0]&&UP.attempts.length===0&&uValidSession(UP.session)`),true);
});
test('multi gaps require every slot, preserve active slot and correct all independent answers',()=>{
 const {run}=app();assert.equal(run(`const e=pickFixture('umi-l17.combine1'),a=uAnswer(e);uAction('pick:'+e.slots[0].acceptedOptionIds[0]);const incomplete=!uReady(e,a)&&a.activeSlot==='right';uAction('pick:'+e.slots[1].acceptedOptionIds[0]);incomplete&&uReady(e,a)&&uCorrect(e,a)`),true);
});
test('order checks declared sequences and allows only required number of blocks, excluding distractor',()=>{
 const {run}=app();assert.equal(run(`UMI.exercises.filter(e=>e.type==='order').every(e=>e.acceptedSequences.every(seq=>uCorrect(e,{selection:seq}))&&!uCorrect(e,{selection:e.acceptedSequences[0].slice().reverse()}))`),true);assert.equal(run(`const e=pickFixture('umi-l17.g03.variant.order'),a=uAnswer(e);e.acceptedSequences[0].forEach(id=>uAction('pick:'+id));uAction('pick:extra');a.selection.length===e.requiredCount&&uReady(e,a)&&!a.selection.includes('extra')`),true);
});
test('reading hides furigana and answer hints, including typed reading',()=>{
 const {run}=app();assert.equal(run(`UMI.exercises.filter(e=>e.display.hideReadings).every(e=>{pickFixture(e.id);const html=uSessionView();return !html.includes('<ruby>')&&!html.includes('data-a="up:hint"');})`),true);
});
test('choice answer IDs remain stable under repeated option shuffles',()=>{
 const {run}=app();assert.equal(run(`UMI.exercises.filter(e=>e.type==='choice').every(e=>Array.from({length:5},()=>uShuffle(e.options)).every(os=>uCorrect(e,{selection:{choice:os.find(o=>e.acceptedChoiceIds.includes(o.id)).id}})))`),true);
});
test('word integration preserves existing ID, meaning, folder and SRS',()=>{
 const {run}=app();assert.equal(run(`const w=UMI.words[0];S.words=[{id:'old',kanji:w.surface,reading:w.reading,meaning:'своё значение',folder:'Моя'}];S.progress.old={reps:7,due:123};uAddWord(w.id);uAddWord(w.id);S.words.length===1&&UP.wordLinks[w.id]==='old'&&S.progress.old.reps===7&&S.words[0].meaning==='своё значение'`),true);assert.equal(run(`uAddWord(UMI.words[1].id);uAddWord(UMI.words[1].id);S.words.length===2`),true);
});
test('error review offers other examples immediately; original is delayed, success clears matching skills',()=>{
 const {run}=app();assert.equal(run(`const e=pickFixture('umi-l17.g03.gap'),a=uAnswer(e);a.selection.answer='o1';uCheck();UP.mode='mistakes';UP.session=null;const pool=uPool('all');pool.length>0&&!pool.some(q=>q.id===e.id)&&pool.some(q=>q.skillIds.includes(e.skillIds[0])&&q.familyId!==e.familyId)`),true);assert.equal(run(`const other=pickFixture('umi-l17.g03.variant');answerCurrent();!Object.keys(UP.mistakes).some(id=>UEX[id].skillIds.every(skill=>other.skillIds.includes(skill)))`),true);
});
test('20-question summary/history is idempotent and survives roundtrip',()=>{
 const {run}=app();assert.equal(run(`uStart('umi-l10');finishRun();uFinish();uFinish();UP.history.length===1&&UP.history[0].independentCorrect===UP.history[0].answerCount&&UP.attempts.length===20&&uSessionView().includes('Тренировка завершена')&&uValidateProgress(JSON.parse(JSON.stringify(UP))).history.length===1`),true);
});
test('import validates all IDs and malformed input before replacing state',()=>{
 const {run}=app();assert.equal(run(`pickFixture('umi-l06.g01.gap');uAction('reveal');uValidateProgress(JSON.parse(JSON.stringify(UP))).attempts.length===1`),true);assert.throws(()=>run(`uValidateProgress({version:1,attempts:[{}],skills:{},mistakes:{},wordLinks:{}})`));assert.throws(()=>run(`uValidateProgress({...UP,session:{exerciseIds:['missing']}})`));
});
test('all lesson and exercise screens build, using existing UI components',()=>{
 const {run}=app();assert.equal(run(`TABS.length===4&&TABS.some(t=>t.id==='practice')`),true);assert.equal(run(`UMI.lessons.every(l=>{UP.lessonId=l.id;UP.view='lesson';const html=buildPractice();return html.includes(l.titleRu)&&html.includes('cfg-card')&&html.includes('nstats')&&html.includes('chip');})`),true);assert.equal(run(`UMI.exercises.every(e=>{pickFixture(e.id);const html=buildPractice();return html.includes('Проверить')&&html.includes('quiz-q')&&html.includes(e.type==='input'?'quiz-inp':'quiz-opts');})`),true);
});

test('imports also validate parked session answers, not just the active session',()=>{
 const {run}=app();run(`pickFixture('umi-l17.g03.variant.input');uAnswer(uCurrent()).selection.choice='o0';uSave();const exported=JSON.parse(JSON.stringify(UP));exported.session=null;exported.sessions['umi-l17'].answers['umi-l17.g03.variant.input'].selection.choice={bad:true};`);assert.throws(()=>run('uValidateProgress(exported)'));
});
test('every available exercise can be checked, finished and restored, including all saved answers',()=>{
 const {run}=app();assert.equal(run(`UMI.exercises.every(e=>{pickFixture(e.id);answerCurrent();uAction('next');return UP.history.some(h=>h.id===UP.session.id)&&uValidSession(UP.session);})&&uValidateProgress(JSON.parse(JSON.stringify(UP))).attempts.length===UMI.exercises.length`),true);
});

test('paired situation translations preserve Russian agreement and do not cascade time replacements',()=>{
 const {run}=app();assert.equal(run(`UEX['umi-l01.g03.situation'].translationRu==='Это мой журнал.'&&UEX['umi-l07.g04.situation'].translationRu==='Этот журнал дешёвый и интересный.'&&UEX['umi-l04.g05.situation'].translationRu==='Позавчера пил воду. Вежливо.'&&UEX['umi-l11.g02.situation'].translationRu.includes('читаю журналы')`),true);
});

test('two gaps credit the first correct answer, lock it and review only failed skill',()=>{
 const {run}=app();assert.equal(run(`const e=pickFixture('umi-l17.combine1'),a=uAnswer(e),left=e.slots[0],right=e.slots[1];a.selection={left:left.acceptedOptionIds[0],right:e.options.find(o=>!right.acceptedOptionIds.includes(o.id)&&o.id!==left.acceptedOptionIds[0]).id};uCheck();const first=UP.attempts[0];const partial=!a.correct&&uCleanUnits(first)===1&&UP.skills[left.skillIds[0]].independentCorrect===1&&UP.skills[right.skillIds[0]].errors===1&&UP.mistakes[e.id].skillIds.every(id=>right.skillIds.includes(id));uAction('slot:left');const locked=a.activeSlot==='right';uAction('pick:'+right.acceptedOptionIds[0]);uCheck();uAction('next');partial&&locked&&a.correct&&uCleanUnits(first)===1&&uResultView().includes('1 из 2 ответов')&&uValidateProgress(JSON.parse(JSON.stringify(UP))).attempts[0].slotResults.length===2`),true);
});
test('old partial gap attempt migrates without losing its correct skill',()=>{
 const {run}=app();assert.equal(run(`const e=pickFixture('umi-l17.combine1'),a=uAnswer(e);a.selection={left:e.slots[0].acceptedOptionIds[0],right:e.options.find(o=>!e.slots[1].acceptedOptionIds.includes(o.id)&&o.id!==e.slots[0].acceptedOptionIds[0]).id};uCheck();const old=JSON.parse(JSON.stringify(UP));delete old.attempts[0].slotResults;const migrated=uValidateProgress(old);migrated.skills[e.slots[0].skillIds[0]].independentCorrect===1&&migrated.mistakes[e.id].skillIds.every(id=>e.slots[1].skillIds.includes(id))`),true);
});
test('combined lessons restrict every source, include mixed texts and restore separately',()=>{
 const a=app();assert.equal(a.run(`UP.selectedLessons=['umi-l01','umi-l17'];const key=uMixKey();uStart(key);UP.session.exerciseIds.some(id=>UEX[id].mixedText)&&UP.session.exerciseIds.every(id=>(UEX[id].lessonIds||[UEX[id].lessonId]).every(l=>UP.selectedLessons.includes(l)))&&UP.session.exerciseIds.some(id=>UEX[id].lessonId==='umi-l01')&&UP.session.exerciseIds.some(id=>UEX[id].lessonId==='umi-l17')`),true);a.run('answerCurrent();uAction("next");uSave()');const b=app(a.storage);assert.equal(b.run(`UP.selectedLessons.length===2&&UP.session.position===1&&uValidSession(UP.session)&&uMixView().includes('Продолжить смешанную')`),true);assert.equal(b.run(`finishRun();UP.history.length===1&&uValidateProgress(JSON.parse(JSON.stringify(UP))).history.length===1`),true);
});
test('single lesson excludes mixed texts; all topics have small Genki attribution',()=>{
 const {run}=app();assert.equal(run(`!uPool('umi-l01').some(e=>e.mixedText)&&uCatalogView().includes('≈ Genki I · урок 1')&&uCatalogView().includes('покрытие грамматики, лексики и чтения частичное')`),true);
});

test('partial errors repeat only failed skill and imports reject fabricated unit results',()=>{
 const {run}=app();run(`const e=pickFixture('umi-l17.combine1'),a=uAnswer(e);a.selection={left:e.slots[0].acceptedOptionIds[0],right:e.options.find(o=>!e.slots[1].acceptedOptionIds.includes(o.id)&&o.id!==e.slots[0].acceptedOptionIds[0]).id};uCheck();UP.mode='mistakes';const errors=uPool('umi-l17');`);assert.equal(run(`uCounts().independent===1&&errors.every(x=>x.skillIds.some(id=>e.slots[1].skillIds.includes(id)))`),true);assert.throws(()=>run(`const broken=JSON.parse(JSON.stringify(UP));broken.attempts[0].slotResults[0].skillIds=['invented'];uValidateProgress(broken)`));
});
