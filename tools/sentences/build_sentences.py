#!/usr/bin/env python3
"""Примеры предложений для карточек иероглифов и словаря: разбивка на слова,
фуригана и русские значения слов; отбор только одобренных ревью.

Источники (скачиваются вручную, в репозиторий НЕ кладутся), SRC — каталог
с той же раскладкой, что у tools/dict/build_dict.py:
  SRC/tatoeba_indices/jpn_indices.csv            Tatoeba (CC BY 2.0 FR): разбивка на слова
  SRC/tatoeba_links/jpn-rus_links.tsv            Tatoeba: пары ja–ru
  SRC/tatoeba_jpn_detailed/jpn_sentences_detailed.tsv   тексты и авторы
  SRC/tatoeba_rus_detailed/rus_sentences_detailed.tsv
  SRC/furigana/JmdictFurigana.txt                JmdictFurigana (CC BY-SA)
  SRC/jmdict/JMdict.xml                          JMdict (EDRDG, CC BY-SA 4.0): чтение леммы
Каждый файл можно положить и как .bz2/.gz.

Русские значения слов: банк приложения (js/data/words.js), словарь data/dict
(свой перевод), служебные слова — таблица GRAMMAR ниже. Русские глоссы JMdict
не используются (они из Warodai, CC BY-NC-ND).

Запуск (данные недоверенные — только python3 -I):
  python3 -I tools/sentences/build_sentences.py pool SRC   # tools/sentences/pool.tsv — кандидаты на ревью
  python3 -I tools/sentences/build_sentences.py apply SRC  # примеры в data/kanji/*.json и data/dict

Ревью: tools/sentences/review.tsv — ja_id<TAB>ok|bad<TAB>причина. В приложение
попадают только примеры с вердиктом ok.

Предложение в данных: {"jp","ru","src":{"ja","ru","by"},"t":[токены]}, токен —
[форма в тексте с фуриганой «{漢字|かんじ}», лемма, чтение леммы, значение];
пустые хвостовые поля опускаются.
"""
import bz2, glob, gzip, json, os, re, sys
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
MAX_LEN = 30          # символов в японском предложении
KANJI_SENTS = 5
WORD_SENTS = 3

