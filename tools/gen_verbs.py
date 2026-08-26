#!/usr/bin/env python3
"""Генератор встраиваемых данных режима «Формы глаголов» (v3).

Читает 4 CSV из tools/data/, проверяет резолвер токенов против эталонных
колонок example_iku_* (297 проверок), печатает JS-блок с 4 константами:
  VERB_CH  — универсальные карточки-окончания (60)
  VERB_RULES — 99 форм: шаблоны easy/medium/hard, русское задание (ru_prompt_*_v3),
               gate-колонка и фильтр-теги (form/semantic/register/question/pool)
  VERB_CATS_DATA — каталог фильтров из verb_exercise_filters_v3_ru.csv
                   (kind: form | modifier | register)
  VERB_BANK — 458 глаголов: ru-слоты урезаны до реально используемых,
              «x» — список запрещённых gate-суффиксов (train_* = 0)

Как обновить банк в приложении:
  1) положить новые CSV в tools/data/ (те же имена/колонки);
  2) python3 tools/gen_verbs.py > /tmp/verbs_data.js   # проверит 0 mismatches
  3) заменить в index.html 4 строки `const VERB_CH=…`…`const VERB_BANK=…`
     содержимым /tmp/verbs_data.js.
Токен-семантика шаблона: | = новая карточка, + = склейка в одну,
пустые/∅ карточки отбрасываются, внутренний | в hard-кусках дробит ещё раз.
Логика v3 описана в tools/verb_training_logic_v3.md.
"""
import csv, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
rd = lambda p: list(csv.DictReader(open(os.path.join(DATA, p), encoding="utf-8-sig")))
chunks  = rd("verb_multiselect_chunks_dictionary_v3.csv")
rules   = rd("verb_conjugation_rules_v3_ru.csv")
verbs   = rd("verbs_compact_common_n5_n3_v3.csv")
filters = rd("verb_exercise_filters_v3_ru.csv")

CH = {c["token_id"].strip(): {"jp": c["jp_surface"], "r": c["card_label_romaji"],
      "fam": c["family"], "cf": [x for x in c["confusable_tokens"].split("|") if x]} for c in chunks}

STEM = {"BASE":("chunk_base_jp",None),"NEGBASE":("chunk_neg_base_jp",None),
 "DICT_M":("chunk_dict_medium_jp","chunk_dict_medium_label"),"DICT_H":("chunk_dict_hard_jp","chunk_dict_hard_label"),
 "MASU_LINK":("chunk_masu_link_jp","chunk_masu_link_label"),"NAI_LINK":("chunk_nai_link_jp","chunk_nai_link_label"),
 "BA_M":("chunk_ba_link_medium_jp","chunk_ba_link_medium_label"),"BA_H":("chunk_ba_link_hard_jp","chunk_ba_link_hard_label"),
 "TE_M":("chunk_te_medium_jp","chunk_te_medium_label"),"TE_H":("chunk_te_hard_jp","chunk_te_hard_label"),
 "TA_M":("chunk_ta_medium_jp","chunk_ta_medium_label"),"TA_H":("chunk_ta_hard_jp","chunk_ta_hard_label"),
 "POT_M":("chunk_potential_medium_jp","chunk_potential_medium_label"),"POT_H":("chunk_potential_hard_jp","chunk_potential_hard_label"),
 "PASS_M":("chunk_passive_medium_jp","chunk_passive_medium_label"),"PASS_H":("chunk_passive_hard_jp","chunk_passive_hard_label"),
 "CAUSE_M":("chunk_causative_medium_jp","chunk_causative_medium_label"),"CAUSE_H":("chunk_causative_hard_jp","chunk_causative_hard_label"),
 "CAUSEPASS_M":("chunk_causative_passive_medium_jp","chunk_causative_passive_medium_label"),
 "CAUSEPASS_H":("chunk_causative_passive_hard_jp","chunk_causative_passive_hard_label"),
 "IMP_M":("chunk_imperative_medium_jp","chunk_imperative_medium_label"),"IMP_H":("chunk_imperative_hard_jp","chunk_imperative_hard_label"),
 "VOL_M":("chunk_volitional_medium_jp","chunk_volitional_medium_label"),"VOL_H":("chunk_volitional_hard_jp","chunk_volitional_hard_label"),
 "RANUKI_M":("chunk_ranuki_medium_jp","chunk_ranuki_medium_label"),"RANUKI_H":("chunk_ranuki_hard_jp","chunk_ranuki_hard_label")}

