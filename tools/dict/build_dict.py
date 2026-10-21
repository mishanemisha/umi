#!/usr/bin/env python3
"""Build the umi built-in dictionary (data/dict/words.json + sentences.json).

Python 3 stdlib only. Raw sources are NOT kept in the repo; download them into
a scratch directory (see data/dict/README.md) and pass it as the first argument:

    python3 -I tools/dict/build_dict.py /path/to/dict-src [--out data/dict]
           [--todo todo.tsv] [--size 6000]

Expected layout of the source directory (one subdirectory per archive):
    jmdict/JMdict.gz                  EDRDG, all languages (CC BY-SA 4.0)
    furigana/JmdictFurigana.txt       Doublevil/JmdictFurigana (CC BY-SA, as JMdict)
    jlpt/n1.csv .. n5.csv             stephenmk/yomitan-jlpt-vocab (CC BY-SA 4.0,
                                      based on J. Waller's lists, CC BY)
    tatoeba_jpn_detailed/jpn_sentences_detailed.tsv   Tatoeba (CC BY 2.0 FR),
    tatoeba_rus_detailed/rus_sentences_detailed.tsv   with author usernames
    tatoeba_links/jpn-rus_links.tsv
    tatoeba_indices/jpn_indices.csv

Downloaded files are treated as data only: the XML DOCTYPE is stripped and
entity references are replaced by their names before parsing (no DTD
processing, no entity expansion).

Russian meanings, in order of preference:
    1. js/data/words.js bank meaning (own, editorially reviewed text)
    2. tools/dict/ru_overrides.tsv  (id <TAB> meanings joined by "; ")
       -- translated from JMdict's English glosses during curation, flagged mt=1
JMdict's own Russian glosses (lang="rus") are deliberately NOT used: they come
mostly from Warodai (CC BY-NC-ND 3.0), which does not allow redistribution of
derived works. The parser does not even read them.
Entries without a Russian meaning are dropped and listed with --todo
(English glosses) so that they can be translated into ru_overrides.tsv.
"""
import bz2
import gzip
import json
import math
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import Counter, defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))

PRI_TAGS = {'news1', 'news2', 'ichi1', 'ichi2', 'spec1', 'spec2', 'gai1', 'gai2'}
BAD_KINF = {'iK', 'oK', 'rK', 'sK', 'io'}
BAD_RINF = {'ik', 'ok', 'rk', 'sk'}
DROP_MISC = {'arch', 'obs', 'rare', 'X', 'vulg', 'surname', 'place', 'given',
             'person', 'company', 'organization', 'product', 'work', 'station',
             'ship', 'unclass', 'group', 'serv', 'fict', 'myth', 'leg', 'dei',
             'creat', 'ev', 'obj', 'doc', 'char', 'oth'}
NAME_MISC = {'surname', 'place', 'given', 'person', 'company', 'organization',
             'product', 'work', 'station', 'ship', 'unclass', 'group', 'serv'}

# JMdict part-of-speech -> simplified code (documented in data/dict/README.md)
def simplify_pos(p):
    if p in ('n', 'n-adv', 'n-t'):
        return 'n'
    if p == 'n-pref':
        return 'pref'
    if p == 'n-suf':
        return 'suf'
    if p in ('pn', 'num', 'ctr', 'conj', 'int', 'prt', 'pref', 'suf', 'exp',
             'adv', 'vt', 'vi', 'vk', 'vs', 'adj-i', 'adj-na', 'adj-no', 'adj-pn'):
        return p
    if p == 'adv-to':
        return 'adv'
    if p == 'adj-ix':
        return 'adj-i'
    if p in ('adj-t', 'adj-f', 'adj-kari', 'adj-ku', 'adj-shiku', 'adj-nari'):
        return 'adj'
    if p in ('aux', 'aux-v', 'aux-adj', 'cop'):
        return 'aux'
    if p in ('v1', 'v1-s'):
        return 'v1'
    if p.startswith('v5'):
        return 'v5'
    if p in ('vs-i', 'vs-s', 'vz', 'vs-c'):
        return 'vs-i'
    if p in ('vr', 'vn', 'v-unspec') or p.startswith('v2') or p.startswith('v4'):
        return 'v'
    return None  # n-pr, unc ...