# Служебные слова и частые грамматические элементы: коротко, по-русски
GRAMMAR = {
    'は': 'частица темы', 'が': 'частица подлежащего; но', 'を': 'частица прямого дополнения',
    'に': 'частица: в, на, к (место, время, цель)', 'へ': 'частица направления: в, к',
    'で': 'частица: в (месте действия), с помощью', 'と': 'частица: и, с; цитата',
    'も': 'частица: тоже, даже', 'の': 'частица принадлежности; номинализатор',
    'か': 'вопросительная частица; или', 'よ': 'частица утверждения', 'ね': 'частица: не так ли',
    'から': 'частица: из, от; потому что', 'まで': 'частица: до', 'より': 'частица: чем; от',
    'や': 'частица: и (неполный перечень)', 'だけ': 'только', 'しか': 'только (с отрицанием)',
    'ばかり': 'только, всё время', 'など': 'и тому подобное', 'って': 'разговорная цитата: мол',
    'けど': 'но, хотя', 'けれど': 'но, хотя', 'けれども': 'но, хотя', 'のに': 'хотя; чтобы',
    'ので': 'так как', 'ながら': 'одновременно с; хотя', 'し': 'и к тому же', 'な': 'частица запрета; связка',
    'だ': 'связка: есть, являться', 'です': 'вежливая связка: есть, являться',
    'ます': 'вежливое окончание глагола', 'た': 'прошедшее время', 'ない': 'не, нет (отрицание)',
    'ぬ': 'отрицание (книжн.)', 'ん': 'разговорное: ведь (の)', 'う': 'намерение: давай',
    'よう': 'намерение: давай; похоже', 'たい': 'хотеть (сделать)', 'れる': 'страдательный залог; возможность',
    'られる': 'страдательный залог; возможность', 'せる': 'понудительный залог', 'させる': 'понудительный залог',
    'て': 'соединительная форма', 'ば': 'если', 'たら': 'если, когда', 'なら': 'если (уж)',
    'でしょう': 'наверное', 'だろう': 'наверное', 'ある': 'быть, иметься (о неодуш.)', 'いる': 'быть, находиться (об одуш.)',
    '居る': 'быть, находиться (об одуш.)', '有る': 'быть, иметься (о неодуш.)', '為る': 'делать', 'する': 'делать',
    '事': 'дело, факт; то, что', 'こと': 'дело, факт; то, что', '物': 'вещь; то, что', 'もの': 'вещь; то, что',
    'の(だ)': 'объяснение: дело в том, что', 'ている': 'длящееся действие', 'てる': 'длящееся действие (разг.)',
    'さん': 'вежливый суффикс к имени', 'ちゃん': 'ласковый суффикс к имени', 'くん': 'суффикс к имени (м.)',
    '君': 'ты; суффикс к имени (м.)', '私': 'я', '僕': 'я (м.)', '俺': 'я (м., грубо)', '彼': 'он', '彼女': 'она; девушка',
    'あなた': 'вы, ты', '貴方': 'вы, ты', 'これ': 'это', 'それ': 'то, это', 'あれ': 'вон то', 'この': 'этот',
    'その': 'тот, этот', 'あの': 'вон тот', 'ここ': 'здесь', 'そこ': 'там', 'あそこ': 'вон там', 'どこ': 'где',
    '何': 'что', 'なに': 'что', 'なん': 'что', '誰': 'кто', 'いつ': 'когда', 'どう': 'как', 'なぜ': 'почему',
    'もう': 'уже; ещё', 'まだ': 'ещё; ещё не', 'とても': 'очень', '一番': 'самый', 'ちょっと': 'немного',
    'ください': 'пожалуйста (просьба)', '下さい': 'пожалуйста (просьба)', 'くれる': 'давать (мне), делать для меня',
    'なさい': 'повелительное: сделай', 'できる': 'мочь, уметь; получаться', 'なる': 'становиться',
    'になる': 'становиться (кем-л., чем-л.)', 'しまう': 'закончить; сделать нечаянно', 'よく': 'хорошо; часто',
    'いつも': 'всегда', 'つもり': 'намерение', 'みんな': 'все', 'みな': 'все', 'たくさん': 'много',
    'ねばならない': 'нужно, должен', 'ために': 'для, ради; из-за', 'ため': 'для, ради; из-за', 'ように': 'чтобы; как',
    'ではない': 'не является', 'じゃない': 'не является', 'やる': 'делать; давать', 'いけない': 'нельзя; плохо',
    'ほど': 'примерно; настолько', 'たち': 'множественное число (люди)', '私たち': 'мы', 'すべて': 'всё, все',
    'ことができる': 'мочь (сделать)', 'まで': 'до', 'すぐ': 'сразу', 'すぐに': 'сразу', 'について': 'о, насчёт',
    'ことがある': 'бывает, случалось', 'もらう': 'получать (от кого-л.)', 'いただける': 'можно получить (вежл.)',
    'べき': 'следует, должен', 'という': 'под названием; что', 'と言う': 'под названием; что', 'ひどい': 'ужасный, жестокий',
    'ほとんど': 'почти', 'また': 'снова; а также', 'かもしれない': 'может быть', 'かかる': 'занимать (время, деньги)',
    'うまい': 'вкусный; умелый', 'お': 'вежливая приставка', 'ご': 'вежливая приставка', '御': 'вежливая приставка',
    'ここ': 'здесь', 'どこ': 'где', 'どうして': 'почему', 'いかが': 'как', 'こう': 'так', 'そう': 'так; похоже',
    'ある': 'быть, иметься (о неодуш.)', 'いる': 'быть, находиться (об одуш.)', 'ない': 'нет; не',
}

def opener(path):
    if path.endswith('.bz2'):
        return bz2.open(path, 'rt', encoding='utf-8')
    if path.endswith('.gz'):
        return gzip.open(path, 'rt', encoding='utf-8')
    return open(path, encoding='utf-8')

def find(src, sub, names):
    for n in names:
        for p in (os.path.join(src, sub, n), os.path.join(src, sub, n + '.bz2'), os.path.join(src, sub, n + '.gz')):
            if os.path.exists(p):
                return p
    sys.exit('нет источника: %s/%s' % (sub, names[0]))

