#!/usr/bin/env python3
"""Сборка словаря кандзи для umi: data/kanji/<hex>.json + index.json.

Источники (скачиваются вручную, в репозиторий НЕ кладутся), SRC — каталог:
  SRC/kanjidic2/kanjidic2.xml.gz            KANJIDIC2 (EDRDG, CC BY-SA 4.0)
  SRC/jmdict/JMdict.gz                      JMdict (EDRDG, CC BY-SA 4.0); берутся только
                                            английские глоссы, русские (Warodai) — НЕТ
  SRC/kradfile/kradfile.gz                  KRADFILE (EDRDG, CC BY-SA 4.0)
  SRC/kanjivg/kanjivg-*-main.zip            KanjiVG (Ulrich Apel, CC BY-SA 3.0)
  SRC/furigana/JmdictFurigana.txt           JmdictFurigana (Doublevil, CC BY-SA, как JMdict)
  SRC/tatoeba/jpn-rus_links.tsv.bz2         Tatoeba (CC BY 2.0 FR)
  SRC/tatoeba-detailed/jpn_sentences_detailed.tsv.bz2
  SRC/tatoeba-detailed/rus_sentences_detailed.tsv.bz2
  SRC/jlpt/kanji.json                       davidluzgouveia/kanji-data (MIT); используется
                                            только поле jlpt_new (списки Jonathan Waller,
                                            tanos.co.uk, CC BY); поля WaniKani не читаются

Русский текст берётся только из двух мест:
  * js/data/words.js (BUILTIN_WORDS/ADDITIONAL_WORDS) — наш собственный выверенный текст;
  * переводы с английского рядом со скриптом (помечаются "mt"):
      ru_kanji.tsv     кандзи \\t значение; значение; …
      ru_radicals.tsv  номер ключа \\t название
      ru_words.tsv     слово \\t чтение \\t значение

Запуск (данные считаются недоверенными — только python3 -I):
  python3 -I tools/kanji/build_kanji.py SRC            # пишет data/kanji/
  python3 -I tools/kanji/build_kanji.py SRC --todo DIR # + списки непереведённого в DIR
"""
import bz2, glob, gzip, json, math, os, re, sys, unicodedata, zipfile
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(REPO, "data", "kanji")
WORDS_JS = os.path.join(REPO, "js", "data", "words.js")
SCHEMA_V = 1

MAX_WORDS, MAX_SENTS, SHORT_SENT = 10, 5, 25
JOYO_GRADES = {1, 2, 3, 4, 5, 6, 8}


def is_kanji(c):
    o = ord(c)
    return 0x4E00 <= o <= 0x9FFF or 0x3400 <= o <= 0x4DBF or 0xF900 <= o <= 0xFAFF or 0x20000 <= o <= 0x3134F


def is_hira(c):
    return "ぁ" <= c <= "ゟ"


def read_tsv(name, ncols):
    p = os.path.join(HERE, name)
    rows = []
    if not os.path.exists(p):
        return rows
    for ln, line in enumerate(open(p, encoding="utf-8"), 1):
        line = line.rstrip("\n")
        if not line.strip() or line.startswith("#"):
            continue
        parts = line.split("\t")
        if len(parts) != ncols:
            sys.exit(f"{name}:{ln}: ожидалось {ncols} колонок: {line!r}")
        rows.append([x.strip() for x in parts])
    return rows


# ---------- KANJIDIC2 ----------
def load_kanjidic(path):
    root = ET.parse(gzip.open(path)).getroot()
    hdr = {e.tag: e.text for e in root.find("header")}
    kd = {}
    for c in root.findall("character"):
        lit = c.find("literal").text
        misc = c.find("misc")
        d = {"strokes": int(misc.find("stroke_count").text)}
        g = misc.find("grade")
        if g is not None:
            d["grade"] = int(g.text)
        f = misc.find("freq")
        if f is not None:
            d["freq"] = int(f.text)
        for rv in c.findall("radical/rad_value"):
            if rv.get("rad_type") == "classical":
                d["rad"] = int(rv.text)
        on, kun, en = [], [], []
        for rm in c.findall("reading_meaning/rmgroup"):
            for r in rm.findall("reading"):
                if r.get("r_type") == "ja_on":
                    on.append(r.text)
                elif r.get("r_type") == "ja_kun":
                    kun.append(r.text)
            for m in rm.findall("meaning"):
                if m.get("m_lang") is None:
                    en.append(m.text)
        d["on"], d["kun"], d["en"] = on, kun, en
        d["nanori"] = [n.text for n in c.findall("reading_meaning/nanori")]
        kd[lit] = d
    return kd, hdr