POS_ORDER = ['n', 'pn', 'num', 'ctr', 'v1', 'v5', 'vk', 'vs-i', 'v', 'vs', 'vt', 'vi',
             'adj-i', 'adj-na', 'adj-no', 'adj-pn', 'adj', 'adv', 'conj', 'int',
             'prt', 'aux', 'pref', 'suf', 'exp']

KANA_RE = re.compile(r'^[぀-ヿー　-〿！-～・ー〜～]+$')
KANJI_RE = re.compile(r'[㐀-䶿一-鿿豈-﫿々〆]')


def is_kanji(ch):
    return bool(KANJI_RE.match(ch))


def kata2hira(s):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


# ---------------------------------------------------------------- loaders
ENT_RE = re.compile(r'&([A-Za-z][\w.-]*);')
STD_ENT = {'amp', 'lt', 'gt', 'quot', 'apos'}


def _ent_sub(m):
    name = m.group(1)
    return m.group(0) if name in STD_ENT else name


def load_jmdict(path):
    """Parse JMdict(.gz) without DTD processing. Returns {seq: entry}."""
    opener = gzip.open if path.endswith('.gz') else open
    parser = ET.XMLPullParser(events=('end',))
    entries = {}
    in_doctype = False
    with opener(path, 'rt', encoding='utf-8') as fh:
        for line in fh:
            if not in_doctype and line.startswith('<!DOCTYPE'):
                in_doctype = True
            if in_doctype:
                if line.startswith(']>'):
                    in_doctype = False
                continue
            if '&' in line:
                line = ENT_RE.sub(_ent_sub, line)
            parser.feed(line)
            for _, el in parser.read_events():
                if el.tag == 'entry':
                    e = _entry(el)
                    entries[e['id']] = e
                    el.clear()
    return entries


def _entry(el):
    e = {'id': int(el.findtext('ent_seq')), 'k': [], 'r': [], 'sense': []}
    for k in el.findall('k_ele'):
        e['k'].append({'t': k.findtext('keb'),
                       'inf': [x.text for x in k.findall('ke_inf')],
                       'pri': [x.text for x in k.findall('ke_pri')]})
    for r in el.findall('r_ele'):
        e['r'].append({'t': r.findtext('reb'),
                       'nok': r.find('re_nokanji') is not None,
                       'restr': [x.text for x in r.findall('re_restr')],
                       'inf': [x.text for x in r.findall('re_inf')],
                       'pri': [x.text for x in r.findall('re_pri')]})
    pos = []
    for s in el.findall('sense'):
        glosses = s.findall('gloss')
        langs = {g.get('{http://www.w3.org/XML/1998/namespace}lang', 'eng') for g in glosses}
        if langs == {'eng'} or not glosses:
            p = [x.text for x in s.findall('pos')]
            if p:
                pos = p
            e['sense'].append({
                'pos': pos,
                'misc': [x.text for x in s.findall('misc')],
                'field': [x.text for x in s.findall('field')],
                'dial': [x.text for x in s.findall('dial')],
                'stagk': [x.text for x in s.findall('stagk')],
                'stagr': [x.text for x in s.findall('stagr')],
                'inf': [x.text for x in s.findall('s_inf')],
                'eng': [g.text for g in glosses if g.text],
            })
    return e


def load_furigana(path):
    """JmdictFurigana.txt: text|reading|0:かん;1:じ  -> {(text, reading): [(a,b,ruby)]}"""
    out = {}
    with open(path, encoding='utf-8-sig') as fh:
        for line in fh:
            parts = line.rstrip('\n').split('|')
            if len(parts) != 3:
                continue
            text, reading, spec = parts
            segs = []
            ok = True
            for item in spec.split(';'):
                if not item:
                    continue
                idx, _, ruby = item.partition(':')
                if '-' in idx:
                    a, _, b = idx.partition('-')
                else:
                    a = b = idx
                if not (a.isdigit() and b.isdigit()):
                    ok = False
                    break
                segs.append((int(a), int(b), ruby))
            if ok:
                out[(text, reading)] = segs
    return out