def is_kanji(c):
    n = ord(c)
    return 0x4e00 <= n <= 0x9fff or 0x3400 <= n <= 0x4dbf or 0xf900 <= n <= 0xfaff or c == '々'

def kata2hira(s):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)

# ── разбор индексов Tatoeba: лемма(чтение){форма}[значение]~ ──
TOK = re.compile(r'^(?P<l>[^(\[{~]+)(?:\((?P<r>[^)]*)\))?(?:\[(?P<n>\d+)\])?(?:\{(?P<s>[^}]*)\})?~?$')

def parse_bline(line):
    out = []
    for raw in line.split():
        m = TOK.match(raw)
        if not m:
            continue
        lemma = m.group('l')
        out.append({'l': lemma, 'r': m.group('r') or '', 's': m.group('s') or lemma})
    return out

def load_jmdict_readings(path):
    """кандзи-форма → чтения (сначала из записей с приоритетом); «#номер записи» → первое чтение."""
    rd = {}
    with opener(path) as fh:
        for _, el in ET.iterparse(fh, events=('end',)):
            if el.tag != 'entry':
                continue
            kebs = [k.findtext('keb') for k in el.findall('k_ele')]
            pri = any(k.find('ke_pri') is not None for k in el.findall('k_ele'))
            rebs = [r.findtext('reb') for r in el.findall('r_ele') if r.find('re_nokanji') is None]
            if rebs:
                rd['#' + el.findtext('ent_seq')] = [rebs[0]]
            for k in kebs:
                lst = rd.setdefault(k, [])
                new = [r for r in rebs if r not in lst]
                # чтения частотной записи — вперёд, в их собственном порядке
                rd[k] = new + lst if pri else lst + new
            el.clear()
    return rd

def load_furigana(path):
    """(слово, чтение) → список (начало, конец, чтение) по символам."""
    fu = {}
    with opener(path) as fh:
        for line in fh:
            parts = line.rstrip('\n').lstrip('﻿').split('|')
            if len(parts) != 3:
                continue
            segs = []
            for seg in parts[2].split(';'):
                if ':' not in seg:
                    continue
                span, r = seg.split(':', 1)
                a, _, b = span.partition('-')
                segs.append((int(a), int(b or a), r))
            fu.setdefault((parts[0], parts[1]), segs)
    return fu

def surface_markup(tok, fu):
    """форма в тексте с фуриганой над кандзи: «{点|つ}け». Чтение берём из разбивки
    леммы и переносим на совпадающее начало формы (点ける → 点け)."""
    s, l, r = tok['s'], tok['l'], tok['r']
    if not any(is_kanji(c) for c in s):
        return s
    segs = fu.get((l, r))
    if not segs:
        return None
    # длина общего начала формы и леммы
    n = 0
    while n < len(s) and n < len(l) and s[n] == l[n]:
        n += 1
    out, i = [], 0
    for a, b, rd in segs:
        if b >= n:          # кусок леммы выходит за общее начало — фуригану не угадать
            break
        out.append(s[i:a])
        out.append('{%s|%s}' % (s[a:b + 1], rd))
        i = b + 1
    rest = s[i:]
    if any(is_kanji(c) for c in rest):
        return None
    out.append(rest)
    return ''.join(out)

def common_prefix(a, b):
    n = 0
    while n < len(a) and n < len(b) and a[n] == b[n]:
        n += 1
    return n

def strip_markup(m):
    return re.sub(r'\{([^|}]*)\|[^}]*\}', r'\1', m)

def load_meanings():
    """(лемма, чтение) и лемма → русское значение: банк приложения, затем data/dict."""
    by_wr, by_w = {}, {}
    src = open(os.path.join(REPO, 'js', 'data', 'words.js'), encoding='utf-8').read()
    for name in ('BUILTIN_WORDS', 'ADDITIONAL_WORDS'):
        m = re.search(r'const %s=(\[.*?\]);' % name, src, re.S)
        if m:
            for w in json.loads(m.group(1)):
                mm = str(w.get('m', '')).split(';')[0].strip()
                by_wr.setdefault((w['w'], w['r']), mm)
                by_w.setdefault(w['w'], mm)
    dpath = os.path.join(REPO, 'data', 'dict', 'words.json')
    if os.path.exists(dpath):
        for w in json.load(open(dpath, encoding='utf-8')):
            mm = (w.get('m') or [''])[0]
            by_wr.setdefault((w['w'], w['r']), mm)
            by_w.setdefault(w['w'], mm)
    return by_wr, by_w