# ---------- app word banks (js/data/words.js, только чтение) ----------
def load_app():
    src = open(WORDS_JS, encoding="utf-8").read()

    def const(name):
        key = "const " + name + "="
        i = src.index(key) + len(key)
        return json.JSONDecoder().raw_decode(src, i)[0]

    words = const("BUILTIN_WORDS") + const("ADDITIONAL_WORDS")
    try:
        example_for = const("EXAMPLE_FOR")
    except ValueError:
        example_for = {}
    return words, example_for


# ---------- KanjiVG ----------
PATH_RE = re.compile(r"<path\b[^>]*>")
G_RE = re.compile(r"<g\b[^>]*>")
ATTR_RE = re.compile(r'([\w:]+)="([^"]*)"')
D_OK = re.compile(r"^[MmCcSsLlHhVvZzQqTtAa0-9.,\-\s]+$")


def load_kanjivg(zpath, wanted):
    """{кандзи: ([d по порядку черт], [(element, original, radical-тип), …])}"""
    z = zipfile.ZipFile(zpath)
    names = set(z.namelist())
    res = {}
    for k in wanted:
        n = "kanji/%05x.svg" % ord(k)
        if n not in names:
            continue
        txt = z.read(n).decode("utf-8")
        strokes = {}
        for m in PATH_RE.finditer(txt):
            a = dict(ATTR_RE.findall(m.group(0)))
            sid = re.fullmatch(r"kvg:[0-9a-f]+-s(\d+)", a.get("id", ""))
            if sid and "d" in a:
                strokes[int(sid.group(1))] = a["d"]
        groups = []
        for m in G_RE.finditer(txt):
            a = dict(ATTR_RE.findall(m.group(0)))
            if "kvg:radical" in a and "kvg:element" in a:
                groups.append((a["kvg:element"], a.get("kvg:original", ""), a["kvg:radical"]))
        if not strokes:
            continue
        ds = [re.sub(r"\s+", " ", strokes[i]).strip() for i in sorted(strokes)]
        if sorted(strokes) != list(range(1, len(ds) + 1)) or not all(D_OK.match(d) for d in ds):
            print("KanjiVG: подозрительные пути у", k, file=sys.stderr)
            continue
        res[k] = (ds, groups)
    return res


# ---------- radicals ----------
def radical_char(n):
    return unicodedata.normalize("NFKC", chr(0x2F00 + n - 1))


# Вариантные (позиционные) формы ключей. radical.v ставится, только если KanjiVG
# помечает в знаке элемент-ключ и этот элемент — одна из форм ниже.
RAD_VARIANTS = {
    9: "亻", 18: "刂", 26: "㔾", 47: "川", 58: "⺕彑", 61: "忄⺗", 64: "扌", 66: "攵", 71: "旡",
    78: "歺", 85: "氵氺", 86: "灬", 87: "爫", 90: "丬", 93: "牜", 94: "犭", 96: "王⺩",
    113: "礻", 118: "⺮", 120: "糹", 122: "罒⺲", 123: "⺶", 125: "耂", 130: "月⺼",
    140: "艹⺾", 145: "衤", 146: "覀西", 149: "訁", 157: "⻊", 162: "辶⻌⻍", 163: "阝⻏",
    167: "釒", 170: "阝⻖", 173: "⻗", 184: "飠⻞",
}