def load_jlpt(dirpath):
    """stephenmk/yomitan-jlpt-vocab original_data/n{1..5}.csv -> [(level, seq, kana, kanji)]"""
    import csv
    out = []
    for n in (1, 2, 3, 4, 5):
        p = os.path.join(dirpath, 'n%d.csv' % n)
        if not os.path.exists(p):
            continue
        with open(p, encoding='utf-8') as fh:
            for row in csv.DictReader(fh):
                try:
                    seq = int(row['jmdict_seq'])
                except (KeyError, ValueError):
                    continue
                out.append((n, seq, row.get('kana', '').strip(), row.get('kanji', '').strip()))
    return out


def resolve_jlpt(rows, entries, form_idx, tat_count):
    """Map Waller's (kana, kanji) rows to the main JMdict entry.

    The upstream mapping sometimes points kana-only rows (これ, それ, もし...) at
    minor interjection/particle entries; we re-resolve each row to the most
    frequent entry that is normally written that way. Easiest level wins."""
    out = {}

    def strength(c):
        e = entries[c]
        pris = [p for f in e['k'] + e['r'] for p in f['pri']]
        return (has_pri(pris), max([pri_score(f['pri']) for f in e['k'] + e['r']] or [0]),
                tat_count.get(c, 0))

    for n, seq, kana, kanji in rows:
        if kanji:
            cands = [c for c in form_idx.get(kanji, [])
                     if any(k['t'] == kanji for k in entries[c]['k'])
                     and (not kana or any(r['t'] == kana for r in entries[c]['r']))]
        else:
            cands = [c for c in form_idx.get(kana, [])
                     if any(r['t'] == kana for r in entries[c]['r'])
                     and (not good_kanji(entries[c]) or usually_kana(entries[c]))]
        if seq in entries and seq not in cands:
            cands.append(seq)
        if not cands:
            continue
        best = max(cands, key=lambda c: (strength(c), c == seq))
        out[best] = max(out.get(best, 0), n)
    return out


def load_bank(path):
    """js/data/words.js: BUILTIN_WORDS / ADDITIONAL_WORDS arrays of {w,r,m,k}."""
    if not os.path.exists(path):
        return []
    src = open(path, encoding='utf-8').read()
    out = []
    for name in ('BUILTIN_WORDS', 'ADDITIONAL_WORDS'):
        m = re.search(r'const %s\s*=\s*(\[.*?\]);' % name, src, re.S)
        if m:
            for w in json.loads(m.group(1)):
                out.append({'w': w['w'], 'r': w['r'], 'm': w.get('m', ''),
                            'k': [{'c': x['c'], 'r': x['r']} for x in w.get('k', [])]})
    return out


def load_overrides(path):
    out = {}
    if not os.path.exists(path):
        return out
    with open(path, encoding='utf-8') as fh:
        for n, line in enumerate(fh, 1):
            line = line.rstrip('\n')
            if not line or line.startswith('#'):
                continue
            parts = line.split('\t')
            if len(parts) < 2 or not parts[0].startswith('jm'):
                raise SystemExit('ru_overrides.tsv:%d: bad line %r' % (n, line))
            ms = [x.strip() for x in parts[1].split('; ') if x.strip()]
            # a lone "-" marks an entry reviewed and excluded as not useful
            out[int(parts[0][2:])] = None if ms == ['-'] else ms
    return out


def read_tsv(path, ncols):
    op = bz2.open if path.endswith('.bz2') else open
    with op(path, 'rt', encoding='utf-8') as fh:
        for line in fh:
            parts = line.rstrip('\n').split('\t')
            if len(parts) >= ncols:
                yield parts


def find(src, sub, names):
    for n in names:
        p = os.path.join(src, sub, n)
        if os.path.exists(p):
            return p
    raise SystemExit('missing source: %s/%s' % (sub, names[0]))


