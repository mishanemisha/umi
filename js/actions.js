'use strict';
// Действия, события, чтение файлов
/* ── Actions ── */
function act(action){
  const ci=action.indexOf(':');
  const type=ci>-1?action.slice(0,ci):action;
  const val=ci>-1?action.slice(ci+1):'';

  switch(type){
    case'up':if(practiceAvailable)uAction(val);return;
    case'tab':
      S.tab=val;if(val==='practice'&&practiceAvailable)UP.view='menu';S.confirmPending=null;S.cfgScreen=null;
      S.studyQueue=[];S.studyResults=null;S.quizQ=null;S.quizDone=false;
      break;
    case'home-tab':   S.homeTab=val;break;
    case'words-tab':  S.wordsTab=val;S.wordsSearch='';S.wordsFolder='all';S.wordsLimit=300;break;
    case'words-folder':S.wordsFolder=val;S.wordsLimit=300;break;
    case'words-more':S.wordsLimit+=300;break;

    // Открыть экран настроек режима с карточки на главной
    case'open-cfg':{
      const type=val==='quiz-verbs'?'words':S.homeTab;
      if(val==='quiz-verbs'){S.tab='practice';if(practiceAvailable)UP.view='menu';}
      if(val==='cards'){
        if(S.studyCfg.type!==type){
          S.studyCfg.type=type;S.studyCfg.front=['kanji'];S.studyCfg.folders=[];
          S.studyCfg.back=type==='kanji'?['on_reading','kun_reading','meaning']:['reading','meaning'];
        }
        S.studyQueue=[];S.studyResults=null;S.cfgScreen='cards';
      }else{
        if(S.quizCfg.type!==type){
          S.quizCfg.type=type;S.quizCfg.folders=[];S.quizCfg.question=['kanji'];
          S.quizCfg.answer=[type==='kanji'?'on_reading':'reading'];
          S.quizCfg.matchLeft=matchSide(type,'L');S.quizCfg.matchRight=matchSide(type,'R');
        }
        if(val==='quiz-compose')S.quizCfg.mode='compose';
        else if(val==='quiz-pairs')S.quizCfg.mode='pairs';
        else if(val==='quiz-verbs')S.quizCfg.mode='verbs';
        else if(val==='quiz-match')S.quizCfg.mode='match6';
        else if(['compose','pairs','verbs','match6'].includes(S.quizCfg.mode))S.quizCfg.mode='choice6';
        S.quizQ=null;S.quizDone=false;S.cfgScreen='quiz';
      }
      break;}
    case'cfg-type':{
      // Переключение типа сегментом внутри экрана настроек режима
      S.homeTab=val;
      if(S.cfgScreen==='cards'){
        if(S.studyCfg.type!==val){
          S.studyCfg.type=val;S.studyCfg.front=['kanji'];S.studyCfg.folders=[];
          S.studyCfg.back=val==='kanji'?['on_reading','kun_reading','meaning']:['reading','meaning'];
        }
      }else{
        if(S.quizCfg.type!==val){
          S.quizCfg.type=val;S.quizCfg.folders=[];S.quizCfg.question=['kanji'];
          S.quizCfg.answer=[val==='kanji'?'on_reading':'reading'];
          if(val!=='kanji'&&['pairs','compose'].includes(S.quizCfg.mode))S.quizCfg.mode='choice6';
        }
      }
      break;}
    case'close-cfg':
      S.cfgScreen=null;S.studyQueue=[];S.studyResults=null;S.quizQ=null;S.quizDone=false;break;
    case'go-import-home':
      csvReadRequest++;S.importReading=false;
      S.screen='import';S.importType=S.homeTab;S.importStep='type';S.importPreview=null;S.importErr=null;S.importRaw=null;
      S.importFolder='Общая';S.importNewFolder=false;S.importNewName='';break;
    case'words-import':
      csvReadRequest++;S.importReading=false;
      S.screen='import';S.importType=S.wordsTab;S.importStep='type';S.importPreview=null;S.importErr=null;S.importRaw=null;
      S.importNewFolder=false;S.importNewName='';
      S.importFolder=(S.wordsFolder&&S.wordsFolder!=='all')?S.wordsFolder:'Общая';
      break;

    case'import-type':
      csvReadRequest++;S.importReading=false;
      S.importType=val;
      // Если уже в шаге маппинга — обновить дефолтные подписи колонок
      if(S.importRaw)S.importMapping=defaultMapping(S.importRaw.colCount,val==='kanji');
      break;
    case'import-folder':S.importFolder=val;S.importNewFolder=false;break;
    case'import-folder-new':S.importNewFolder=true;break;
    case'back-import':
      csvReadRequest++;S.importReading=false;
      if(S.importStep==='map'){S.importStep='type';S.importRaw=null;S.importMapping=[];}
      else if(S.importStep==='preview'){S.importStep=S.importRaw?'map':'type';S.importPreview=null;}
      else{S.screen='main';S.importStep='type';S.importPreview=null;S.importErr=null;S.importRaw=null;}
      break;
    case'cancel-import':
      csvReadRequest++;S.importReading=false;S.importPreview=null;S.importStep=S.importRaw?'map':'type';break;
    case'apply-map':{
      if(!S.importRaw)break;
      const mapping=Array.from({length:S.importRaw.colCount},(_,i)=>{
        const el=document.getElementById(`map-col-${i}`);return el?el.value:(S.importMapping[i]||'');
      });
      if(!mapping.includes('kanji')&&!mapping.includes('reading')){toast('Назначьте колонку кандзи или чтения');return;}
      try{S.importPreview=applyMapping(S.importRaw.rawRows,mapping,S.importType==='kanji');S.importStep='preview';S.importErr=null;}
      catch(e){S.importErr=e.message;}
      break;
    }
    case'confirm-import':
      if(S.importPreview&&!S.importReading){
        const nw=S.importPreview.words;
        const itype=S.importType;
        const targetFolder=importTargetFolder();
        if(itype==='kanji'){
          // Страховочный проход: если reading не был разбит на on/kun — делаем это сейчас
          nw.forEach(w=>{
            if(w.reading&&!w.on_reading&&!w.kun_reading){
              const{on_reading,kun_reading}=splitOnKun(w.reading);
              if(on_reading)w.on_reading=on_reading;
              if(kun_reading)w.kun_reading=kun_reading;
              delete w.reading;
            }
          });
        }
        // Дедупликация в пределах целевой папки по ключу «слово + чтение».
        // Существующие записи не трогаем (прогресс сохраняется), дубли пропускаем.
        const list=itype==='kanji'?S.kanjiItems:S.words;
        const existing=new Set(list.filter(w=>(w.folder||'Общая')===targetFolder).map(w=>itemKey(w,itype)));
        const seen=new Set();
        const oldLength=list.length,oldCsv=itype==='kanji'?S.kanjiCsv:S.wordsCsv;
        let added=0,skipped=0;
        for(const w of nw){
          const k=itemKey(w,itype);
          if(existing.has(k)||seen.has(k)){skipped++;continue;}
          seen.add(k);
          w.folder=targetFolder;
          list.push(w);
          added++;
        }
        if(itype==='kanji')S.kanjiCsv=S.importRawText||'';
        else S.wordsCsv=S.importRawText||'';
        // localStorage setItem is atomic: on failure keep the old dictionary
        // and the preview, rather than claiming an import that would disappear.
        if(!save()){
          list.length=oldLength;
          if(itype==='kanji')S.kanjiCsv=oldCsv;else S.wordsCsv=oldCsv;
          S.importErr='Не удалось сохранить импорт на устройстве. Прежний словарь сохранён. Попробуйте импортировать файл меньшего размера.';
          toast('Импорт не сохранён — прежние данные сохранены');break;
        }
        S.importRawText='';
        S.importPreview=null;S.importRaw=null;S.importStep='type';S.screen='main';
        S.importNewFolder=false;S.importNewName='';
        // Показать импортированную папку в разделе «Слова»
        S.tab='words';S.wordsTab=itype;S.wordsFolder=targetFolder;S.wordsSearch='';
        toast(skipped?`Добавлено ${added}, пропущено дублей: ${skipped}`:`Добавлено ${added}`);
      }
      break;

    case'study-folder':
      if(val==='__all__')S.studyCfg.folders=[];
      else{const a=S.studyCfg.folders||[];S.studyCfg.folders=a.includes(val)?a.filter(x=>x!==val):[...a,val];}
      break;
    case'study-filter':S.studyCfg.filter=val;break;
    case'study-count':S.studyCfg.count=val;break;
    case'start-study':
      S.studyQueue=buildStudyQueue();
      if(!S.studyQueue.length){toast('Нет карточек для этого фильтра');return;}
      S.studyIdx=0;S.cardFlipped=false;S.studyResults=null;S.cardHint=false;break;
    case'flip':S.cardFlipped=!S.cardFlipped;haptic('light');break;
    case'mark':{
      const w=S.studyQueue[S.studyIdx];
      if(w){
        const q=val==='know'?5:val==='learning'?3:0;
        smOverwrite(pr(S.studyCfg.type),w.id,q);
        save();haptic();S.studyIdx++;S.cardFlipped=false;
        if(S.studyIdx>=S.studyQueue.length)sessionEnd();
      }
      break;}
    case'skip-card':
      S.studyIdx++;S.cardFlipped=false;
      if(S.studyIdx>=S.studyQueue.length)sessionEnd();break;
    case'stop-study':
      S.studyQueue=[];S.studyResults=null;S.cardHint=false;S.cfgScreen='cards';break;
    case'restart-study':
      S.studyQueue=buildStudyQueue();S.studyIdx=0;S.cardFlipped=false;S.studyResults=null;break;

    case'quiz-folder':
      if(val==='__all__')S.quizCfg.folders=[];
      else{const a=S.quizCfg.folders||[];S.quizCfg.folders=a.includes(val)?a.filter(x=>x!==val):[...a,val];}
      break;
    case'quiz-mode':
      S.quizCfg.mode=val;break;
    case'quiz-afield':{
      // Мультивыбор «что отгадываем» (минимум одно поле)
      const a=arr(S.quizCfg.answer);
      S.quizCfg.answer=a.includes(val)
        ?(a.length>1?a.filter(x=>x!==val):a)
        :[...a,val];
      break;}
    case'quiz-filter':S.quizCfg.filter=val;break;
    case'quiz-count':S.quizCfg.count=val;break;
    case'word-display':S.wordDisplay=(val==='kana'?'kana':'full');save();break;
    case'hints-toggle':S.hintsEnabled=(val==='on');save();break;
    case'start-quiz':{
      const aFields=arr(S.quizCfg.answer);
      const d=ds(S.quizCfg.type);
      const mode=S.quizCfg.mode;
      const fieldModes=mode==='pairs'||mode==='compose'||mode==='verbs'||mode==='match6';
      if(!fieldModes&&!aFields.some(f=>d.some(w=>w[f]))){toast(`Поле "${fldShort(aFields[0],S.quizCfg.type)}" пустое во всех записях`);break;}
      S.quizRecent=[];S.quizLimit=null;
      S.quizScore={ok:0,bad:0};S.quizQ=nextQuizQ();S.quizDone=false;S.quizSel=-1;S.quizInputVal='';S.quizHint=false;
      if(!S.quizQ)toast(startQuizError());
      break;}
    case'quiz-check':{
      if(!S.quizDone&&S.quizQ){
        const inp=document.getElementById('quiz-input');
        S.quizInputVal=inp?inp.value:'';S.quizDone=true;
        const ok=checkAns(S.quizInputVal,S.quizQ.options[S.quizQ.correct]);
        const w=S.quizQ.word,p=pr(S.quizCfg.type);
        smUpdate(p,w.id,ok?5:1);
        if(ok){S.quizScore.ok++;haptic('light');}
        else{S.quizScore.bad++;haptic('medium');}
        save();
      }
      break;}
    case'toggle-hint':S.quizHint=!S.quizHint;break;
    case'toggle-card-hint':S.cardHint=!S.cardHint;break;
    case'compose-switch':{
      const cs=S.quizCfg.composeShow||{reading:true,meaning:false};
      cs[val]=!cs[val];
      // в normal нужна хотя бы одна подсказка; в reverse слово-кандзи видно всегда
      if(S.quizCfg.composeMode==='normal'&&!cs.reading&&!cs.meaning)cs[val]=true;
      S.quizCfg.composeShow=cs;save();break;}
    case'compose-dir':S.quizCfg.composeMode=(['normal','reverse','ultra'].includes(val)?val:'normal');save();break;
    case'ultra-diff':S.quizCfg.ultraDifficulty=(['all','easy','medium','hard'].includes(val)?val:'all');save();break;
    case'verb-style':S.quizCfg.verbStyle=(['plain','polite','both'].includes(val)?val:'both');save();break;
    case'verb-level':S.quizCfg.verbLevel=(['easy','medium','hard'].includes(val)?val:'medium');save();break;
    case'verb-source':S.quizCfg.verbSource=(['all','known'].includes(val)?val:'all');save();break;
    case'verb-mode':S.quizCfg.verbMode=(['A','B'].includes(val)?val:'A');save();break;
    case'verb-cat':{
      const a=S.quizCfg.verbCats||[];
      S.quizCfg.verbCats=a.includes(val)?(a.length>1?a.filter(x=>x!==val):a):[...a,val];
      save();break;}
    case'compose-pick':{
      const q=S.quizQ;if(!q||!q.compose||S.quizDone)break;
      const i=+val,at=q.picks.indexOf(i);
      if(at>=0){q.picks.splice(at,1);haptic('light');break;} // отжать
      q.picks.push(i);haptic('light');
      if(q.picks.length===q.target.length){
        const built=q.picks.map(x=>q.options[x]).join('');
        // reverse — чтение; ultra — знакомые кандзи по порядку слотов; обычный — всё слово
        const answer=q.reverse?String(q.word.reading):(q.ultra?q.target.join(''):String(q.word.kanji));
        const ok=built===answer;
        q.result=ok;S.quizDone=true;
        smUpdate(pr('words'),q.word.id,ok?4:1);
        if(ok){S.quizScore.ok++;haptic('light');}else{S.quizScore.bad++;haptic('medium');}
        save();
      }
      break;}
    case'verb-pick':{
      const q=S.quizQ;if(!q||!q.verbs||S.quizDone)break;
      const i=+val,at=q.picks.indexOf(i);
      if(at>=0){q.picks.splice(at,1);haptic('light');break;} // отжать чип
      if(q.modeB){
        if(q.picks.length>=q.maxLen)break;                   // не длиннее самого длинного ответа
        q.picks.push(i);haptic('light');
        const built=q.picks.map(x=>q.options[x]);
        if(q.accepted.some(a=>seqEq(a.seq,built))){          // авто-приём при точном совпадении
          q.result=true;S.quizDone=true;S.quizScore.ok++;haptic('light');save();
        }
        break;
      }
      if(q.picks.length>=q.target.length)break;              // все слоты заняты
      q.picks.push(i);haptic('light');
      if(q.picks.length===q.target.length){
        const built=q.picks.map(x=>q.options[x]);
        const ok=built.every((c,k)=>c===q.target[k]);
        q.result=ok;S.quizDone=true;
        if(ok){S.quizScore.ok++;haptic('light');}else{S.quizScore.bad++;haptic('medium');}
        save();
      }
      break;}
    case'verb-check':{                                        // Mode B: явная проверка сборки
      const q=S.quizQ;if(!q||!q.verbs||!q.modeB||S.quizDone||!q.picks.length)break;
      const built=q.picks.map(x=>q.options[x]);
      const ok=q.accepted.some(a=>seqEq(a.seq,built));
      q.result=ok;S.quizDone=true;
      if(ok){S.quizScore.ok++;haptic('light');}else{S.quizScore.bad++;haptic('medium');}
      save();break;}
    case'match-side':{
      // поле принадлежит ровно одной колонке; пустой колонку не оставляем
      const[side,f]=val.split(':');
      const k=side==='L'?'matchLeft':'matchRight',o=side==='L'?'matchRight':'matchLeft';
      const cur=arr(S.quizCfg[k]),oth=arr(S.quizCfg[o]);
      if(cur.includes(f)){if(cur.length>1)S.quizCfg[k]=cur.filter(x=>x!==f);}
      else{
        const rest=oth.filter(x=>x!==f);
        if(!rest.length)break;                  // нельзя опустошить противоположную колонку
        S.quizCfg[k]=[...cur,f];S.quizCfg[o]=rest;
      }
      S.quizQ=null;S.quizDone=false;save();break;}
    case'match-senses':
      S.quizCfg.matchSenses=val==='all'?'all':'one';S.quizQ=null;S.quizDone=false;save();break;
    case'match-pick':{
      const q=S.quizQ;if(!q||!q.match||S.quizDone)break;
      const[side,ids]=val.split(':');const pid=+ids;
      if(q.solved.includes(pid))break;          // пара уже собрана
      q.bad=null;
      if(side==='L')q.selL=q.selL===pid?null:pid;else q.selR=q.selR===pid?null:pid;
      if(q.selL!=null&&q.selR!=null){
        if(q.selL===q.selR){q.solved.push(q.selL);haptic('light');}
        else{q.wrong++;q.miss[q.selL]=1;q.miss[q.selR]=1;q.bad={l:q.selL,r:q.selR};haptic('medium');}
        q.selL=null;q.selR=null;
      }
      if(q.solved.length>=q.items.length){
        const p=pr(S.quizCfg.type);
        q.items.forEach((it,i)=>smUpdate(p,it.id,q.miss[i]?3:5));
        if(q.wrong===0)S.quizScore.ok++;else S.quizScore.bad++;
        S.quizDone=true;
      }
      save();break;}
    case'pairs-pick':{
      const q=S.quizQ;if(!q||!q.pairs||S.quizDone)break;
      const i=+val;
      if(q.found.some(f=>f.includes(i)))break; // уже собран
      if(q.firstPick==null){q.firstPick=i;q.result=null;haptic('light');break;}
      if(i===q.firstPick){q.firstPick=null;q.result=null;break;} // отжать
      const a=q.options[q.firstPick],b=q.options[i];
      if(a.on===b.on){
        q.found.push([q.firstPick,i]);
        q.result={ok:true,a:q.firstPick,b:i};
        haptic('light');
      }else{
        q.wrong++;
        q.result={ok:false,a:q.firstPick,b:i};
        haptic('medium');
      }
      q.firstPick=null;
      if(q.found.length>=q.total){
        const p=pr('kanji');
        q.options.forEach(o=>smUpdate(p,o.id,q.wrong===0?5:3));
        if(q.wrong===0)S.quizScore.ok++;else S.quizScore.bad++;
        S.quizDone=true;save();
      }
      break;}
    case'multi-pick':{
      const q=S.quizQ;if(!q||!q.multi||q.useInput||S.quizDone)break;
      const p=val.split(':');const gi=+p[0],oi=+p[1];
      if(q.picks[gi]!=null)break;
      q.picks[gi]=oi;
      haptic(oi===q.groups[gi].correctIdx?'light':'medium');
      if(q.groups.every((_,i)=>q.picks[i]!=null))finishMulti(q);
      break;}
    case'multi-check':{
      const q=S.quizQ;if(!q||!q.multi||!q.useInput||S.quizDone)break;
      q.inputs={};
      q.groups.forEach((g,gi)=>{const el=document.getElementById('multi-input-'+gi);q.inputs[gi]=el?el.value:'';});
      finishMulti(q);
      break;}
    case'quiz-ans':{
      if(!S.quizDone&&S.quizQ){
        const idx=parseInt(val);S.quizSel=idx;S.quizDone=true;
        const ok=idx===S.quizQ.correct;
        const w=S.quizQ.word,p=pr(S.quizCfg.type);
        smUpdate(p,w.id,ok?4:1);
        if(ok){S.quizScore.ok++;haptic('light');}
        else{S.quizScore.bad++;haptic('medium');}
        save();
      }
      break;}
    case'next-q':
      S.quizQ=nextQuizQ();S.quizDone=false;S.quizSel=-1;S.quizInputVal='';
      if(!S.quizQ)toast(startQuizError());break;
    case'skip-q':
      // Пропуск без оценки — просто следующий вопрос
      S.quizQ=nextQuizQ();S.quizDone=false;S.quizSel=-1;S.quizInputVal='';
      if(!S.quizQ)toast(startQuizError());break;
    case'stop-quiz':
      S.quizQ=null;S.quizDone=false;S.quizInputVal='';S.quizHint=false;
      S.quizScore={ok:0,bad:0};S.quizSel=-1;S.quizRecent=[];S.quizLimit=null;
      S.cfgScreen='quiz';break;

    case'download-csv':{
      const type=val==='kanji'?'kanji':'words';
      if(!ds(type).length){toast('Словарь пуст');return;}
      saveFile(type+'.csv',itemsCsv(type),'text/csv;charset=utf-8');
      return;}
    case'reset-progress':S.confirmPending='reset-progress';break;
    case'clear-words':   S.confirmPending='clear-words';break;
    case'confirm-no':    S.confirmPending=null;break;
    case'confirm-yes':
      if(S.confirmPending==='reset-progress'){
        S.progress={};S.kanjiProgress={};save();toast('Прогресс сброшен');
      } else if(S.confirmPending==='clear-words'){
        S.words=[];S.progress={};S.kanjiItems=[];S.kanjiProgress={};
        S.wordsCsv='';S.kanjiCsv='';
        S.studyQueue=[];S.quizQ=null;save();toast('Данные удалены');
      }
      S.confirmPending=null;break;
  }
  render();
}