def radical_variant(n, groups):
    allowed = RAD_VARIANTS.get(n, "")
    if not allowed:
        return None
    base = radical_char(n)
    order = {"tradit": 0, "general": 1, "nelson": 2}
    for el, orig, typ in sorted(groups, key=lambda g: order.get(g[2], 3)):
        if el != base and el in allowed and (not orig or orig == base or orig in allowed):
            return el
    return None


# ---------- KRADFILE ----------
# Заменители элементов из шапки KRADFILE → настоящие компоненты. Где есть обычный
# иероглиф Unicode (亻, 氵, 扌…), берём его: он есть во всех японских шрифтах.
KRAD_SUBST = {"化": "亻", "个": "\U000201A2", "并": "丷", "刈": "刂", "込": "辶",
              "尚": "⺌", "忙": "忄", "扎": "扌", "汁": "氵", "犯": "犭",
              "艾": "艹", "邦": "阝", "阡": "阝", "老": "耂", "杰": "灬",
              "礼": "礻", "疔": "疒", "禹": "禸", "初": "衤", "買": "罒",
              "滴": "啇", "乞": "\U00020089", "｜": "丨"}


def load_krad(path):
    res = {}
    for line in gzip.open(path).read().decode("euc-jp").splitlines():
        if not line or line.startswith("#") or " : " not in line:
            continue
        k, rest = line.split(" : ", 1)
        res[k.strip()] = rest.split()
    return res


def parts_for(k, krad):
    out = []
    for p in krad.get(k, []):
        if p == k:  # сам знак как элемент (日 : 日), но 化 в строке 化 — это ⺅
            if p in KRAD_SUBST and KRAD_SUBST[p] not in out:
                out.append(KRAD_SUBST[p])
            continue
        q = KRAD_SUBST.get(p, p)
        if q != k and q not in out:
            out.append(q)
    return out


# ---------- JMdict (только английские глоссы и приоритеты) ----------
BAD_INF = ("irregular", "out-dated", "rarely", "search-only")
TOP_PRI = {"news1", "ichi1", "spec1", "gai1"}
LOW_PRI = {"news2", "ichi2", "spec2", "gai2"}
INFL_POS = ("Godan", "Ichidan", "Kuru", "Nidan", "Yodan", "adjective (keiyoushi)")


def load_jmdict(path, kanji_set):
    """{кандзи: [кандидаты]}; кандидат — общеупотребительная запись (ke_pri) со словом."""
    cands = {}
    for ev, el in ET.iterparse(gzip.open(path), events=("end",)):
        if el.tag != "entry":
            continue
        kel = el.findall("k_ele")
        if not kel:
            el.clear()
            continue
        en, uk, arch, pos0 = [], False, False, []
        for s in el.findall("sense"):
            gl = [g for g in s.findall("gloss") if g.get("{http://www.w3.org/XML/1998/namespace}lang", "eng") == "eng"]
            if not gl:
                continue
            pos = [p.text for p in s.findall("pos")]
            misc = [m.text or "" for m in s.findall("misc")]
            if not en:
                pos0 = pos
                uk = any("kana alone" in t for t in misc)
                arch = any("archaic" in t or "obsolete" in t for t in misc)
            if len(en) < 3:
                en.append("; ".join(g.text or "" for g in gl[:4]))
        rels = []
        for r in el.findall("r_ele"):
            if r.find("re_nokanji") is not None:
                continue
            if any(any(b in (x.text or "") for b in BAD_INF) for x in r.findall("re_inf")):
                continue
            rels.append((r.find("reb").text, [x.text for x in r.findall("re_restr")],
                         [x.text for x in r.findall("re_pri")]))
        seq = int(el.find("ent_seq").text)
        for ke in kel:
            keb = ke.find("keb").text
            pri = [x.text for x in ke.findall("ke_pri")]
            if not pri or any(any(b in (x.text or "") for b in BAD_INF) for x in ke.findall("ke_inf")):
                continue
            ks = {c for c in keb if c in kanji_set}
            rs = [r for r in rels if not r[1] or keb in r[1]]
            if not ks or not rs:
                continue
            rs.sort(key=lambda r: 0 if r[2] else 1)
            ps = set(pri)
            nf = [int(p[2:]) for p in pri if p.startswith("nf")]
            if ps & TOP_PRI:
                base = nf[0] if nf else 26
            elif ps & LOW_PRI:
                base = (nf[0] if nf else 40) + 20
            else:
                continue
            score = base - 3 * len(ps & TOP_PRI) + 6 * max(0, len(keb) - 2) + (25 if uk else 0) + (40 if arch else 0)
            infl = ("godan" if any(x and x.startswith("Godan") for x in pos0) else
                    "infl" if any(x and x.startswith(INFL_POS) for x in pos0) else None)
            c = {"w": keb, "r": rs[0][0], "score": score, "seq": seq, "en": en, "pos": pos0, "infl": infl}
            for k in ks:
                cands.setdefault(k, []).append(c)
        el.clear()
    return cands