# ---------------------------------------------------------------- headword choice
def has_pri(lst):
    return any(p in PRI_TAGS or p.startswith('nf') for p in lst)


def nf_of(lst):
    for p in lst:
        if p.startswith('nf'):
            return int(p[2:])
    return None


def pri_score(lst):
    s = 1 if any(p.startswith('nf') for p in lst) else 0
    for p in lst:
        if p in ('news1', 'ichi1', 'spec1', 'gai1'):
            s += 2
        elif p in ('news2', 'ichi2', 'spec2', 'gai2'):
            s += 1
    return s


def good_kanji(e):
    return [k for k in e['k'] if not (set(k['inf']) & BAD_KINF)]


def readings_for(e, keb):
    out = []
    for r in e['r']:
        if r['nok'] and keb is not None:
            continue
        if keb is not None and r['restr'] and keb not in r['restr']:
            continue
        out.append(r)
    return out


FULLWIDTH_ALNUM = re.compile(r'[\uff10-\uff19\uff21-\uff3a\uff41-\uff5a0-9A-Za-z]')


def best_by_pri(items):
    # stable: keeps JMdict order on ties (JMdict lists the most common form first)
    return max(enumerate(items), key=lambda t: (not FULLWIDTH_ALNUM.search(t[1]['t']),
                                                pri_score(t[1]['pri']), -t[0]))[1]


def usually_kana(e):
    live = [s for s in e['sense'] if not (set(s['misc']) & {'arch', 'obs'})] or e['sense']
    return bool(live) and 'uk' in live[0]['misc']


def choose_forms(e):
    """-> (w, r) most common written form and reading."""
    ks = good_kanji(e)
    if ks and not usually_kana(e):
        k = best_by_pri(ks)
        rs = [r for r in readings_for(e, k['t']) if not (set(r['inf']) & BAD_RINF)] \
            or readings_for(e, k['t']) or e['r']
        return k['t'], best_by_pri(rs)['t']
    rs = [r for r in e['r'] if not (set(r['inf']) & BAD_RINF)] or e['r']
    r = best_by_pri(rs)['t']
    return r, r


# ---------------------------------------------------------------- Russian glosses
# ---------------------------------------------------------------- tatoeba
IDX_TOK = re.compile(r'^(?P<hw>[^(\[{~|]+)(?:\((?P<rd>[^)]*)\))?(?:\[(?P<sn>\d+)\])?(?:\{(?P<sf>[^}]*)\})?(?P<chk>~)?$')


def build_form_index(entries):
    idx = defaultdict(list)
    for e in entries.values():
        for k in e['k']:
            idx[k['t']].append(e['id'])
        for r in e['r']:
            idx[r['t']].append(e['id'])
    return idx


def resolve_token(tok, entries, form_idx, cache):
    if tok in cache:
        return cache[tok]
    m = IDX_TOK.match(tok)
    res = None
    if m:
        hw, rd = m.group('hw'), m.group('rd')
        if rd and rd.startswith('#') and rd[1:].isdigit():
            seq = int(rd[1:])
            res = seq if seq in entries else None
            cache[tok] = res
            return res
        cands = form_idx.get(hw, [])
        if cands and KANA_RE.match(hw) and not rd:
            # a kana headword means the word is normally written in kana
            c2 = [c for c in cands
                  if not good_kanji(entries[c]) or usually_kana(entries[c])
                  or any(r['t'] == hw and r['nok'] for r in entries[c]['r'])]
            cands = c2 or cands
        if rd:
            rdh = kata2hira(rd)
            c2 = [c for c in cands if any(kata2hira(r['t']) == rdh for r in entries[c]['r'])]
            cands = c2 or cands
        if len(cands) > 1:
            # prefer entries where hw is a main (prioritised) form
            def key(c):
                e = entries[c]
                forms = e['k'] + e['r']
                hit = [f for f in forms if f['t'] == hw]
                return (has_pri(sum((f['pri'] for f in hit), [])),
                        has_pri(sum((f['pri'] for f in forms), [])), -c)
            cands = sorted(cands, key=key, reverse=True)
        if cands:
            res = cands[0]
    cache[tok] = res
    return res