/* ── Events ── */
function setupDelegation(){
  document.addEventListener('click',e=>{
    const el=e.target.closest('[data-a]');if(el)act(el.dataset.a);
  });
  document.addEventListener('keydown',e=>{
    if(e.key!=='Enter')return;
    if(!S.quizQ)return;
    const qi=document.getElementById('quiz-input');
    const inMulti=S.quizQ.multi&&S.quizQ.useInput;
    const ae=document.activeElement;
    const inMultiInput=inMulti&&ae&&/^multi-input-/.test(ae.id||'');
    if(qi&&ae===qi){
      e.preventDefault();
      act(S.quizDone?'next-q':'quiz-check');
    } else if(inMultiInput){
      e.preventDefault();
      act(S.quizDone?'next-q':'multi-check');
    } else if(S.quizDone){
      // После ответа Enter где угодно — следующий
      e.preventDefault();act('next-q');
    }
  });
}
function bindAll(){
  // Front-chips toggle (study, multi-select)
  const cf=document.getElementById('chips-front');
  if(cf)cf.addEventListener('click',e=>{
    const chip=e.target.closest('[data-field-front]');if(!chip)return;
    const f=chip.dataset.fieldFront,i=S.studyCfg.front.indexOf(f);
    if(i>=0)S.studyCfg.front=S.studyCfg.front.filter(x=>x!==f);
    else S.studyCfg.front=[...S.studyCfg.front,f];
    chip.classList.toggle('on',S.studyCfg.front.includes(f));
  });
  // Back-chips toggle (study)
  const cb=document.getElementById('chips-back');
  if(cb)cb.addEventListener('click',e=>{
    const chip=e.target.closest('[data-field]');if(!chip)return;
    const f=chip.dataset.field,i=S.studyCfg.back.indexOf(f);
    if(i>=0)S.studyCfg.back=S.studyCfg.back.filter(x=>x!==f);
    else S.studyCfg.back=[...S.studyCfg.back,f];
    chip.classList.toggle('on');
  });
  // Question-chips toggle (quiz, multi-select)
  const cq=document.getElementById('chips-q');
  if(cq)cq.addEventListener('click',e=>{
    const chip=e.target.closest('[data-qfield]');if(!chip)return;
    const f=chip.dataset.qfield;
    const i=S.quizCfg.question.indexOf(f);
    if(i>=0){if(S.quizCfg.question.length>1)S.quizCfg.question=S.quizCfg.question.filter(x=>x!==f);}
    else S.quizCfg.question=[...S.quizCfg.question,f];
    chip.classList.toggle('on',S.quizCfg.question.includes(f));
  });
  // Word search
  const ws=document.getElementById('words-search');
  if(ws){
    const update=v=>{S.wordsSearch=v;S.wordsLimit=300;const r=document.getElementById('words-results');if(r)r.innerHTML=buildWordsResults();};
    ws.addEventListener('input',e=>{if(!e.isComposing)update(e.target.value);});
    ws.addEventListener('compositionend',e=>update(e.target.value));
  }
  // Имя новой папки при импорте — синхронизируем без ре-рендера (фокус сохраняется)
  const fni=document.getElementById('import-folder-name');
  if(fni)fni.oninput=e=>{S.importNewName=e.target.value;};
  // File drop
  const dz=document.getElementById('dropzone'),fin=document.getElementById('file-in');
  if(dz&&fin){
    // Native file input covers the target: no hidden-input click forwarding.
    fin.onchange=e=>{const f=e.target.files?.[0];e.target.value='';if(f)readFile(f);};
    dz.ondragover=e=>{e.preventDefault();dz.classList.add('over');};
    dz.ondragleave=()=>dz.classList.remove('over');
    dz.ondrop=e=>{e.preventDefault();dz.classList.remove('over');const f=e.dataTransfer.files[0];if(f)readFile(f);};
  }
  // Quiz input focus — только при первом маунте текущего вопроса,
  // чтобы не переуводить курсор при каждом re-render во время взаимодействия
  const qi=document.getElementById('quiz-input');
  if(qi&&!S.quizDone){
    const qid=S.quizQ&&S.quizQ.word?S.quizQ.word.id:null;
    if(qid&&S._quizFocusedFor!==qid){
      S._quizFocusedFor=qid;
      setTimeout(()=>qi.focus(),50);
    }
  } else if(S.quizDone){
    // Сброс маркера, чтобы следующий вопрос снова получил фокус
    S._quizFocusedFor=null;
  }
}
let csvReadRequest=0;
function readFile(file){
  const request=++csvReadRequest,importType=S.importType;
  S.importReading=true;S.importErr=null;S.importPreview=null;S.importRaw=null;S.importRawText='';S.importStep='type';render();
  const current=()=>request===csvReadRequest&&S.screen==='import'&&S.importType===importType;
  const failed=message=>{
    if(!current())return;
    S.importReading=false;S.importErr=message;S.importPreview=null;S.importRaw=null;S.importRawText='';S.importStep='type';render();
  };
  try{
    const reader=new FileReader();
    reader.onerror=()=>failed('Не удалось прочитать файл. Скачайте CSV на устройство и выберите его снова.');
    reader.onabort=()=>failed('Чтение файла прервано. Выберите CSV ещё раз.');
    reader.onload=e=>{
      if(!current())return;
      try{
        const text=e.target.result;
        if(typeof text!=='string')throw new Error('Не удалось прочитать текст CSV.');
        const r=parseFile(text);
        S.importReading=false;S.importRawText=text;
        if(!r.hasHeaders){S.importRaw=r;S.importMapping=defaultMapping(r.colCount,S.importType==='kanji');S.importStep='map';S.importPreview=null;S.importErr=null;}
        else{S.importPreview=r;S.importStep='preview';S.importRaw=null;S.importErr=null;}
        render();
      }catch(err){failed(err.message);}
    };
    reader.readAsText(file,'UTF-8');
  }catch{failed('Не удалось открыть файл. Скачайте CSV на устройство и выберите его снова.');}
}