def jmdict_version(path):
    head = gzip.open(path).read(200000).decode("utf-8", "replace")
    m = re.search(r"JMdict created: (\d{4}-\d{2}-\d{2})", head)
    return m.group(1) if m else ""


# ---------- JmdictFurigana ----------
def load_furigana(path, wanted):
    """{(слово, чтение): [(начало, конец, чтение-кусок)]}"""
    res = {}
    with open(path, encoding="utf-8-sig") as fh:
        for line in fh:
            p = line.rstrip("\n").split("|")
            if len(p) != 3 or (p[0], p[1]) not in wanted:
                continue
            segs = []
            for part in p[2].split(";"):
                if ":" not in part:
                    continue
                rng, rt = part.split(":", 1)
                a, _, b = rng.partition("-")
                segs.append((int(a), int(b or a), rt))
            res[(p[0], p[1])] = segs
    return res


def kanji_reading(k, w, segs):
    i = w.find(k)
    for a, b, rt in segs or []:
        if a <= i <= b:
            return rt if a == b else None  # дзюкудзикун (今日) — чтения отдельного знака нет
    return None


# ---------- частотность слов по корпусу Tatoeba ----------
# Godan: какие каны могут идти сразу после основы (書く → 書か/書き/書く/書け/書こ/書い).
GODAN_ROW = {"う": "わいうえおっ", "く": "かきくけこいっ", "ぐ": "がぎぐげごい", "す": "さしすせそ",
             "つ": "たちつてとっ", "ぬ": "なにぬねのん", "ぶ": "ばびぶべぼん", "む": "まみむめもん",
             "る": "らりるれろっ"}


def corpus_counts(jpn_path, words):
    """В скольких японских предложениях Tatoeba встречается слово (как отдельная единица).

    words: {слово: "godan" | "infl" | None}. Изменяемое слово (глагол, i-прилагательное)
    считается по основе без последней каны (書く→書, 食べる→食べ) + следующей хирагане;
    для godan хирагана должна быть из ряда окончания (書か/書き/書い…). Остальные слова —
    точное вхождение, за которым не идёт кандзи (и не идёт хирагана, если это заодно
    основа глагола: 行 + って засчитывается глаголу, а не слову 行). Перед словом не
    должно быть кандзи."""
    full, stem = set(), {}
    for w, kind in words.items():
        if kind and len(w) > 1 and is_hira(w[-1]):
            stem.setdefault(w[:-1], []).append(w)
        else:
            full.add(w)
    maxlen = max((len(x) for x in list(full) + list(stem)), default=1)
    raw = {}
    kj = lambda c: is_kanji(c) or c == "々"
    with bz2.open(jpn_path, "rt", encoding="utf-8") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) < 3:
                continue
            s = p[2]
            n = len(s)
            found = set()
            for i in range(n):
                if i and kj(s[i - 1]):
                    continue
                for L in range(1, min(maxlen, n - i) + 1):
                    sub = s[i:i + L]
                    nxt = s[i + L] if i + L < n else ""
                    if nxt and kj(nxt):
                        continue
                    if sub in stem and nxt and is_hira(nxt):
                        found.add((sub, nxt))
                    elif sub in full:
                        found.add(sub)
            for w in found:
                raw[w] = raw.get(w, 0) + 1
    cnt = {w: raw.get(w, 0) for w in full}
    by_stem = {}
    for key, v in raw.items():
        if isinstance(key, tuple):
            by_stem.setdefault(key[0], {})[key[1]] = v
    for st, ws in stem.items():
        nx = by_stem.get(st, {})
        for w in ws:
            allowed = GODAN_ROW.get(w[-1], "") if words[w] == "godan" else None
            cnt[w] = sum(v for ch, v in nx.items() if allowed is None or ch in allowed)
    return cnt


