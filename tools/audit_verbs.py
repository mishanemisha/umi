#!/usr/bin/env python3
"""Аудит режима «Формы глаголов»: японский ответ и русское задание.

1) Независимый спрягатель строит каждую форму (99 правил × 458 глаголов) из
   словарной формы и типа глагола и сверяет со сборкой из карточек
   (основа + куски из CSV) на всех трёх уровнях разбивки.
2) Русские задания: в каждом доступном глаголу правиле не должно остаться
   незаполненных слотов, двойного «не не» и т. п.; задания разных форм
   (кроме взаимозаменяемых) не должны совпадать — иначе по заданию
   нельзя понять, что собирать.

Запуск: python3 tools/audit_verbs.py  (код выхода 1 при ошибках)
"""
import json, os, re, subprocess, sys
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "..", "js", "data", "verbs.js"), encoding="utf-8").read()
def const(name):
    m = re.search(r"const %s=(.*?);\n" % name, SRC, re.S)
    return json.loads(m.group(1))
CH, RULES, BANK = const("VERB_CH"), const("VERB_RULES"), const("VERB_BANK")
STEM = {'BASE':'base','NEGBASE':'neg','DICT_M':'dm','DICT_H':'dh','MASU_LINK':'ml','NAI_LINK':'nl',
 'BA_M':'bam','BA_H':'bah','TE_M':'tem','TE_H':'teh','TA_M':'tam','TA_H':'tah','POT_M':'potm','POT_H':'poth',
 'PASS_M':'pasm','PASS_H':'pash','CAUSE_M':'caum','CAUSE_H':'cauh','CAUSEPASS_M':'cpm','CAUSEPASS_H':'cph',
 'IMP_M':'impm','IMP_H':'imph','VOL_M':'volm','VOL_H':'volh','RANUKI_M':'ranm','RANUKI_H':'ranh'}

ROWS = {'う':'わいうえお','く':'かきくけこ','ぐ':'がぎぐげご','す':'さしすせそ','つ':'たちつてと',
        'ぬ':'なにぬねの','ぶ':'ばびぶべぼ','む':'まみむめも','る':'らりるれろ'}
TE = {'う':'って','つ':'って','る':'って','く':'いて','ぐ':'いで','す':'して','ぬ':'んで','ぶ':'んで','む':'んで'}

def base_forms(v):
    """Опорные формы: D словарная, I ます-основа, A ない-основа, E ば-основа, TE, TA,
    POT/PASS/CAUS/CP — основы на -e (без る), IMP, VOL."""
    d, t = v['d'], v['t']
    if t == 'suru':
        s = d[:-2]
        return dict(D=d, I=s+'し', A=s+'し', E=s+'すれ', TE=s+'して', TA=s+'した', POT=s+'でき',
                    PASS=s+'され', CAUS=s+'させ', CP=s+'させられ', IMP=s+'しろ', VOL=s+'しよう', RANUKI=None)
    if t == 'kuru':
        s = d[:-1]
        return dict(D=d, I=s, A=s, E=s+'れ', TE=s+'て', TA=s+'た', POT=s+'られ', PASS=s+'られ',
                    CAUS=s+'させ', CP=s+'させられ', IMP=s+'い', VOL=s+'よう', RANUKI=s+'れ')
    if t == 'ichidan':
        s = d[:-1]
        return dict(D=d, I=s, A=s, E=s+'れ', TE=s+'て', TA=s+'た', POT=s+'られ', PASS=s+'られ',
                    CAUS=s+'させ', CP=s+'させられ', IMP=s+'ろ', VOL=s+'よう', RANUKI=s+'れ')
    if t == 'kureru':
        s = d[:-1]
        return dict(D=d, I=s, A=s, E=s+'れ', TE=s+'て', TA=s+'た', POT=s+'られ', PASS=s+'られ',
                    CAUS=s+'させ', CP=s+'させられ', IMP=s, VOL=s+'よう', RANUKI=s+'れ')
    # годан (и ある)
    s, u = d[:-1], d[-1]
    row = ROWS[u]
    te = TE[u]
    if v['id'] == 'iku': te = 'って'
    f = dict(D=d, I=s+row[1], A=s+row[0], E=s+row[3], TE=s+te, TA=s+te[:-1]+('だ' if te.endswith('で') else 'た'),
             POT=s+row[3], PASS=s+row[0]+'れ', CAUS=s+row[0]+'せ', CP=s+row[0]+'せられ',
             IMP=s+row[3], VOL=s+row[4]+'う', RANUKI=None)
    if t == 'aru': f['A'] = None   # ない вместо あらない
    return f