# ---------------------------------------------------------------- main build
def main(argv):
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument('src')
    ap.add_argument('--out', default=os.path.join(REPO, 'data', 'dict'))
    ap.add_argument('--size', type=int, default=6000)
    ap.add_argument('--todo', help='write entries lacking Russian (TSV with English glosses)')
    ap.add_argument('--audit', help='write all selected entries with their Russian (TSV) for review')
    a = ap.parse_args(argv)

    log = lambda *x: print(*x, file=sys.stderr)
    entries = load_jmdict(find(a.src, 'jmdict', ['JMdict.gz', 'JMdict.xml', 'JMdict']))
    log('jmdict entries', len(entries))
    furi = load_furigana(find(a.src, 'furigana', ['JmdictFurigana.txt']))
    jlpt_rows = load_jlpt(os.path.join(a.src, 'jlpt'))
    bank = load_bank(os.path.join(REPO, 'js', 'data', 'words.js'))
    overrides = load_overrides(os.path.join(HERE, 'ru_overrides.tsv'))
    log('furigana', len(furi), 'jlpt rows', len(jlpt_rows), 'bank', len(bank), 'overrides', len(overrides))

    # ---- tatoeba
    jpn, jpn_by = {}, {}
    for p in read_tsv(find(a.src, 'tatoeba_jpn_detailed', ['jpn_sentences_detailed.tsv', 'jpn_sentences_detailed.tsv.bz2']), 4):
        jpn[int(p[0])] = p[2]
        jpn_by[int(p[0])] = None if p[3] in ('\\N', '') else p[3]
    links = defaultdict(list)
    for p in read_tsv(find(a.src, 'tatoeba_links', ['jpn-rus_links.tsv', 'jpn-rus_links.tsv.bz2']), 2):
        links[int(p[0])].append(int(p[1]))
    need_rus = {r for v in links.values() for r in v}
    rus, rus_by = {}, {}
    for p in read_tsv(find(a.src, 'tatoeba_rus_detailed', ['rus_sentences_detailed.tsv', 'rus_sentences_detailed.tsv.bz2']), 4):
        i = int(p[0])
        if i in need_rus:
            rus[i] = p[2]
            rus_by[i] = None if p[3] in ('\\N', '') else p[3]
    form_idx = build_form_index(entries)
    cache = {}
    sent_words = {}           # jpn id -> set(seq)   (Tanaka/Tatoeba indices)
    tat_count = Counter()     # seq -> occurrences in indexed sentences
    for p in read_tsv(find(a.src, 'tatoeba_indices', ['jpn_indices.csv']), 3):
        sid = int(p[0])
        seqs = set()
        for tok in p[2].split():
            seq = resolve_token(tok, entries, form_idx, cache)
            if seq is not None:
                seqs.add(seq)
        for s in seqs:
            tat_count[s] += 1
        sent_words[sid] = seqs
    log('tatoeba jpn', len(jpn), 'jpn-rus linked', len(links), 'indexed', len(sent_words))
    jlpt = resolve_jlpt(jlpt_rows, entries, form_idx, tat_count)
    log('jlpt entries', len(jlpt))

    # ---- bank -> JMdict entries
    bank_map = {}   # seq -> bank item
    bank_missing = []
    for b in bank:
        cands = [c for c in form_idx.get(b['w'], [])
                 if any(r['t'] == b['r'] for r in entries[c]['r'])]
        if not cands:
            bank_missing.append(b)
            continue
        cands.sort(key=lambda c: (-has_pri(sum((x['pri'] for x in entries[c]['k'] + entries[c]['r']), [])), c))
        bank_map.setdefault(cands[0], b)
    log('bank matched', len(bank_map), 'bank missing', len(bank_missing))

    # ---- candidates & ranking
    def entry_ok(e):
        live = [s for s in e['sense'] if not (set(s['misc']) & DROP_MISC)]
        if not live:
            return False
        pos = {p for s in live for p in s['pos']}
        if pos and pos <= {'n-pr', 'unc'}:
            return False
        return True

    ranked = []
    for e in entries.values():
        seq = e['id']
        pris = [p for f in e['k'] + e['r'] for p in f['pri']]
        forced = seq in bank_map or (jlpt.get(seq, 0) >= 4 and (has_pri(pris) or tat_count.get(seq, 0) >= 5))
        if not (has_pri(pris) or seq in jlpt or forced):
            continue
        if seq in overrides and overrides[seq] is None and seq not in bank_map:
            continue
        if not forced and not entry_ok(e):
            continue
        nfs = [nf_of(f['pri']) for f in e['k'] + e['r'] if nf_of(f['pri'])]
        nf = min(nfs) if nfs else None
        ps = max([pri_score(f['pri']) for f in e['k'] + e['r']] or [0])
        tc = tat_count.get(seq, 0)
        # estimated frequency rank from each signal (lower = more frequent)
        est = []
        if nf:
            est.append((nf - 0.5) * 500)
        if tc:
            est.append(60000.0 / (tc + 1) ** 0.85)
        if not est:
            est.append(30000.0)
        r = math.exp(sum(math.log(x) for x in est) / len(est))
        if not nf:
            r *= 1.6 if ps >= 2 else 2.5
        if tc == 0 and not jlpt.get(seq):
            r *= 3.5      # newspaper-only vocabulary (politics, sports reports...)
        elif tc == 0:
            r *= 1.5
        first = next((x for x in e['sense'] if not (set(x['misc']) & DROP_MISC)), None)
        if first and first['field']:
            r *= 2.0      # specialist term (baseball, Buddhism, law...)
        lv = jlpt.get(seq)
        if lv:
            r /= {5: 6.0, 4: 4.0, 3: 2.5, 2: 1.6, 1: 1.15}[lv]
        if seq in bank_map:
            r /= 1.3
        ranked.append((r, seq, forced))
    ranked.sort()
    nforced = sum(1 for r, s, f in ranked if f)
    room = a.size - nforced
    chosen = []
    for r, s, f in ranked:
        if f:
            chosen.append(s)
        elif room > 0:
            chosen.append(s)
            room -= 1
    log('selected', len(chosen), 'forced', nforced)

    # ---- build word records
    words = []
    todo = []
    stats = Counter()
    for seq in chosen:
        e = entries[seq]
        b = bank_map.get(seq)
        if b:
            w, r = b['w'], b['r']
        else:
            w, r = choose_forms(e)
        # senses applicable to the chosen form
        live = [s for s in e['sense']
                if not (set(s['misc']) & DROP_MISC)
                and (not s['stagk'] or w in s['stagk'])
                and (not s['stagr'] or r in s['stagr'])] or e['sense'][:1]
        pos = []
        for s in live[:4]:
            for p in s['pos']:
                c = simplify_pos(p)
                if c and c not in pos:
                    pos.append(c)
        pos.sort(key=POS_ORDER.index)
        if b and b['m']:
            m, mt, src = [x.strip() for x in b['m'].split(';') if x.strip()], 0, 'bank'
        elif seq in overrides:
            m, mt, src = overrides[seq], 1, 'mt'
        else:
            m, mt, src = [], 0, 'none'
        stats[src] += 1
        rec = {'id': 'jm%d' % seq, 'w': w, 'r': r, 'm': m, 'pos': pos}
        if seq in jlpt:
            rec['jlpt'] = jlpt[seq]
        if b and b['k']:
            rec['k'] = b['k']
        elif w != r:
            segs = furi.get((w, r))
            if segs and all(a_ == b_ for a_, b_, _ in segs) \
                    and all(is_kanji(w[a_]) for a_, _, _ in segs) \
                    and sum(1 for ch in w if is_kanji(ch)) == len(segs):
                rec['k'] = [{'c': w[a_], 'r': ru} for a_, _, ru in segs]
        if mt:
            rec['mt'] = 1
        words.append(rec)
        if src in ('none', 'mt') and (a.todo or a.audit):
            eng = ' | '.join(
                ('{%s} ' % ','.join(x['misc']) if x['misc'] else '') +
                ('[%s] ' % '; '.join(x['inf']) if x['inf'] else '') + '; '.join(x['eng'])
                for x in live[:5])
            todo.append((src, rec, eng, ''))
    log('meaning sources', dict(stats))

    if a.todo:
        with open(a.todo, 'w', encoding='utf-8') as fh:
            for src, rec, eng, rus_raw in todo:
                if src == 'none':
                    fh.write('\t'.join([rec['id'], rec['w'], rec['r'], ','.join(rec['pos']), eng]) + '\n')
    if a.audit:
        with open(a.audit, 'w', encoding='utf-8') as fh:
            for src, rec, eng, rus_raw in todo:
                fh.write('\t'.join([rec['id'], rec['w'], rec['r'], ','.join(rec['pos']), src,
                                    ' / '.join(rec['m']), eng, rus_raw]) + '\n')

    words = [w for w in words if w['m']]
    for w in words:
        w['_seq'] = int(w['id'][2:])
    # bank words that are not JMdict entries (simple numeral/compound phrases):
    # kept so the built-in bank is fully covered; id "umi:<word>", pos n
    for i, b in enumerate(bank_missing):
        rec = {'id': 'umi:' + b['w'], 'w': b['w'], 'r': b['r'],
               'm': [x.strip() for x in b['m'].split(';') if x.strip()], 'pos': ['n']}
        if b['k']:
            rec['k'] = b['k']
        rec['_seq'] = -1 - i
        words.append(rec)
    for i, w in enumerate(words, 1):
        w['f'] = i

    # ---- sentences
    word_rank = {w['_seq']: w['f'] for w in words}
    nwords = len(words)
    cand = defaultdict(list)   # seq -> [(score, jid)]
    matcher = SurfaceMatcher(words)
    n_fallback = 0
    for jid, rids in links.items():
        jp = jpn.get(jid)
        if not jp or len(jp) > 30:
            continue
        seqs = sent_words.get(jid)
        penalty = 1.0
        if not seqs:
            # sentence not in the Tatoeba word index: conservative surface match
            seqs = matcher.match(jp)
            penalty = 1.35
            if not seqs:
                continue
            n_fallback += 1
        ranks = [word_rank.get(s, nwords * 3) for s in seqs]
        # sentences made of common words first; penalise unknown words strongly
        if jpn_by.get(jid) is None:
            penalty *= 1.5   # orphan sentence: no author to credit
        score = (sum(ranks) / len(ranks) + max(ranks) / 4 + len(jp) * 20) * penalty
        for s in seqs:
            if s in word_rank:
                cand[s].append((score, jid))
    log('sentences matched by surface fallback', n_fallback)
    sentences = []
    sidx = {}
    for w in words:
        seq = w['_seq']
        picks = []
        for score, jid in sorted(cand.get(seq, [])):
            if jp_dupe(jpn[jid], [jpn[x] for x in picks]):
                continue
            picks.append(jid)
            if len(picks) == 3:
                break
        if not picks:
            continue
        ss = []
        for jid in picks:
            if jid not in sidx:
                rid = choose_rus(links[jid], rus, rus_by)
                if rid is None:
                    continue
                sidx[jid] = len(sentences)
                sentences.append({'jp': jpn[jid], 'ru': rus[rid],
                                  'src': {'ja': jid, 'ru': rid, 'by': [jpn_by.get(jid), rus_by.get(rid)]}})
            ss.append(sidx[jid])
        if ss:
            w['s'] = ss

    for w in words:
        del w['_seq']
    os.makedirs(a.out, exist_ok=True)
    with open(os.path.join(a.out, 'words.json'), 'w', encoding='utf-8') as fh:
        json.dump(words, fh, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(a.out, 'sentences.json'), 'w', encoding='utf-8') as fh:
        json.dump(sentences, fh, ensure_ascii=False, separators=(',', ':'))
    st = {
        'words': len(words),
        'mt': sum(1 for w in words if w.get('mt')),
        'with_sentences': sum(1 for w in words if w.get('s')),
        'sentences': len(sentences),
        'with_k': sum(1 for w in words if w.get('k')),
        'with_jlpt': sum(1 for w in words if w.get('jlpt')),
        'bank_missing': [b['w'] for b in bank_missing],
        'dropped_no_meaning': stats['none'],
    }
    log(json.dumps(st, ensure_ascii=False))