# ---------- Tatoeba ----------
def read_detailed(path, ids=None):
    """id → (текст, автор|None) из *_sentences_detailed.tsv.bz2"""
    res = {}
    with bz2.open(path, "rt", encoding="utf-8") as fh:
        for line in fh:
            p = line.rstrip("\n").split("\t")
            if len(p) < 4:
                continue
            sid = int(p[0])
            if ids is not None and sid not in ids:
                continue
            res[sid] = (p[2].strip(), None if p[3] in ("\\N", "") else p[3])
    return res


def load_tatoeba(src, kanji_set, kd):
    links = {}
    with bz2.open(os.path.join(src, "tatoeba", "jpn-rus_links.tsv.bz2"), "rt", encoding="utf-8") as fh:
        for line in fh:
            a, b = line.rstrip("\n").split("\t")[:2]
            links.setdefault(int(a), []).append(int(b))
    det = os.path.join(src, "tatoeba-detailed")
    ru = read_detailed(os.path.join(det, "rus_sentences_detailed.tsv.bz2"), {x for v in links.values() for x in v})
    jp_all = read_detailed(os.path.join(det, "jpn_sentences_detailed.tsv.bz2"), set(links))
    by_k, seen = {}, set()
    for sid in sorted(jp_all):
        jp, ja_by = jp_all[sid]
        tr = [(0 if ru[x][1] else 1, x) for x in sorted(links[sid]) if x in ru and ru[x][0]]
        if not jp or not tr or re.search(r"[A-Za-zＡ-Ｚａ-ｚ0-9０-９]", jp):
            continue
        norm = re.sub(r"[。、！？!?「」『』…・\s]", "", jp)
        if norm in seen:
            continue
        seen.add(norm)
        rid = min(tr)[1]
        ks = [c for c in jp if is_kanji(c)]
        rarest = max((kd.get(c, {}).get("freq", 3000) for c in ks), default=0)
        nonjoyo = sum(1 for c in ks if kd.get(c, {}).get("grade") not in JOYO_GRADES)
        L = len(jp)
        score = ((0 if L <= SHORT_SENT else 1000) + L * 0.6 + rarest / 60 + 15 * nonjoyo
                 + (10 if L < 5 else 0) + (8 if not ja_by else 0) + (8 if not ru[rid][1] else 0))
        item = (score, sid, jp, ru[rid][0], rid, ja_by, ru[rid][1])
        for c in set(ks):
            if c in kanji_set:
                by_k.setdefault(c, []).append(item)
    for c in by_k:
        by_k[c].sort()
        by_k[c] = by_k[c][:MAX_SENTS]
    return by_k