def load_sources(src):
    links = {}
    with opener(find(src, 'tatoeba_links', ['jpn-rus_links.tsv'])) as fh:
        for line in fh:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 2:
                links.setdefault(int(p[0]), []).append(int(p[1]))
    def detailed(sub, name, keep):
        out = {}
        with opener(find(src, sub, [name])) as fh:
            for line in fh:
                p = line.rstrip('\n').split('\t')
                if len(p) >= 4 and int(p[0]) in keep:
                    out[int(p[0])] = (p[2], None if p[3] in ('', '\\N') else p[3])
        return out
    jpn = detailed('tatoeba_jpn_detailed', 'jpn_sentences_detailed.tsv', set(links))
    rus = detailed('tatoeba_rus_detailed', 'rus_sentences_detailed.tsv', {r for v in links.values() for r in v})
    idx = {}
    with opener(find(src, 'tatoeba_indices', ['jpn_indices.csv'])) as fh:
        for line in fh:
            p = line.rstrip('\n').split('\t')
            if len(p) >= 3 and int(p[0]) in jpn:
                idx[int(p[0])] = p[2]
    return links, jpn, rus, idx

def build_candidates(src):
    links, jpn, rus, idx = load_sources(src)
    jm = load_jmdict_readings(find(src, 'jmdict', ['JMdict.xml', 'JMdict']))
    fu = load_furigana(find(src, 'furigana', ['JmdictFurigana.txt']))
    by_wr, by_w = load_meanings()
    cands = []
    for jid, (jp, jby) in jpn.items():
        if len(jp) > MAX_LEN or jid not in idx:
            continue
        ru_opts = [(r, rus[r]) for r in links.get(jid, []) if r in rus]
        if not ru_opts:
            continue
        # перевод с автором и покороче
        rid, (ru, rby) = sorted(ru_opts, key=lambda x: (x[1][1] is None, len(x[1][0])))[0]
        toks, pos, ok = [], 0, True
        for t in parse_bline(idx[jid]):
            # чтение: «#номер записи» → из JMdict; чтение, которого нет у леммы в JMdict, — заменяем
            r = t['r']
            if r.startswith('#'):
                r = (jm.get(r) or [''])[0]
            lemma_kanji = any(is_kanji(c) for c in t['l'])
            surf_kana = not any(is_kanji(c) for c in t['s'])
            if lemma_kanji:
                rs = jm.get(t['l'], [])
                if surf_kana and rs:
                    # слово написано каной: чтение — то, что совпадает с написанием (未だ → まだ, 珈琲 → コーヒー)
                    r = max(rs, key=lambda x: (common_prefix(kata2hira(x), kata2hira(t['s'])), x == r))
                elif rs and kata2hira(r) not in [kata2hira(x) for x in rs]:
                    r = rs[0]
            else:
                r = ''          # слово каной — чтение не нужно
            t['r'] = r
            mk = surface_markup(t, fu)
            if mk is None:
                ok = False
                break
            plain = strip_markup(mk)
            at = jp.find(plain, pos)
            if at < 0:
                ok = False
                break
            pos = at + len(plain)
            kana = t['r'] or t['l']
            mean = (by_wr.get((t['l'], t['r'])) or by_w.get(t['l']) or GRAMMAR.get(t['l'])
                    or GRAMMAR.get(kata2hira(kana)) or by_w.get(kana) or by_w.get(kata2hira(kana)) or '')
            # слово написано каной, а лемма — редкими кандзи (其の, 為る, 迚も): показываем кану
            lemma = t['l']
            if lemma_kanji and surf_kana:
                lemma = kana
            row = [mk, lemma if lemma != plain else '', t['r'] if (t['r'] and t['r'] != lemma) else '', mean]
            while row and not row[-1]:
                row.pop()
            toks.append(row)
        if not ok or not toks:
            continue
        cands.append({'ja': jid, 'ru_id': rid, 'jp': jp, 'ru': ru, 'by': [jby, rby], 't': toks})
    return cands