V5_ROWS = {'う': 'わいうえおっ', 'く': 'かきくけこい', 'ぐ': 'がぎぐげごい', 'す': 'さしすせそ',
           'つ': 'たちつてとっ', 'ぬ': 'なにぬねのん', 'ぶ': 'ばびぶべぼん', 'む': 'まみむめもん',
           'る': 'らりるれろっ'}
V1_NEXT = set('るなたてまれろよさらずぬんようか')
ADJ_NEXT = set('いくかけさすそき')
SURU_NEXT = set('しさすせ')


class SurfaceMatcher:
    """Find selected words in an un-indexed sentence.

    Only words containing kanji are matched (kana words are too ambiguous).
    Verb/adjective stems must be followed by a plausible inflection kana;
    noun-like words must not be glued to neighbouring kanji. Matches contained
    in a longer match are discarded."""

    def __init__(self, words):
        self.pats = defaultdict(list)   # first char -> [(stem, next_set|None, seq)]
        for w in words:
            t, pos = w['w'], set(w['pos'])
            if not KANJI_RE.search(t):
                continue
            nxt = None
            stem = t
            if pos & {'v5'} and t[-1] in V5_ROWS:
                stem, nxt = t[:-1], set(V5_ROWS[t[-1]])
            elif pos & {'v1'} and t.endswith('る'):
                stem, nxt = t[:-1], V1_NEXT
            elif pos & {'adj-i'} and t.endswith('い'):
                stem, nxt = t[:-1], ADJ_NEXT
            elif pos & {'vs-i'} and t.endswith('する'):
                stem, nxt = t[:-2], SURU_NEXT
            elif pos & {'vk'}:
                stem, nxt = t[:-1], V1_NEXT | set('い')
            if not stem or not KANJI_RE.search(stem):
                continue
            self.pats[stem[0]].append((stem, nxt, w['_seq']))
        # the same stem shared by several selected words (中 なか/ちゅう,
        # 方 ほう/かた ...) cannot be disambiguated without an index: drop it
        for ch, lst in self.pats.items():
            cnt = Counter(st for st, _, _ in lst)
            self.pats[ch] = [x for x in lst if cnt[x[0]] == 1]

    def match(self, s):
        spans = []
        for i, ch in enumerate(s):
            for stem, nxt, seq in self.pats.get(ch, ()):
                if not s.startswith(stem, i):
                    continue
                j = i + len(stem)
                if i > 0 and is_kanji(s[i - 1]):
                    continue
                if nxt is None:
                    if j < len(s) and is_kanji(s[j]):
                        continue
                    end = j
                else:
                    if j >= len(s) or s[j] not in nxt:
                        continue
                    end = j + 1
                spans.append((i, end, seq))
        out = set()
        for a_, b_, seq in spans:
            if not any(a2 <= a_ and b_ <= b2 and (b2 - a2) > (b_ - a_) for a2, b2, _ in spans):
                out.add(seq)
        return out


def jp_dupe(s, others):
    core = re.sub(r'[。、！？!?.,\s]', '', s)
    for o in others:
        oc = re.sub(r'[。、！？!?.,\s]', '', o)
        if core == oc or (len(core) > 4 and (core in oc or oc in core)):
            return True
    return False


def choose_rus(rids, rus, rus_by):
    opts = [r for r in rids if r in rus]
    if not opts:
        return None
    # owned (attributable) translations first, then the oldest one
    return min(opts, key=lambda r: (rus_by.get(r) is None, r))


if __name__ == '__main__':
    main(sys.argv[1:])