# ---------- main ----------
def main():
    args = sys.argv[1:]
    if not args:
        sys.exit(__doc__)
    src = args[0]
    todo = args[args.index("--todo") + 1] if "--todo" in args else None

    kd, kd_hdr = load_kanjidic(os.path.join(src, "kanjidic2", "kanjidic2.xml.gz"))
    joyo = {k for k, d in kd.items() if d.get("grade") in JOYO_GRADES}
    app_words, example_for = load_app()
    bank = {c for w in app_words for c in w["w"] if is_kanji(c)}
    if bank - set(kd):
        print("нет в KANJIDIC2:", "".join(sorted(bank - set(kd))), file=sys.stderr)
    cover = sorted((joyo | bank) & set(kd), key=lambda k: (kd[k].get("grade", 99), kd[k].get("freq", 9999), k))
    cover_set = set(cover)

    jl = json.load(open(os.path.join(src, "jlpt", "kanji.json"), encoding="utf-8"))
    kvg_zip = sorted(glob.glob(os.path.join(src, "kanjivg", "kanjivg-*-main.zip")))[-1]
    kvg_ver = re.search(r"kanjivg-(\d+)-main", kvg_zip).group(1)
    kvg = load_kanjivg(kvg_zip, cover)
    krad = load_krad(os.path.join(src, "kradfile", "kradfile.gz"))
    jm_path = os.path.join(src, "jmdict", "JMdict.gz")
    jm = load_jmdict(jm_path, cover_set)
    allc = list({id(c): c for v in jm.values() for c in v}.values())
    kinds = {}
    for c in allc:
        kinds[c["w"]] = kinds.get(c["w"]) or c["infl"]
    cc = corpus_counts(os.path.join(src, "tatoeba-detailed", "jpn_sentences_detailed.tsv.bz2"), kinds)
    for c in allc:
        c["count"] = cc.get(c["w"], 0)
        c["score"] -= 6 * math.log2(1 + c["count"])
    furi = load_furigana(os.path.join(src, "furigana", "JmdictFurigana.txt"), {(c["w"], c["r"]) for c in allc})
    sents = load_tatoeba(src, cover_set, kd)

    ru_k = {r[0]: [x.strip() for x in r[1].split(";") if x.strip()] for r in read_tsv("ru_kanji.tsv", 2)}
    ru_rad = {int(r[0]): r[1] for r in read_tsv("ru_radicals.tsv", 2)}
    ru_w = {(r[0], r[1]): r[2] for r in read_tsv("ru_words.tsv", 3)}
    # переводы частотных слов из встроенного словаря (data/dict, собирает tools/dict/build_dict.py)
    dict_json = os.path.join(REPO, "data", "dict", "words.json")
    if os.path.exists(dict_json):
        with open(dict_json, encoding="utf-8") as fh:
            for dw in json.load(fh):
                if dw.get("m"):
                    ru_w.setdefault((dw["w"], dw["r"]), "; ".join(dw["m"][:2]))
    app_m, app_kr = {}, {}
    for w in app_words:
        app_m.setdefault((w["w"], w["r"]), w["m"])
        for part in w.get("k") or []:
            if part.get("c") and part.get("r"):
                app_kr.setdefault((w["w"], w["r"], part["c"]), part["r"])

    os.makedirs(OUT, exist_ok=True)
    for f in glob.glob(os.path.join(OUT, "*.json")):
        os.remove(f)

    st = {"svg": 0, "words": 0, "sents": 0, "ru": 0, "jlpt": 0, "parts": 0, "nanori": 0, "radv": 0,
          "w_own": 0, "w_mt": 0, "w_total": 0, "kr": 0, "stroke_mismatch": []}
    todo_k, todo_w, todo_rad = [], {}, set()
    for k in cover:
        d = kd[k]
        o = {"v": SCHEMA_V, "k": k, "strokes": d["strokes"]}
        if "grade" in d:
            o["grade"] = d["grade"]
        jn = (jl.get(k) or {}).get("jlpt_new")
        if jn in (1, 2, 3, 4, 5):
            o["jlpt"] = jn
            st["jlpt"] += 1
        if "freq" in d:
            o["freq"] = d["freq"]
        ds, groups = kvg.get(k, (None, []))
        if "rad" in d:
            rad = {"c": radical_char(d["rad"]), "n": d["rad"]}
            v = radical_variant(d["rad"], groups)
            if v:
                rad["v"] = v
                st["radv"] += 1
            if d["rad"] in ru_rad:
                rad["ru"] = ru_rad[d["rad"]]
            else:
                todo_rad.add(d["rad"])
            o["radical"] = rad
        p = parts_for(k, krad)
        if p:
            o["parts"] = p
            st["parts"] += 1
        for key in ("on", "kun", "nanori"):
            if d[key]:
                o[key] = d[key]
        if d["nanori"]:
            st["nanori"] += 1
        if k in ru_k:
            o["ru"] = ru_k[k]
            o["ru_src"] = "mt"
            o["mt"] = 1
            st["ru"] += 1
        else:
            todo_k.append(k)
        if d["en"]:
            o["en"] = d["en"]
        if ds:
            o["svg"] = ds
            st["svg"] += 1
            if len(ds) != d["strokes"]:
                st["stroke_mismatch"].append(k)
        # words: самые частотные общеупотребительные слова со знаком
        fav = set(example_for.get(k, []))
        words, used = [], set()
        for c in sorted(jm.get(k, []), key=lambda c: (c["score"] - (15 if c["w"] in fav else 0), len(c["w"]), c["seq"])):
            key = (c["w"], c["r"])
            if key in used:
                continue
            if key in app_m:
                m, mt = app_m[key], False
            elif key in ru_w:
                m, mt = ru_w[key], True
            else:  # нет перевода — слово в todo, место в десятке достаётся следующему
                todo_w.setdefault(key, c)
                continue
            used.add(key)
            wo = {"w": c["w"], "r": c["r"]}
            kr = kanji_reading(k, c["w"], furi.get(key)) or app_kr.get((c["w"], c["r"], k))
            if kr:
                wo["kr"] = kr
                st["kr"] += 1
            wo["m"] = m
            wo["id"] = "jm%d" % c["seq"]
            if mt:
                wo["mt"] = 1
            st["w_mt" if mt else "w_own"] += 1
            words.append(wo)
            if len(used) >= MAX_WORDS:
                break
        if words:
            o["words"] = words
            st["words"] += 1
            st["w_total"] += len(words)
        ss = sents.get(k)
        if ss:
            o["sents"] = [{"jp": s[2], "ru": s[3], "src": {"ja": s[1], "ru": s[4], "by": [s[5], s[6]]}} for s in ss]
            st["sents"] += 1
        with open(os.path.join(OUT, "%x.json" % ord(k)), "w", encoding="utf-8") as fh:
            json.dump(o, fh, ensure_ascii=False, separators=(",", ":"))

    version = "%s+kvg%s+jm%s" % (kd_hdr.get("date_of_creation", ""), kvg_ver, jmdict_version(jm_path))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as fh:
        json.dump({"version": version, "count": len(cover), "kanji": "".join(cover)}, fh,
                  ensure_ascii=False, separators=(",", ":"))

    if todo:
        os.makedirs(todo, exist_ok=True)
        with open(os.path.join(todo, "todo_kanji.tsv"), "w", encoding="utf-8") as fh:
            for k in todo_k:
                fh.write("%s\t%s\n" % (k, " | ".join(kd[k]["en"])))
        with open(os.path.join(todo, "todo_words.tsv"), "w", encoding="utf-8") as fh:
            for (w, r), c in todo_w.items():
                pos = ",".join(x for x in c["pos"][:2] if x)
                fh.write("%s\t%s\t%s\t%s\n" % (w, r, " / ".join(c["en"]), pos))
        with open(os.path.join(todo, "todo_radicals.tsv"), "w", encoding="utf-8") as fh:
            for n in sorted(todo_rad):
                fh.write("%d\t%s\n" % (n, radical_char(n)))

    print("version", version)
    print("kanji", len(cover), "(jōyō %d, из банка слов вне jōyō %d)" % (len(joyo), len(bank - joyo)))
    for key in ("svg", "ru", "jlpt", "parts", "radv", "nanori", "words", "sents"):
        print(" %-7s %d" % (key, st[key]))
    print(" word slots %d: own %d, mt %d, with kr %d" % (st["w_total"], st["w_own"], st["w_mt"], st["kr"]))
    print(" stroke count != KanjiVG:", "".join(st["stroke_mismatch"]) or "—")
    print(" untranslated: kanji %d, words %d, radicals %d" % (len(todo_k), len(todo_w), len(todo_rad)))


if __name__ == "__main__":
    main()