SUF = {'nonpast':'る','past':'た','negative':'ない','negative_past':'なかった','masu':'ます','masu_past':'ました',
       'masu_negative':'ません','masu_negative_past':'ませんでした'}
TEIRU = {'nonpast':'いる','past':'いた','negative':'いない','negative_past':'いなかった','te':'いて','negative_te':'いなくて',
         'ba':'いれば','negative_ba':'いなければ','tara':'いたら','negative_tara':'いなかったら','masu':'います',
         'masu_past':'いました','masu_negative':'いません','masu_negative_past':'いませんでした','volitional':'いよう',
         'masu_volitional':'いましょう','nakya':'いなきゃ'}
FIXED = {
 'dictionary':'{D}','plain_past':'{TA}','te_form':'{TE}','nai_form':'{A}ない','plain_negative_past':'{A}なかった',
 'negative_te':'{A}なくて','ba_conditional':'{E}ば','tara_conditional':'{TA}ら','negative_ba':'{A}なければ',
 'negative_tara':'{A}なかったら','masu_nonpast':'{I}ます','masu_past':'{I}ました','masu_negative':'{I}ません',
 'masu_negative_past':'{I}ませんでした','masu_volitional':'{I}ましょう','masu_tara':'{I}ましたら',
 'masu_negative_tara':'{I}ませんでしたら','masu_ba_rare':'{I}ませば','masu_negative_nara_rare':'{I}ませんなら',
 'potential_ranuki':'{RANUKI}る','potential_ranuki_negative':'{RANUKI}ない','imperative':'{IMP}',
 'negative_imperative':'{D}な','volitional':'{VOL}','tai_nonpast':'{I}たい','tai_past':'{I}たかった',
 'tai_negative':'{I}たくない','tai_negative_past':'{I}たくなかった','tai_te':'{I}たくて','tai_ba':'{I}たければ',
 'tai_tara':'{I}たかったら','tai_polite':'{I}たいです','tai_polite_negative':'{I}たくないです',
 'nakereba':'{A}なければ','nakya':'{A}なきゃ','nakucha':'{A}なくちゃ','nakereba_naranai':'{A}なければならない',
 'nakereba_narimasen':'{A}なければなりません','nakya_ikenai':'{A}なきゃいけない','nakute_wa_ikenai':'{A}なくてはいけない',
 'nai_to_ikenai':'{A}ないといけない','te_ageru':'{TE}あげる','te_kureru':'{TE}くれる','te_morau':'{TE}もらう',
 'te_moraemasenka':'{TE}もらえませんか','tara_ii_desu_ka':'{TA}らいいですか','tara_dou_desu_ka':'{TA}らどうですか',
 'toki_nonpast':'{D}とき','toki_past':'{TA}とき','toki_negative':'{A}ないとき'}

def expected(v, rid):
    f = base_forms(v)
    if rid == 'nai_form' and v['t'] == 'aru': return 'ない'
    m = re.match(r'(potential|passive|causative_passive|causative)_(.+)$', rid)
    if rid in FIXED: tmpl = FIXED[rid]
    elif m and m.group(2) in SUF:
        key = {'potential':'POT','passive':'PASS','causative':'CAUS','causative_passive':'CP'}[m.group(1)]
        tmpl = '{%s}%s' % (key, SUF[m.group(2)])
    elif rid.startswith('teiru_'): tmpl = '{TE}' + TEIRU[rid[6:]]
    else: return None
    try: return tmpl.format(**f)
    except (KeyError, TypeError): return None

