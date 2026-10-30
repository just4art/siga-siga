"""Build data/dict.js from the Wiktionary (kaikki.org) Greek extract + a frequency list.

Output (window.GR_DICT):
  L: lemma lines "word|pos|gender|gloss", sorted by corpus frequency (index = rank)
  F: form lines "form|i,j" mapping inflected forms to lemma indices
  C: {lemmaIndex: "present|past|imperfect|future"} conjugation tables (6 persons each, comma-joined)
"""
import gzip, json, re, csv, sys, os, unicodedata, collections

import urllib.request
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CSV = os.path.join(ROOT, '..', 'A2_exam', 'words.csv')
OUT = os.path.join(ROOT, 'data', 'dict.js')
# Source data (~26 MB) is cached outside the project.
HERE = os.path.expanduser('~/.cache/sigasiga')
os.makedirs(HERE, exist_ok=True)
for name, url in [('kaikki-el.jsonl.gz', 'https://kaikki.org/dictionary/Greek/kaikki.org-dictionary-Greek.jsonl.gz'),
                  ('el_50k.txt', 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/el/el_50k.txt')]:
    if not os.path.exists(os.path.join(HERE, name)):
        print('downloading', url)
        urllib.request.urlretrieve(url, os.path.join(HERE, name))
KEEP_TOP = 20000
EXTRA = set()  # lemmas used in the graded texts
texts_dir = os.path.join(ROOT, 'texts')
if os.path.isdir(texts_dir):
    for fn in os.listdir(texts_dir):
        if fn.endswith('.json'):
            for n in json.load(open(os.path.join(texts_dir, fn), encoding='utf-8')).get('notes', []):
                EXTRA.add(n['lemma'].lower())

POS = {'noun': 'n', 'verb': 'v', 'adj': 'a', 'adv': 'd', 'pron': 'p', 'conj': 'c', 'prep': 'r',
       'intj': 'i', 'phrase': 'x', 'name': 'm', 'num': 'u', 'det': 't', 'article': 't', 'particle': 'k',
       'contraction': 'k', 'proverb': 'x'}
GREEK = re.compile(r"^[Ͱ-Ͽἀ-῿']+$")
SKIP_SENSE = {'obsolete', 'archaic', 'dated', 'dialectal', 'rare', 'Ancient-Greek', 'Katharevousa',
              'Byzantine', 'historical', 'slang', 'vulgar', 'Cypriot', 'Cretan', 'Pontic'}


def strip_acc(s):
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def plausible_form(f, w):
    # Wiktionary tables sometimes leak articles or bare endings ("του", "ους") as forms.
    if f == w:
        return True
    if len(f) <= 2:
        return False
    a, b = strip_acc(f), strip_acc(w)
    return a[0] == b[0] or len(f) >= 4


def clean_gloss(g):
    g = re.sub(r'\s*\([^()]*\)', '', g)
    g = re.sub(r'\s*\([^()]*\)', '', g)
    g = re.sub(r'\s+', ' ', g).strip(' ;:,.')
    return g


freq = {}
for line in open(os.path.join(HERE, 'el_50k.txt'), encoding='utf-8'):
    w, c = line.split()
    freq[w] = int(c)

csv_lemmas = set()
for r in csv.DictReader(open(CSV, encoding='utf-8')):
    g = re.sub(r'^(ο/η|ο|η|το|οι|τα)\s+', '', r['greek'].strip()).lower()
    if ' ' not in g:
        csv_lemmas.add(g)

lemmas = {}          # (word,pos) -> dict
formof = collections.defaultdict(set)   # form -> base words
for line in gzip.open(os.path.join(HERE, 'kaikki-el.jsonl.gz'), 'rt', encoding='utf-8'):
    e = json.loads(line)
    w = e.get('word', '')
    pos = POS.get(e.get('pos'))
    if not pos or not w:
        continue
    senses = e.get('senses', [])
    fo = [s for s in senses if 'form_of' in s or 'alt_of' in s]
    if fo and len(fo) == len(senses):
        for s in fo:
            for b in s.get('form_of', []) + s.get('alt_of', []):
                bw = b.get('word', '').strip()
                if bw and bw != w:
                    formof[w.lower()].add(bw.lower())
        continue
    glosses = []
    for s in senses:
        if 'form_of' in s or 'alt_of' in s:
            continue
        tags = set(s.get('tags', []))
        if tags & SKIP_SENSE and glosses:
            continue
        for g in s.get('glosses', [])[:1]:
            g = clean_gloss(g)
            if g and g not in glosses and re.search('[A-Za-z]', g):
                glosses.append(g)
        if len(glosses) >= 3:
            break
    if not glosses:
        continue
    gloss = glosses[0]
    if len(gloss) > 90:
        gloss = gloss[:88].rsplit(' ', 1)[0] + '…'
    for g in glosses[1:]:
        if len(gloss) + len(g) + 2 > 70:
            break
        gloss += '; ' + g
    gender = ''
    if pos == 'n':
        tags = set(t for s in senses for t in s.get('tags', []))
        for ht in e.get('head_templates', []):
            gg = ht.get('args', {}).get('g', '') or ht.get('args', {}).get('1', '')
            if gg in ('m', 'f', 'n', 'm-p', 'f-p', 'n-p'):
                gender = gg[0]
                break
        if not gender:
            gender = 'm' if 'masculine' in tags else 'f' if 'feminine' in tags else 'n' if 'neuter' in tags else ''
    forms, conj = set(), {}
    for f in e.get('forms', []):
        ft = f.get('form', '').strip()
        tags = f.get('tags', [])
        if 'romanization' in tags or 'table-tags' in tags or 'inflection-template' in tags:
            continue
        ft = re.sub(r'^(θα|να|ας)\s+', '', ft)
        if GREEK.match(ft) and plausible_form(ft.lower(), w.lower()):
            forms.add(ft.lower())
        if pos == 'v' and 'rare' not in tags:
            person = next((p for p in ('first-person', 'second-person', 'third-person') if p in tags), None)
            num = 'plural' if 'plural' in tags else 'singular' if 'singular' in tags else None
            if not person or not num or 'indicative' not in tags:
                continue
            slot = None
            if 'present' in tags and 'imperfective' in tags and 'future' not in tags:
                slot = 'pres'
            elif 'past' in tags and 'perfective' in tags:
                slot = 'past'
            elif 'imperfect' in tags:
                slot = 'impf'
            elif 'dependent' in tags and 'perfective' in tags:
                slot = 'fut'
            if slot:
                i = ('first-person', 'second-person', 'third-person').index(person) + (3 if num == 'plural' else 0)
                conj.setdefault(slot, [''] * 6)
                if not conj[slot][i]:
                    form = re.split(r'[\s(²³¹,]', f['form'].strip())[0]
                    conj[slot][i] = ('θα ' if slot == 'fut' else '') + form
    key = (w, pos)
    if key in lemmas:
        lemmas[key]['forms'] |= forms
        continue
    lemmas[key] = dict(word=w, pos=pos, g=gender, gloss=gloss, forms=forms, conj=conj)

# Frequency score per lemma: the lemma's own count plus its inflected forms' counts,
# with each form's count split between all lemmas that share it.
owners = collections.Counter()
for L in lemmas.values():
    for f in L['forms'] | {L['word'].lower()}:
        owners[f] += 1
for L in lemmas.values():
    lw = L['word'].lower()
    L['score'] = sum(freq.get(f, 0) / owners[f] for f in L['forms'] | {lw})
    if L['pos'] == 'n' and freq.get(lw, 0) < 50:
        L['score'] *= 0.1   # a noun whose base form is almost never seen is ranked high only by shared forms
    if L['word'].isupper() and len(L['word']) > 1:
        L['score'] *= 0.01
items = sorted(lemmas.values(), key=lambda L: -L['score'])
keep = []
for rank, L in enumerate(items):
    lw = L['word'].lower()
    if rank < KEEP_TOP or lw in csv_lemmas or lw in EXTRA:
        if L['pos'] == 'm' and L['score'] == 0:
            continue
        keep.append(L)
index = {}
lines, conj_out = [], {}
for i, L in enumerate(keep):
    lines.append('|'.join([L['word'], L['pos'], L['g'], L['gloss'].replace('|', '/').replace('\n', ' ')]))
    index.setdefault(L['word'].lower(), []).append(i)
    if L['pos'] == 'v' and L['word'].lower() in csv_lemmas and L['conj']:
        c = L['conj']
        if all(s in c and all(c[s]) for s in ('pres', 'past', 'fut')):
            conj_out[i] = '|'.join(','.join(c.get(s, [''] * 6)) for s in ('pres', 'past', 'impf', 'fut'))
fmap = collections.defaultdict(list)
for i, L in enumerate(keep):
    full = L['word'].lower() in csv_lemmas or L['word'].lower() in EXTRA or i < 3000
    for f in L['forms']:
        if f == L['word'].lower():
            continue
        if full or f in freq:
            if i not in fmap[f]:
                fmap[f].append(i)
flines = [f + '|' + ','.join(map(str, v)) for f, v in fmap.items()]
data = {'L': '\n'.join(lines), 'F': '\n'.join(flines), 'C': conj_out}
js = ('/* Greek-English dictionary for the practice app.\n'
      '   Source: Wiktionary via kaikki.org (CC BY-SA 4.0); frequency ranks from the\n'
      '   OpenSubtitles 2018 list by Hermit Dave (FrequencyWords, CC BY-SA 4.0).\n'
      '   Generated by build_dict.py: do not edit by hand. */\n'
      'window.GR_DICT=' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
open(OUT, 'w', encoding='utf-8').write(js)
missing = sorted(l for l in csv_lemmas if l not in index)
print('lemmas', len(keep), 'forms', len(flines), 'conj', len(conj_out), 'bytes', len(js.encode()))
print('csv lemmas not in dict', len(missing), missing[:60])
