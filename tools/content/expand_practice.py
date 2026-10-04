"""Compile authored examples into recognition, recall and sentence-building tasks.
A family groups formats of the same example so the scheduler can space them apart.
"""
from copy import deepcopy
import re
from practice_variants import VARIANTS, READINGS, WORD_CONTEXTS

VERBS=set('たべる のむ よむ いく まつ あける はいる すむ はたらく おもう はなす およぐ かう つくる あう ひく もつ てつだう おしえる さがす しまる しめる わすれる めしあがる いらっしゃる もうす うかがう つかう ぬすむ おく こまる やすむ つづける きめる'.split())
ADJECTIVES=set('たかい しずか ながい いそがしい はやい ほしい あたらしい むずかしい いたい'.split())

def classify(w):
    r=w['reading']
    return 'verb' if r in VERBS else 'adjective' if r in ADJECTIVES else 'adverb' if r in ['きのう','なにか'] else 'noun'

def aliases(text):
    result=[text]
    for old,new in [('じゃないです','ではありません'),('じゃないです','ではないです'),('じゃなかったです','ではありませんでした')]:
        if text.endswith(old):result.append(text[:-len(old)]+new)
    return result

def expand_bank(bank):
    lessons={l['id']:l for l in bank['lessons']};words={w['id']:w for w in bank['words']}
    for w in words.values():w['partOfSpeech']=classify(w)
    rules={r['id']:r for l in bank['lessons'] for r in l['rules']}
    existing={e['id']:e for e in bank['exercises']}
    for e in bank['exercises']:
        e.update(difficulty='basic',familyId=e['id'],labelRu='Значение' if e['focus']=='vocabulary' else 'Пропуск')
        if e['type']=='order':e.update(difficulty='standard',labelRu='Сборка',requiredCount=len(e['acceptedSequences'][0]))
        if e['display']['hideReadings']:e['labelRu']='Чтение'
    def add(e):
        if e['id'] in existing:raise ValueError('Duplicate '+e['id'])
        existing[e['id']]=e;bank['exercises'].append(e);lessons[e['lessonId']]['exerciseIds'].append(e['id'])
    def choice_options(texts,correct,explanation):
        return [{'id':f'o{i}','text':t,'feedbackRu':('Верно. ' if t==correct else 'Этот вариант не передаёт указанный смысл или форму. ')+explanation,'misconceptionId':None if t==correct else 'context.form'} for i,t in enumerate(texts)]
    # One independently written alternative for every grammar skill.
    sources=[deepcopy(e) for e in bank['exercises'] if e['type']=='gap']
    for row in VARIANTS.strip().splitlines():
        ref,prompt,ru,opts=row.split('|');lesson_no,rule_no=map(int,ref.split('.'))
        rid=f'umi-l{lesson_no:02}.g{rule_no:02}';base=existing[rid+'.gap'];e=deepcopy(base)
        e.update(id=rid+'.variant',familyId=rid+'.variant',difficulty='standard',labelRu='В контексте',prompt=[{'text':prompt.replace('［］','{{answer}}'),'reading':None}],translationRu=ru)
        texts=opts.split(';');e['options']=choice_options(texts,texts[0],e['explanationRu']);add(e);sources.append(e)
        # A second situation only when a coordinated Japanese/Russian substitution
        # changes the example while preserving the target form and meaning.
        swaps=[
            ('あきさん','ゆきさん',{'Аки':'Юки'}),
            ('あした','らいしゅう',{'завтра':'на следующей неделе','Завтра':'На следующей неделе'}),
            ('きのう','おととい',{'Вчера':'Позавчера','вчера':'позавчера'}),
            ('ほん','ざっし',{
                'моя книга':'мой журнал','Моя книга':'Мой журнал',
                'Она далеко':'Он далеко','она и интересная, и дешёвая':'он и интересный, и дешёвый',
                'Эта книга':'Этот журнал','эта книга':'этот журнал',
                'Эту книгу':'Этот журнал','эту книгу':'этот журнал',
                'одна книга':'один журнал','дешёвая и интересная':'дешёвый и интересный',
                'книгу':'журнал','книги':'журналы','книга':'журнал','Книга':'Журнал'
            })
        ]
        for ja,jb,rus in swaps:
            if ja not in prompt or not any(a in ru for a in rus):continue
            if ja=='ほん' and 'にほん' in prompt:continue
            jp=prompt.replace(ja,jb);translation=ru
            # One pass avoids re-replacing the 'вчера' inside 'позавчера'.
            pattern='|'.join(re.escape(a) for a in sorted(rus,key=len,reverse=True))
            translation=re.sub(pattern,lambda match:rus[match.group(0)],translation)
            texts2=[t.replace(ja,jb) for t in texts]
            shifted=deepcopy(e);shifted.update(id=rid+'.situation',familyId=rid+'.situation',prompt=[{'text':jp.replace('［］','{{answer}}'),'reading':None}],translationRu=translation)
            shifted['options']=choice_options(texts2,texts2[0],e['explanationRu']);add(shifted);sources.append(shifted);break
    # Recall tests the exact requested form rather than guessing an option.
    # Sentence assembly is another format in the SAME example family.
    for source in sources:
        right=source['options'][0]['text']
        typed=deepcopy(source);typed.update(id=source['id']+'.input',type='input',difficulty='challenge',labelRu='Без вариантов',instructionRu=f'Запиши только пропуск хираганой. Используй правило «{rules[source["skillIds"][0]]["titleRu"]}» и указанный стиль.',acceptedTexts=aliases(right),options=[],slots=[],acceptedChoiceIds=[],acceptedSequences=[])
        typed['prompt']=[{'text':source['prompt'][0]['text'].replace('{{answer}}','［ … ］'),'reading':None}];add(typed)
        raw=source['prompt'][0]['text'];before,after=raw.split('{{answer}}')
        if '→' in before:continue
        chunks=[]
        for token in before.strip().split():
            # Separate a final particle as a meaningful movable block.
            match=re.fullmatch(r'(.{2,})(は|を|に|が|の|で|と)',token)
            if match:chunks.extend(match.groups())
            else:chunks.append(token)
        chunks.append(right)
        tail=after.strip()
        if tail and tail not in ['。','？','?']:
            chunks.extend(tail.split())
        elif tail:chunks[-1]+=tail
        if len(chunks)<3:continue
        chunks=[c for c in chunks if c]
        correct=[f'b{i}' for i in range(len(chunks))]
        order=deepcopy(source);order.update(id=source['id']+'.order',type='order',difficulty='challenge',labelRu='Сборка с лишним',focus='grammar',instructionRu=f'Собери фразу, начав с «{chunks[0]}». Есть лишний блок. Порядок обстоятельств и дополнения сохрани по переводу.',prompt=[],slots=[],acceptedChoiceIds=[],acceptedSequences=[correct],requiredCount=len(chunks),acceptedTexts=[])
        extra=source['options'][1]['text']
        if extra in chunks:extra=source['options'][2]['text']
        order['options']=[{'id':f'b{i}','text':c,'feedbackRu':source['explanationRu'],'misconceptionId':None} for i,c in enumerate(chunks)]+[{'id':'extra','text':extra,'feedbackRu':'Лишний блок не соответствует заданному смыслу.','misconceptionId':'order.extra'}]
        add(order)
    contexts={r.split('|')[0]:r.split('|')[1:] for r in WORD_CONTEXTS.strip().splitlines()}
    for lesson in bank['lessons']:
        lid=lesson['id']
        for wid in lesson['wordIds']:
            w=words[wid];base=existing[lid+'.'+wid+'.meaning']
            peers=[p for p in words.values() if p['id']!=wid and p['partOfSpeech']==w['partOfSpeech']]
            if len(peers)<3:peers=[words[p] for p in lesson['wordIds'] if p!=wid]
            peers=peers[:3]
            reverse=deepcopy(base);reverse.update(id=lid+'.'+wid+'.reverse',familyId=lid+'.'+wid+'.reverse',difficulty='standard',labelRu='Обратный перевод',instructionRu='Выбери слово по значению.',prompt=[{'text':w['meaningsRu'][0],'reading':None}])
            reverse['options']=choice_options([w['reading']]+[p['reading'] for p in peers],w['reading'],base['explanationRu']);add(reverse)
            if w['surface']!=w['reading']:
                recall=deepcopy(base);recall.update(id=lid+'.'+wid+'.recall',familyId=lid+'.'+wid+'.reading',type='input',difficulty='challenge',labelRu='Чтение без вариантов',skillIds=[wid+'.reading'],instructionRu='Запиши чтение слова хираганой.',prompt=[{'text':w['surface'],'reading':None}],options=[],acceptedChoiceIds=[],acceptedTexts=[w['reading']],display={'hideReadings':True});add(recall)
            prompt,ru=contexts[w['reading']]
            context=deepcopy(base);context.update(id=lid+'.'+wid+'.usage',familyId=lid+'.'+wid+'.usage',type='gap',difficulty='standard',labelRu='Слово в контексте',skillIds=[wid+'.usage'],instructionRu='Вставь слово для указанного смысла.',prompt=[{'text':prompt.replace('［］','{{answer}}'),'reading':None}],translationRu=ru,slots=[{'id':'answer','acceptedOptionIds':['o0']}],acceptedChoiceIds=[])
            context['options']=choice_options([w['reading']]+[p['reading'] for p in peers],w['reading'],base['explanationRu']);add(context)
            # Productive vocabulary checks constrain the word to this lesson's
            # dictionary so a valid synonym from elsewhere is not silently rejected.
            for template,suffix in [(reverse,'reverse-input'),(context,'usage-input')]:
                typed=deepcopy(template);typed.update(id=lid+'.'+wid+'.'+suffix,type='input',difficulty='challenge',labelRu='Слово без вариантов',instructionRu='Запиши хираганой слово из словаря этой темы. Для глагола — словарную форму.',prompt=[{'text':template['prompt'][0]['text'].replace('{{answer}}','［ … ］'),'reading':None}],options=[],slots=[],acceptedChoiceIds=[],acceptedTexts=[w['reading']])
                add(typed)
            if w['surface']!=w['reading']:
                # Plausible spelling distractors, all different from the correct
                # kana reading, rather than unrelated words from other topics.
                kana=w['reading'];near=[]
                pairs=dict(zip('かきくけこさしすせそたちつてとはひふへほがぎぐげござじずぜぞだぢづでどばびぶべぼ','がぎぐげござじずぜぞだぢづでどばびぶべぼかきくけこさしすせそたちつてとはひふへほ'))
                for i,c in enumerate(kana):
                    if c in pairs:near.append(kana[:i]+pairs[c]+kana[i+1:])
                    if c in 'ゃゅょっ':near.append(kana[:i]+{'ゃ':'や','ゅ':'ゆ','ょ':'よ','っ':'つ'}[c]+kana[i+1:])
                for i,c in enumerate(kana):
                    near.append(kana[:i]+('ら' if c!='ら' else 'り')+kana[i+1:])
                near=list(dict.fromkeys(t for t in near if t!=kana))[:3]
                reading=deepcopy(base);reading.update(id=lid+'.'+wid+'.near-reading',familyId=lid+'.'+wid+'.reading',difficulty='challenge',labelRu='Точное чтение',skillIds=[wid+'.reading'],instructionRu='Выбери точное чтение: варианты отличаются написанием кана.',prompt=[{'text':w['surface'],'reading':None}],options=choice_options([kana]+near,kana,base['explanationRu']),display={'hideReadings':True})
                add(reading)
            raw=context['prompt'][0]['text'];before,after=raw.split('{{answer}}')
            chunks=[]
            for token in before.strip().split():
                match=re.fullmatch(r'(.{2,})(は|を|に|が|の|で|と)',token)
                chunks.extend(match.groups() if match else [token])
            chunks.append(w['reading']);tail=after.strip()
            if tail and tail not in ['。','？','?']:chunks.extend(tail.split())
            elif tail:chunks[-1]+=tail
            if len(chunks)>=3:
                order=deepcopy(context);order.update(id=lid+'.'+wid+'.usage-order',type='order',difficulty='challenge',labelRu='Фраза со словом',instructionRu=f'Собери фразу. Начни с «{chunks[0]}». Есть лишний блок.',prompt=[],slots=[],options=[{'id':f'b{i}','text':c,'feedbackRu':context['explanationRu'],'misconceptionId':None} for i,c in enumerate(chunks)]+[{'id':'extra','text':peers[0]['reading'],'feedbackRu':'Лишнее слово не передаёт заданный смысл.','misconceptionId':wid+'.usage'}],requiredCount=len(chunks),acceptedSequences=[[f'b{i}' for i in range(len(chunks))]])
                add(order)

        # Two independent gaps exercise two different grammar skills at once.
        lesson_sources=[s for s in sources if s['lessonId']==lid and s['id'].endswith('.variant')]
        for index in range(2):
            left=lesson_sources[index];right=next(s for s in lesson_sources[index+1:]+lesson_sources[:index] if s['options'][0]['text']!=left['options'][0]['text'])
            all_texts=list(dict.fromkeys([o['text'] for s in [left,right] for o in s['options']]))
            options=choice_options(all_texts,'',left['explanationRu']+' '+right['explanationRu']);ids={o['text']:o['id'] for o in options}
            slots=[{'id':'left','skillIds':left['skillIds'],'acceptedOptionIds':[ids[left['options'][0]['text']]]},{'id':'right','skillIds':right['skillIds'],'acceptedOptionIds':[ids[right['options'][0]['text']]]}]
            for o in options:
                if o['id'] in [slot['acceptedOptionIds'][0] for slot in slots]:o['feedbackRu']='Этот вариант подходит к одному из пропусков.'
            multi=deepcopy(left);multi.update(id=lid+f'.combine{index+1}',familyId=lid+f'.combine{index+1}',difficulty='challenge',labelRu='Два пропуска',instructionRu='Заполни оба пропуска. Нажми на нужный пропуск, затем выбери вариант. Каждый вариант можно использовать один раз.',skillIds=list(dict.fromkeys(left['skillIds']+right['skillIds'])),prompt=[{'text':'① '+left['prompt'][0]['text'].replace('{{answer}}','{{left}}')+'\n② '+right['prompt'][0]['text'].replace('{{answer}}','{{right}}'),'reading':None}],translationRu='① '+left['translationRu']+'\n② '+right['translationRu'],options=options,slots=slots)
            add(multi)
    for row in READINGS.strip().splitlines():
        no,passage,q1,o1,q2,o2=row.split('|');lid=f'umi-l{int(no):02}'
        base=existing[lessons[lid]['rules'][0]['id']+'.gap']
        for i,(question,opts) in enumerate([(q1,o1),(q2,o2)]):
            texts=opts.split(';');e=deepcopy(base);e.update(id=lid+f'.reading{i+1}',familyId=lid+f'.reading{i+1}',type='choice',difficulty='challenge',labelRu='Чтение текста',focus='mixed',skillIds=[lid+'.comprehension'],instructionRu=question,prompt=[{'text':passage,'reading':None}],translationRu=None,options=choice_options(texts,texts[0],'Ответ следует из текста. '+question+' — '+texts[0]+'.'),slots=[],acceptedChoiceIds=['o0'],explanationRu='В тексте: '+passage+'\n'+question+' — '+texts[0]+'.',targetWordIds=[]);add(e)
    # Retain IDs and accepted text aliases to migrate earlier local saves.
    for e in bank['exercises']:
        if e['type']!='input':continue
        source=existing.get(e.get('familyId'))
        if not source or not source['options']:
            source=next((x for x in bank['exercises'] if x['type']!='input' and x['options'] and x['skillIds']==e['skillIds']),None)
        correct=e['acceptedTexts'];texts=list(dict.fromkeys(correct+[o['text'] for o in (source['options'] if source else [])]))
        peers=[x for x in bank['exercises'] if x['type']!='input' and x['options'] and set(x['skillIds'])&set(e['skillIds'])]
        for other in peers:
            for o in other['options']:
                if o['text'] not in texts and len(texts)<8:texts.append(o['text'])
        e.update(type='choice',legacyInput=True,version=2,labelRu='Выбор формы' if e['focus']!='vocabulary' else 'Выбор слова',instructionRu=e['instructionRu'].replace('Запиши чтение слова хираганой.','Выбери точное чтение слова.').replace('Запиши хираганой слово из словаря этой темы. Для глагола — словарную форму.','Выбери слово из словаря этой темы. Для глагола — словарную форму.').replace('Запиши только пропуск хираганой.','Выбери вариант для пропуска.').replace('Запиши','Выбери').replace('хираганой','из вариантов'),options=choice_options(texts,correct[0],e['explanationRu']),slots=[],acceptedChoiceIds=[f'o{i}' for i,t in enumerate(texts) if t in correct])
        for o in e['options']:
            if o['id'] in e['acceptedChoiceIds']:o.update(feedbackRu='Верно. '+e['explanationRu'],misconceptionId=None)
    # Mixed reading uses two clearly separated situations, without inventing a
    # continuous story or implying that the people in the passages are identical.
    from itertools import combinations
    for left,right in combinations(bank['lessons'],2):
        a=existing[left['id']+'.reading1'];b=existing[right['id']+'.reading1']
        passage='Текст A\n'+a['prompt'][0]['text']+'\n\nТекст B\n'+b['prompt'][0]['text']
        for index,source in enumerate([a,b]):
            e=deepcopy(source);e.update(id=left['id']+'.'+right['id']+f'.mixed-reading{index+1}',familyId=left['id']+'.'+right['id']+'.mixed-reading',lessonIds=[left['id'],right['id']],mixedText=True,prompt=[{'text':passage,'reading':None}],instructionRu=('По тексту A: ' if index==0 else 'По тексту B: ')+source['instructionRu'])
            if e['id'] in existing:raise ValueError('Duplicate mixed reading')
            existing[e['id']]=e;bank['exercises'].append(e)
    bank['contentVersion']=3
    bank['interactionTypes']=['choice','gap','order']
    return bank