def cards(v, r, lvl):
    out = []
    for card in r[lvl].split('|'):
        jp = ''
        for t in card.split('+'):
            t = t.strip()
            x = v['cj'].get(STEM[t], '') if t in STEM else CH[t]['j']
            if x and x != '∅': jp += x
        out += [p for p in jp.split('|') if p and p != '∅']
    return out

def avail(v, r, lvl):
    if r['g'] and r['g'] in v.get('x', []): return False
    for card in r[lvl].split('|'):
        for t in card.split('+'):
            t = t.strip()
            if t in STEM and not v['cj'].get(STEM[t]): return False
    return True

def prompts():
    """Задания для всех доступных пар через сам движок приложения (vbTaskText)."""
    js = r'''
const fs=require('fs'),vm=require('vm');
const ctx={};vm.createContext(ctx);
vm.runInContext(fs.readFileSync(process.argv[1],'utf8')+';this.R=VERB_RULES;this.B=VERB_BANK;',ctx);
const out={};
for(const v of ctx.B)for(const r of ctx.R){
  const f=(t)=>t?t.replace(/\{ru_([a-z0-9_]+)\}/g,(m,k)=>v.ru[k]!=null?v.ru[k]:'{'+k+'}'):'';
  out[v.id+'|'+r.id]=[f(r.tp),f(r.al)];
}
process.stdout.write(JSON.stringify(out));'''
    p = subprocess.run(['node', '-e', js, os.path.join(HERE, '..', 'js', 'data', 'verbs.js')],
                       capture_output=True, text=True, check=True)
    return json.loads(p.stdout)

def main():
    errs = defaultdict(list)
    P = prompts()
    checked = 0
    for v in BANK:
        by_prompt = defaultdict(list)
        for r in RULES:
            if not avail(v, r, 'm'): continue
            want = expected(v, r['id'])
            for lvl in 'emh':
                if not avail(v, r, lvl): continue
                got = ''.join(cards(v, r, lvl))
                checked += 1
                if want is None: errs['нет эталона'].append(r['id']); break
                if got != want: errs['японский ответ'].append(f"{v['d']} {r['id']} [{lvl}]: {got} ≠ {want}")
                if len(cards(v, r, lvl)) < 2: errs['нечего собирать'].append(f"{v['d']} {r['id']} [{lvl}]")
            tp, al = P[v['id'] + '|' + r['id']]
            for t in (tp, al):
                if not t: continue
                if '{' in t or '∅' in t or '—' in t: errs['пустой слот'].append(f"{v['d']} {r['id']}: {t}")
                if re.search(r'\bне не\b', t): errs['двойное «не»'].append(f"{v['d']} {r['id']}: {t}")
                if re.search(r'\s{2,}|\s[,!?]', t): errs['пробелы'].append(f"{v['d']} {r['id']}: {t}")
            by_prompt[tp].append(r)
        # одинаковое задание у разных форм допустимо, только если у них один шаблон задания —
        # так помечены взаимозаменяемые формы (ば/たら, варианты обязанности…), режим B принимает
        # любую из них. Совпадение разных шаблонов — случайность данных, задание неоднозначно.
        for t, rs in by_prompt.items():
            if len({r['tp'] for r in rs}) > 1:
                errs['совпадающие задания'].append(f"{v['d']}: «{t}» ← " + ', '.join(r['id'] for r in rs))
    print(f'проверено сборок: {checked}')
    bad = 0
    for k, xs in errs.items():
        if k == 'нет эталона': xs = sorted(set(xs))
        bad += len(xs)
        print(f'\n## {k}: {len(xs)}')
        for x in xs[:40]: print('  ', x)
    print('\nOK' if not bad else f'\nошибок: {bad}')
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
