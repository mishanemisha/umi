#!/usr/bin/env python3
"""Генератор встраиваемых данных режима «Формы глаголов».

Читает 3 CSV из tools/data/, проверяет резолвер токенов против эталонных
колонок example_iku_* (270 проверок), печатает JS-блок с 4 константами:
  VERB_CH  — универсальные карточки-окончания (52)
  VERB_RULES — 90 форм с шаблонами easy/medium/hard и русским заданием
  VERB_CATS_DATA — чипы категорий
  VERB_BANK — 458 глаголов (ru-подсказки урезаны до реально используемых слотов)

Как обновить банк в приложении:
  1) положить новые CSV в tools/data/ (те же имена/колонки);
  2) python3 tools/gen_verbs.py > /tmp/verbs_data.js   # проверит 0 mismatches
  3) заменить в index.html 4 строки `const VERB_CH=…`…`const VERB_BANK=…`
     содержимым /tmp/verbs_data.js.
Токен-семантика шаблона: | = новая карточка, + = склейка в одну,
пустые/∅ карточки отбрасываются, внутренний | в hard-кусках дробит ещё раз.
"""
import csv, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "data")
rd = lambda p: list(csv.DictReader(open(os.path.join(DATA, p), encoding="utf-8-sig")))
chunks = rd("verb_multiselect_chunks_dictionary.csv")
rules  = rd("verb_conjugation_rules_multiselect_ru.csv")
verbs  = rd("verbs_compact_common_n5_n3_multiselect.csv")

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
bad = sum(1 for r in rules for lvl, ec in
          [("easy","example_iku_easy"),("medium","example_iku_medium"),("hard","example_iku_hard")]
          if "|".join(build(iku, r["chunk_template_"+lvl], True)) != r[ec])
print(f"validation: {len(rules)*3} checks, {bad} mismatches", file=sys.stderr)
assert bad == 0, "resolver diverged from example_iku columns"

ROMA = {'a':'あ','i':'い','u':'う','e':'え','o':'お','ka':'か','ki':'き','ku':'く','ke':'け','ko':'こ','ga':'が','gi':'ぎ','gu':'ぐ','ge':'げ','go':'ご','sa':'さ','shi':'し','su':'す','se':'せ','so':'そ','za':'ざ','ji':'じ','zu':'ず','ze':'ぜ','zo':'ぞ','ta':'た','chi':'ち','tsu':'つ','te':'て','to':'と','da':'だ','de':'で','do':'ど','na':'な','ni':'に','nu':'ぬ','ne':'ね','no':'の','ha':'は','hi':'ひ','fu':'ふ','he':'へ','ho':'ほ','ba':'ば','bi':'び','bu':'ぶ','be':'べ','bo':'ぼ','pa':'ぱ','pi':'ぴ','ma':'ま','mi':'み','mu':'む','me':'め','mo':'も','ya':'や','yu':'ゆ','yo':'よ','ra':'ら','ri':'り','ru':'る','re':'れ','ro':'ろ','wa':'わ','n':'ん','deki':'でき'}
CAT = {'основные':('basic','Основные'),'отрицательные':('negative','Отрицательные'),'условные':('conditional','Условные'),'вежливые':('polite','Вежливые'),'желание':('desire','Желание'),'наклонение':('mood','Наклонение'),'обязанность':('obligation','Обязанность'),'обязанность/условие':('obligation','Обязанность'),'potential':('potential','Потенциальная'),'passive':('passive','Пассив'),'causative':('causative','Каузатив'),'causative_passive':('causpass','Каузатив-пассив'),'〜ている':('progressive','Длительная 〜ている')}
STY = {'простая':'plain','вежливая':'polite','—':'-','':'-'}
KEEP = {'1pl_pf','causative_hint','causative_passive_hint','conditional_pf_1sg','future_1sg','gerund_pf','imperative_2sg','inf_ipf','inf_pf','passive_hint','past_ipf_mf','past_pf_mf','present_1sg'}

VC = {t: {"j": c["jp"], "f": c["fam"], "c": c["cf"]} for t, c in CH.items()}
# gl = grammar_label_ru («Категория · паттерн», для подсказки Mode A);
# si/mk = semantic_intent/mode_b_semantic_key (группировка Mode B);
# alt = accepted_alternative_grammar_ids; mb/hint = mode_b_enabled/requires_explicit_grammar_hint
VR = [{"id":r['form_id'],"nm":r['название_формы_ru'],"gl":r['grammar_label_ru'],"cat":CAT[r['категория']][0],"st":STY.get(r['стиль'],'-'),
       "e":r['chunk_template_easy'],"m":r['chunk_template_medium'],"h":r['chunk_template_hard'],
       "sl":r['ru_prompt_verb_slot'].replace('ru_',''),"tp":r['ru_prompt_template'],"al":r['ru_prompt_alt_template'],
       "cx":int(r['semantic_complexity_1_5'] or 1),"rl":r['recommended_chunk_level'],"df":int(r['train_default'] or 0),
       "si":r['semantic_intent'],"mk":r['mode_b_semantic_key'],"cg":r['canonical_grammar_id'],
       "alt":[x for x in (r['accepted_alternative_grammar_ids'] or '').split('|') if x],
       "mb":int(r['mode_b_enabled'] or 0),"hint":int(r['requires_explicit_grammar_hint'] or 0)}
      for r in rules]
seen, CATS = [], []
for r in rules:
    k, l = CAT[r['категория']]
    if k not in seen: seen.append(k); CATS.append({"v": k, "l": l})
CJ = [("base","chunk_base_jp"),("neg","chunk_neg_base_jp"),("dm","chunk_dict_medium_jp"),("dh","chunk_dict_hard_jp"),("ml","chunk_masu_link_jp"),("nl","chunk_nai_link_jp"),("bam","chunk_ba_link_medium_jp"),("bah","chunk_ba_link_hard_jp"),("tem","chunk_te_medium_jp"),("teh","chunk_te_hard_jp"),("tam","chunk_ta_medium_jp"),("tah","chunk_ta_hard_jp"),("potm","chunk_potential_medium_jp"),("poth","chunk_potential_hard_jp"),("pasm","chunk_passive_medium_jp"),("pash","chunk_passive_hard_jp"),("caum","chunk_causative_medium_jp"),("cauh","chunk_causative_hard_jp"),("cpm","chunk_causative_passive_medium_jp"),("cph","chunk_causative_passive_hard_jp"),("impm","chunk_imperative_medium_jp"),("imph","chunk_imperative_hard_jp"),("volm","chunk_volitional_medium_jp"),("volh","chunk_volitional_hard_jp"),("ranm","chunk_ranuki_medium_jp"),("ranh","chunk_ranuki_hard_jp")]
VB = []
for v in verbs:
    cj = {k: v[c] for k, c in CJ if v.get(c)}
    ru = {c[3:]: v[c] for c in v if c.startswith('ru_') and c[3:] in KEEP and v[c]}
    sd = [ROMA.get(x, x) for x in (v.get('chunk_stem_distractors_label','') or '').split('|') if x]
    VB.append({"id":v['verb_id'],"d":v['словарная_форма'],"r":v['чтение'],"rom":v['romaji'],
               "m":v['значение_ru'],"j":v['jlpt'],"t":v['тип_глагола'],"cj":cj,"ru":ru,"sd":sd})

J = lambda n, o: f"const {n}=" + json.dumps(o, ensure_ascii=False, separators=(',', ':')) + ";"
print("\n".join([J("VERB_CH", VC), J("VERB_RULES", VR), J("VERB_CATS_DATA", CATS), J("VERB_BANK", VB)]))