def resolve(v, tok, romaji=False):
    if tok in STEM:
        jpc, lbc = STEM[tok]
        return (v.get(lbc, "") if lbc else v.get(jpc, "")) if romaji else v.get(jpc, "")
    if tok in CH:
        return CH[tok]["r"] if romaji else CH[tok]["jp"]
    return "??" + tok

def build(v, tmpl, romaji=False):
    out = []
    for card in tmpl.split("|"):
        s = "".join(p for p in (resolve(v, t.strip(), romaji) for t in card.split("+")) if p and p != "∅")
        for part in s.split("|"):
            if part:
                out.append(part)
    return out

# ---- validation against example_iku_* (ground truth) ----
iku = next(v for v in verbs if v["verb_id"] == "iku")
bad = skipped = checked = 0
for r in rules:
    for lvl, ec in [("easy","example_iku_easy"),("medium","example_iku_medium"),("hard","example_iku_hard")]:
        if not (r[ec] or "").strip():   # у 9 новых правил v3 эталон не заполнен
            skipped += 1; continue
        checked += 1
        if "|".join(build(iku, r["chunk_template_"+lvl], True)) != r[ec]:
            bad += 1
            print(f"  MISMATCH {r['form_id']} {lvl}: want {r[ec]} got "
                  + "|".join(build(iku, r["chunk_template_"+lvl], True)), file=sys.stderr)
print(f"validation: {checked} checks, {bad} mismatches, {skipped} без эталона", file=sys.stderr)
assert bad == 0, "resolver diverged from example_iku columns"
unknown = sorted({t.strip() for r in rules for lvl in ("easy","medium","hard")
                  for card in r["chunk_template_"+lvl].split("|") for t in card.split("+")
                  if t.strip() and t.strip() not in STEM and t.strip() not in CH})
assert not unknown, f"токены вне словаря: {unknown}"

ROMA = {'a':'あ','i':'い','u':'う','e':'え','o':'お','ka':'か','ki':'き','ku':'く','ke':'け','ko':'こ','ga':'が','gi':'ぎ','gu':'ぐ','ge':'げ','go':'ご','sa':'さ','shi':'し','su':'す','se':'せ','so':'そ','za':'ざ','ji':'じ','zu':'ず','ze':'ぜ','zo':'ぞ','ta':'た','chi':'ち','tsu':'つ','te':'て','to':'と','da':'だ','de':'で','do':'ど','na':'な','ni':'に','nu':'ぬ','ne':'ね','no':'の','ha':'は','hi':'ひ','fu':'ふ','he':'へ','ho':'ほ','ba':'ば','bi':'び','bu':'ぶ','be':'べ','bo':'ぼ','pa':'ぱ','pi':'ぴ','ma':'ま','mi':'み','mu':'む','me':'め','mo':'も','ya':'や','yu':'ゆ','yo':'よ','ra':'ら','ri':'り','ru':'る','re':'れ','ro':'ろ','wa':'わ','n':'ん','deki':'でき'}
STY = {'простая':'plain','вежливая':'polite','—':'-','':'-'}
SPL = lambda s: [x for x in (s or '').split('|') if x]
# v3-поля приоритетнее старых (ru_prompt_*), см. verb_training_logic_v3.md
pick = lambda r, k: (r.get(k + '_v3') or r.get(k) or '').strip()