def read_review():
    path = os.path.join(HERE, 'review.tsv')
    rv = {}
    if os.path.exists(path):
        for line in open(path, encoding='utf-8'):
            p = line.rstrip('\n').split('\t')
            if len(p) >= 2 and p[0].isdigit():
                rv[int(p[0])] = p[1].strip()
    return rv

def sent_obj(c):
    return {'jp': c['jp'], 'ru': c['ru'], 'src': {'ja': c['ja'], 'ru': c['ru_id'], 'by': c['by']}, 't': c['t']}

def rank(c):
    # сначала примеры с указанными авторами (CC BY требует атрибуции), затем короче
    # и с большей долей слов, у которых есть русское значение
    known = sum(1 for t in c['t'] if len(t) >= 4)
    return (None in c['by'], len(c['jp']) - 3 * known / max(1, len(c['t'])), c['ja'])

def cmd_pool(src):
    cands = build_candidates(src)
    path = os.path.join(HERE, 'pool.tsv')
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write('ja_id\tjp\tru\n')
        for c in sorted(cands, key=lambda c: c['ja']):
            fh.write('%d\t%s\t%s\n' % (c['ja'], c['jp'], c['ru'].replace('\t', ' ')))
    print('candidates', len(cands), '->', path)

def cmd_apply(src):
    rv = read_review()
    cands = [c for c in build_candidates(src) if rv.get(c['ja']) == 'ok']
    cands.sort(key=rank)
    print('approved candidates', len(cands))
    # иероглифы: до 5 примеров со знаком
    by_char = {}
    for c in cands:
        for ch in set(c['jp']):
            if is_kanji(ch):
                lst = by_char.setdefault(ch, [])
                if len(lst) < KANJI_SENTS:
                    lst.append(c)
    n_k = 0
    for path in glob.glob(os.path.join(REPO, 'data', 'kanji', '*.json')):
        if path.endswith('index.json'):
            continue
        d = json.load(open(path, encoding='utf-8'))
        sel = by_char.get(d['k'], [])
        if sel:
            d['sents'] = [sent_obj(c) for c in sel]
            n_k += 1
        else:
            d.pop('sents', None)
        with open(path, 'w', encoding='utf-8') as fh:
            json.dump(d, fh, ensure_ascii=False, separators=(',', ':'))
    # словарь: до 3 примеров, где слово стоит леммой (а не просто совпало по написанию)
    wpath = os.path.join(REPO, 'data', 'dict', 'words.json')
    words = json.load(open(wpath, encoding='utf-8'))
    by_lemma = {}
    for c in cands:
        for t in c['t']:
            lemma = t[1] if len(t) > 1 and t[1] else strip_markup(t[0])
            lst = by_lemma.setdefault(lemma, [])
            if c not in lst:
                lst.append(c)
    sents, at, n_w = [], {}, 0
    for w in words:
        sel = by_lemma.get(w['w'], [])[:WORD_SENTS]
        if not sel:
            w.pop('s', None)
            continue
        ids = []
        for c in sel:
            if c['ja'] not in at:
                at[c['ja']] = len(sents)
                sents.append(sent_obj(c))
            ids.append(at[c['ja']])
        w['s'] = ids
        n_w += 1
    with open(wpath, 'w', encoding='utf-8') as fh:
        json.dump(words, fh, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(REPO, 'data', 'dict', 'sentences.json'), 'w', encoding='utf-8') as fh:
        json.dump(sents, fh, ensure_ascii=False, separators=(',', ':'))
    print('kanji with examples', n_k, '| words with examples', n_w, '| dict sentences', len(sents))

if __name__ == '__main__':
    if len(sys.argv) != 3 or sys.argv[1] not in ('pool', 'apply'):
        sys.exit(__doc__)
    {'pool': cmd_pool, 'apply': cmd_apply}[sys.argv[1]](sys.argv[2])
