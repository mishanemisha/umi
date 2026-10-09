const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const {runApp}=require('./load-app.cjs');
const legacyHtml=execFileSync('git',['show','22778b8:index.html'],{cwd:root,maxBuffer:3000000}).toString();
function app({storage=new Map(),legacy=false,quota=false}={}){
 const nodes={app:{innerHTML:''},toast:{textContent:'',classList:{add(){},remove(){}}}},readers=[],writes=[];
 const document={getElementById:id=>nodes[id]||null,addEventListener(){},querySelector(){return null},activeElement:null};
 class FileReader{
  constructor(){readers.push(this);}
  readAsText(file,encoding){this.file=file;this.encoding=encoding;if(file.throw)throw Error('provider inaccessible');if(file.delay)return;if(file.error){this.onerror({target:this});return;}this.onload({target:{result:file.text}});}
 }
 const ctx=vm.createContext({window:{},document,location:{hash:''},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>{if(quota)throw Error('QuotaExceededError');storage.set(k,v);writes.push(k);}},FileReader,setTimeout(){},clearTimeout(){},console,Blob,URL});
 if(legacy)vm.runInContext([...legacyHtml.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1],ctx);
 else runApp(ctx);
 const run=code=>vm.runInContext(code,ctx);
 return {run,storage,readers,writes,nodes};
}
function importedSnapshot(){
 const old=app({legacy:true});
 old.run(`S.words=Array.from({length:1000},(_,i)=>({id:'existing-'+i,kanji:'単語'+i,reading:'たんご',meaning:'личное значение '+i,notes:'свои заметки',folder:i%2?'Мои слова':'Genki'}));
 S.progress=Object.fromEntries(S.words.map((w,i)=>[w.id,{reps:i%5,lapses:1,ef:2.3,interval:12,due:1800000000000+i,lastSeen:1700000000000}]));
 S.kanjiItems=[{id:'existing-kanji',kanji:'日',on_reading:'ニチ',kun_reading:'ひ',meaning:'день',folder:'Кандзи'}];
 S.kanjiProgress={'existing-kanji':{reps:6,lapses:1,ef:2.2,interval:30,due:1800000000000,lastSeen:1700000000000}};
 S.wordsCsv='kanji,reading,meaning\\n単語,たんご,свой словарь';S.kanjiCsv='kanji,on,kun,meaning\\n日,ニチ,ひ,день';S.wordDisplay='kana';S.hintsEnabled=false;save();`);
 return old.storage;
}
const dictionary=a=>a.run('JSON.stringify({words:S.words,progress:S.progress,kanjiItems:S.kanjiItems,kanjiProgress:S.kanjiProgress,wordsCsv:S.wordsCsv,kanjiCsv:S.kanjiCsv})');
test('native picker accepts generic Android document MIME and is not hidden or click forwarded',()=>{
 const a=app();a.run(`act('words-import');`);const markup=a.run('buildUploadZone()');
 const input=markup.match(/<input[^>]*id="file-in"[^>]*>/)[0];assert(!input.includes('accept='));assert(!input.includes('display:none'));assert(input.includes('aria-label='));
 a.nodes.dropzone={classList:{add(){},remove(){}}};a.nodes['file-in']={click(){throw Error('No synthetic clicks');}};
 a.run('bindAll()');assert.equal(a.nodes.dropzone.onclick,undefined);assert.equal(typeof a.nodes['file-in'].onchange,'function');
 const target={files:[{name:'document.csv',type:'application/octet-stream',text:'kanji,reading,meaning\n猫,ねこ,кошка'}],value:'document.csv'};a.nodes['file-in'].onchange({target});assert.equal(target.value,'');assert.equal(a.run(`S.importStep==='preview'&&S.importPreview.words[0].kanji==='猫'`),true);
});
test('UTF-8 BOM, Cyrillic and Japanese load for generic/empty MIME, commas, semicolons and TSV',()=>{
 for(const type of ['text/plain','application/octet-stream','application/vnd.ms-excel',''])for(const sep of [',',';','\t']){
  const a=app();a.run('act("words-import")');a.run(`readFile(${JSON.stringify({type,text:'\uFEFFkanji'+sep+'reading'+sep+'meaning\r\n猫'+sep+'ねこ'+sep+'кошка'})})`);
  assert.equal(a.run(`S.importStep==='preview'&&S.importPreview.words[0].meaning==='кошка'&&!S.importReading`),true);
  assert.equal(a.writes.length,0,'preview must never overwrite the dictionary');
 }
});
test('read errors, aborted reads, thrown provider errors and malformed files show an error without saving',()=>{
 for(const mode of ['error','throw','abort','empty','null']){
  const storage=importedSnapshot(),before=storage.get('jl4'),a=app({storage});a.run('act("words-import")');
  a.run(`readFile(${JSON.stringify(mode==='error'?{error:true}:mode==='throw'?{throw:true}:mode==='abort'?{delay:true}:mode==='null'?{text:null}:{text:''})})`);
  if(mode==='abort')a.readers.at(-1).onabort();
  assert.equal(a.run(`Boolean(S.importErr)&&!S.importPreview&&!S.importReading&&S.words.length===1000`),true,mode);
  assert.equal(storage.get('jl4'),before);assert.equal(a.writes.length,0);
 }
});
test('reselecting the same file and cancelling the picker keep data and allow retries',()=>{
 const a=app({storage:importedSnapshot()}),before=dictionary(a);a.run(`act('words-import')`);
 a.nodes.dropzone={classList:{add(){},remove(){}}};a.nodes['file-in']={};a.run('bindAll()');
 const file={text:'kanji,reading,meaning\n犬,いぬ,собака'};
 const onchange=a.nodes['file-in'].onchange;onchange({target:{files:[file],value:'same.csv'}});onchange({target:{files:[],value:''}});onchange({target:{files:[file],value:'same.csv'}});
 assert.equal(a.readers.length,2);assert.equal(dictionary(a),before);assert.equal(a.run('S.importStep'), 'preview');
});
test('late cloud reads cannot overwrite newer selections, a switched type or a closed import',()=>{
 const a=app();a.run(`act('words-import');readFile({delay:true});readFile({text:'kanji,reading,meaning\\n犬,いぬ,собака'});`);
 a.readers[0].onload({target:{result:'kanji,reading,meaning\n猫,ねこ,кошка'}});assert.equal(a.run(`S.importPreview.words[0].kanji`),'犬');
 a.run(`readFile({delay:true});act('import-type:kanji');`);a.readers.at(-1).onload({target:{result:'kanji,reading,meaning\n猫,ねこ,кошка'}});assert.equal(a.run('S.importPreview'),null);
 a.run(`readFile({delay:true});act('back-import');act('words-import');`);a.readers.at(-1).onload({target:{result:'kanji,reading,meaning\n猫,ねこ,кошка'}});assert.equal(a.run('S.importPreview'),null);
});
test('production-to-beta upgrade preserves 1000 words, IDs, folders, raw CSV and SRS byte for byte',()=>{
 const storage=importedSnapshot(),before=storage.get('jl4'),old=app({storage,legacy:true}),snapshot=dictionary(old),next=app({storage});
 assert.equal(dictionary(next),snapshot);assert.equal(storage.get('jl4'),before);assert.equal(next.writes.length,0);
 next.run(`act('tab:practice');UP.selectedLessons=['umi-l01','umi-l02'];uStart(uMixKey());uAction('catalog');`);
 assert.equal(dictionary(next),snapshot);assert.equal(storage.get('jl4'),before);assert(next.writes.every(k=>k==='umi.practice.v1'));
 const reload=app({storage});assert.equal(dictionary(reload),snapshot);
});
test('confirming a new CSV appends words and skips duplicates without changing existing IDs or SRS',()=>{
 const storage=importedSnapshot(),a=app({storage}),old=a.run('JSON.stringify(S.words)'),progress=a.run('JSON.stringify(S.progress)');
 a.run(`act('words-import');S.importFolder='Genki';readFile({text:'kanji,reading,meaning\\n単語0,たんご,изменённое значение\\n犬,いぬ,собака'});act('confirm-import');`);
 assert.equal(a.run('JSON.stringify(S.words.slice(0,1000))'),old);assert.equal(a.run('JSON.stringify(S.progress)'),progress);assert.equal(a.run(`S.words.length===1001&&S.words.at(-1).folder==='Genki'`),true);
 const reload=app({storage});assert.equal(dictionary(reload),dictionary(a));assert.equal(reload.run(`UP.attempts.length`),0);
});
test('kanji import preserves earlier words, kanji, readings and progress',()=>{
 const storage=importedSnapshot(),a=app({storage}),words=a.run('JSON.stringify(S.words)'),kanji=a.run('JSON.stringify(S.kanjiItems[0])'),progress=a.run('JSON.stringify(S.kanjiProgress)');
 a.run(`act('words-import');act('import-type:kanji');S.importFolder='Кандзи';readFile({text:'kanji,on,kun,meaning\\n日,ニチ,ひ,changed\\n月,ゲツ,つき,луна'});act('confirm-import');`);
 assert.equal(a.run('JSON.stringify(S.words)'),words);assert.equal(a.run('JSON.stringify(S.kanjiItems[0])'),kanji);assert.equal(a.run('JSON.stringify(S.kanjiProgress)'),progress);assert.equal(a.run('S.kanjiItems.length'),2);assert.equal(dictionary(app({storage})),dictionary(a));
});
test('quota failure rolls back only the pending import and retains the stored CSV and preview',()=>{
 for(const type of ['words','kanji']){
  const storage=importedSnapshot(),before=storage.get('jl4'),a=app({storage,quota:true}),snapshot=dictionary(a);
  a.run(`act('words-import');act('import-type:${type}');readFile({text:'kanji,reading,meaning\\n月,つき,луна'});act('confirm-import');`);
  assert.equal(dictionary(a),snapshot);assert.equal(storage.get('jl4'),before);assert.equal(a.run(`S.screen==='import'&&S.importStep==='preview'&&Boolean(S.importPreview)&&Boolean(S.importErr)`),true);
  assert.equal(dictionary(app({storage})),snapshot);
 }
});
test('headerless Android file supports column mapping before append, without touching storage',()=>{
 const a=app({storage:importedSnapshot()}),before=dictionary(a);a.run(`act('words-import');readFile({text:'犬\\tいぬ\\tсобака'});`);
 assert.equal(a.run(`S.importStep==='map'&&S.importMapping.join(',')==='kanji,reading,meaning'`),true);assert.equal(dictionary(a),before);
 a.run(`act('apply-map');act('confirm-import');`);assert.equal(a.run('S.words.length'),1001);
});
test('practice beta badge is attached to its icon and available to screen readers',()=>{
 const a=app();const markup=a.run('nav()');assert(markup.includes('aria-label="Практика · бета"'));assert.equal((markup.match(/class="bnav-beta"/g)||[]).length,1);assert(markup.includes('aria-hidden="true">β</span>'));
});