VC = {t: {"j": c["jp"], "f": c["fam"], "c": c["cf"]} for t, c in CH.items()}
# gl = grammar_label_ru («Категория · паттерн», подсказка Mode A);
# si/mk = semantic_intent/mode_b_semantic_key (группировка Mode B);
# alt = accepted_alternative_grammar_ids; mb/hint = mode_b_enabled/requires_explicit_grammar_hint;
# g = verb_gate_column без префикса train_ (проверяется по VERB_BANK[].x);
# ff/fs/fr/fq/fp = filter_form_tags/_semantic_tags/_register_tags/_question/_default_pool
VR = []
for r in rules:
    slot = pick(r, 'ru_prompt_verb_slot')
    VR.append({"id":r['form_id'],"nm":r['название_формы_ru'],"gl":r['grammar_label_ru'],"st":STY.get(r['стиль'],'-'),
       "e":r['chunk_template_easy'],"m":r['chunk_template_medium'],"h":r['chunk_template_hard'],
       "sl":slot[3:] if slot.startswith('ru_') else slot,
       "ps":pick(r, 'ru_prompt_strategy'),
       "tp":pick(r, 'ru_prompt_template'),"al":pick(r, 'ru_prompt_alt_template'),
       "cx":int(r['semantic_complexity_1_5'] or 1),"rl":r['recommended_chunk_level'],"df":int(r['train_default'] or 0),
       "si":r['semantic_intent'],"mk":r['mode_b_semantic_key'],"cg":r['canonical_grammar_id'],
       "alt":SPL(r['accepted_alternative_grammar_ids']),
       "mb":int(r['mode_b_enabled'] or 0),"hint":int(r['requires_explicit_grammar_hint'] or 0),
       "g":re.sub(r'^train_', '', r['verb_gate_column'].strip()),
       "ff":SPL(r['filter_form_tags']),"fs":SPL(r['filter_semantic_tags']),"fr":SPL(r['filter_register_tags']),
       "fq":int(r['filter_question'] or 0),"fp":int(r['filter_default_pool'] or 1)})

CATS = [{"v":f['filter_id'],"l":f['label_ru'],"k":f['kind'],"c":f['match_column'],"mv":f['match_value'],
         "d":f['description_ru']} for f in sorted(filters, key=lambda f: int(f['sort_order']))]

# слоты, реально встречающиеся в v3-шаблонах: {ru_xxx}
SLOTS = {m for r in VR for m in re.findall(r'\{ru_([a-z0-9_]+)\}', r['tp'] + ' ' + r['al'])}
# какие gate-суффиксы открывают доступ к слоту (слот нужен глаголу только если он проходит хоть один такой gate)
SLOT_GATES = {s: {r['g'] for r in VR if '{ru_%s}' % s in r['tp'] + r['al']} for s in SLOTS}
GATES = sorted({r['g'] for r in VR})
print(f"slots: {sorted(SLOTS)}\ngates: {GATES}", file=sys.stderr)

CJ = [("base","chunk_base_jp"),("neg","chunk_neg_base_jp"),("dm","chunk_dict_medium_jp"),("dh","chunk_dict_hard_jp"),("ml","chunk_masu_link_jp"),("nl","chunk_nai_link_jp"),("bam","chunk_ba_link_medium_jp"),("bah","chunk_ba_link_hard_jp"),("tem","chunk_te_medium_jp"),("teh","chunk_te_hard_jp"),("tam","chunk_ta_medium_jp"),("tah","chunk_ta_hard_jp"),("potm","chunk_potential_medium_jp"),("poth","chunk_potential_hard_jp"),("pasm","chunk_passive_medium_jp"),("pash","chunk_passive_hard_jp"),("caum","chunk_causative_medium_jp"),("cauh","chunk_causative_hard_jp"),("cpm","chunk_causative_passive_medium_jp"),("cph","chunk_causative_passive_hard_jp"),("impm","chunk_imperative_medium_jp"),("imph","chunk_imperative_hard_jp"),("volm","chunk_volitional_medium_jp"),("volh","chunk_volitional_hard_jp"),("ranm","chunk_ranuki_medium_jp"),("ranh","chunk_ranuki_hard_jp")]
VB = []
for v in verbs:
    cj = {k: v[c] for k, c in CJ if v.get(c)}
    blocked = {g for g in GATES if (v.get('train_' + g, '1') or '0').strip() == '0'}
    # ru-слот кладём только если глагол проходит хотя бы один gate формы, где слот используется
    ru = {s: v['ru_' + s] for s in sorted(SLOTS)
          if v.get('ru_' + s) and (SLOT_GATES[s] - blocked)}
    sd = [ROMA.get(x, x) for x in (v.get('chunk_stem_distractors_label','') or '').split('|') if x]
    e = {"id":v['verb_id'],"d":v['словарная_форма'],"r":v['чтение'],"rom":v['romaji'],
         "m":v['значение_ru'],"j":v['jlpt'],"t":v['тип_глагола'],"cj":cj,"ru":ru,"sd":sd}
    if blocked: e["x"] = sorted(blocked)
    VB.append(e)

J = lambda n, o: f"const {n}=" + json.dumps(o, ensure_ascii=False, separators=(',', ':')) + ";"
print("\n".join([J("VERB_CH", VC), J("VERB_RULES", VR), J("VERB_CATS_DATA", CATS), J("VERB_BANK", VB)]))
