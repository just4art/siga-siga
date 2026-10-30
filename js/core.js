/* Σιγά σιγά: core (state, words, dictionary lookup, spaced repetition, CSV sync, speech). */
'use strict';
var App = window.App = {};
var DAY = 86400000;

/* ---------------- small utils ---------------- */
function $(s, r) { return (r || document).querySelector(s); }
function $$(s, r) { return [].slice.call((r || document).querySelectorAll(s)); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]; }); }
function h(tag, attrs, html) {
  var e = document.createElement(tag);
  for (var k in attrs || {}) { if (k === 'class') e.className = attrs[k]; else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]); else e.setAttribute(k, attrs[k]); }
  if (html != null) e.innerHTML = html;
  return e;
}
function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function todayKey(t) { var d = t ? new Date(t) : new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function dayStart(t) { var d = t ? new Date(t) : new Date(); d.setHours(4, 0, 0, 0); if ((t || Date.now()) < d.getTime()) d.setDate(d.getDate() - 1); return d.getTime(); }
/* A study "day" rolls over at 4am, like Anki, so late-night sessions count for the evening before. */
function studyDay(t) { return todayKey(dayStart(t)); }
function stripAcc(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC'); }
function fold(s) { return stripAcc(String(s).toLowerCase()).replace(/ς/g, 'σ'); }
function fmtIvl(days) {
  if (days < 1 / 24) return Math.max(1, Math.round(days * 1440)) + 'm';
  if (days < 1) return Math.round(days * 24) + 'h';
  if (days < 30) return Math.round(days) + 'd';
  if (days < 365) return (days / 30).toFixed(days < 60 ? 1 : 0).replace('.0', '') + 'mo';
  return (days / 365).toFixed(1).replace('.0', '') + 'y';
}
App.u = {$: $, $$: $$, esc: esc, h: h, shuffle: shuffle, pick: pick, todayKey: todayKey, studyDay: studyDay, stripAcc: stripAcc, fold: fold, fmtIvl: fmtIvl};

function toast(msg) {
  var t = h('div', {class: 'toast'}, esc(msg));
  $('#toasts').appendChild(t);
  setTimeout(function () { t.remove(); }, 2700);
}
App.toast = toast;

/* ---------------- persistent state ---------------- */
var KEY = 'sigasiga-v1';
var S = {
  cards: {},      // greek -> {st:'new'|'learn'|'review', due, ivl, ease, reps, lapses, step, seen}
  added: [],      // words added in the app: {greek, english, part_of_speech, lesson_date, ctx, src, synced}
  edits: {},      // greek -> english (edited in app)
  log: {},        // day -> {rev, nw, ok, read, games, added, xp}
  xp: 0,
  texts: {},      // text id -> {done, quiz, at}
  myTexts: [],    // imported texts {id, title, body, at}
  games: {},      // game id -> best score
  csvText: null,  // last words.csv content read from disk
  csvSaved: 0,
  csvAt: 0,       // when csvText last changed (used when syncing devices)
  gone: {},       // deletions to carry over when syncing: 'c:'|'w:'|'t:' + key -> time
  settings: {newPerDay: 10, typing: false, rate: 0.9, autoplay: true, order: 'freq', reverse: true}
};
try {
  var saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if (saved) for (var k in saved) { if (k === 'settings') Object.assign(S.settings, saved.settings); else S[k] = saved[k]; }
} catch (e) { console.warn('state load failed', e); }
App.S = S;
var saveTimer = null;
App.save = function () {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save progress: ' + e.message); }
  }, 150);
};
window.addEventListener('beforeunload', function () { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} });

App.day = function (d) {
  d = d || studyDay();
  return S.log[d] || (S.log[d] = {rev: 0, nw: 0, ok: 0, read: 0, games: 0, added: 0, xp: 0});
};
var LEVELS = ['Άλφα', 'Βήτα', 'Γάμμα', 'Δέλτα', 'Έψιλον', 'Ζήτα', 'Ήτα', 'Θήτα', 'Ιώτα', 'Κάππα', 'Λάμδα', 'Μι', 'Νι', 'Ξι', 'Όμικρον', 'Πι', 'Ρο', 'Σίγμα', 'Ταυ', 'Ύψιλον', 'Φι', 'Χι', 'Ψι', 'Ωμέγα'];
App.level = function (xp) {
  xp = xp == null ? S.xp : xp;
  var n = 0; while (n < LEVELS.length - 1 && xp >= 50 * (n + 1) * (n + 2)) n++;
  var lo = 50 * n * (n + 1), hi = 50 * (n + 1) * (n + 2);
  return {n: n, name: LEVELS[n], lo: lo, hi: hi, frac: Math.min(1, (xp - lo) / (hi - lo))};
};
App.addXP = function (n, why) {
  if (!n) return;
  var before = App.level().n;
  S.xp += n; App.day().xp += n; App.save();
  var after = App.level();
  if (after.n > before) toast('Level up: ' + after.name + '!');
  App.renderHud();
};

/* streak: a day counts when reviews are finished or a text is read */
App.dayCounts = function (d) { var l = S.log[d]; return !!l && (l.done || l.read > 0); };
App.streak = function () {
  var n = 0, t = dayStart();
  if (!App.dayCounts(todayKey(t))) t -= DAY;   // today not done yet: streak still alive from yesterday
  while (App.dayCounts(todayKey(t))) { n++; t -= DAY; }
  return n;
};

/* ---------------- CSV ---------------- */
function parseCSV(text) {
  var rows = [], row = [], f = '', q = false;
  for (var i = 0; i < text.length; i++) {
    var c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  var head = rows.shift() || [];
  return rows.filter(function (r) { return r.length > 1 || r[0]; }).map(function (r) {
    var o = {}; head.forEach(function (k, i) { o[k.trim()] = (r[i] || '').trim(); }); return o;
  });
}
function csvCell(v) { v = String(v == null ? '' : v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
App.parseCSV = parseCSV;

/* ---------------- the word list ---------------- */
var ART = /^(ο\/η|η\/ο|ο|η|το|οι|τα)\s+/;
function keyOf(greek) { return greek.trim().replace(ART, '').toLowerCase(); }
function genderOf(greek) {
  var m = greek.trim().match(ART); if (!m) return '';
  return {'ο': 'm', 'η': 'f', 'το': 'n', 'οι': 'p', 'τα': 'n'}[m[1]] || 'c';
}
App.keyOf = keyOf; App.genderOf = genderOf;

App.words = [];      // merged list: {greek, english, pos, date, added?, ctx?}
App.byGreek = {};
App.rebuildWords = function () {
  var base = parseCSV(S.csvText || window.GR_WORDS_CSV || 'greek,english,part_of_speech,lesson_date\n');
  var list = [], seen = {};
  function push(w, added) {
    var g = (w.greek || '').trim(); if (!g || seen[g]) return;
    seen[g] = 1;
    list.push({greek: g, english: S.edits[g] || w.english || '', pos: w.part_of_speech || '', date: w.lesson_date || '', added: !!added, ctx: w.ctx || null, src: w.src || null});
  }
  base.forEach(function (w) { push(w, false); });
  S.added.forEach(function (w) {
    if (seen[w.greek]) { var x = list.find(function (y) { return y.greek === w.greek; }); if (x) { x.ctx = x.ctx || w.ctx; x.src = x.src || w.src; x.added = true; } }
    else push(w, true);
  });
  App.words = list;
  App.byGreek = {};
  list.forEach(function (w) { App.byGreek[w.greek] = w; });
  App.deckIndex = null;   // rebuilt lazily
  anCache = {};
};

/* ---------------- dictionary ---------------- */
var D = {L: [], F: {}, C: {}, byWord: {}, foldIdx: null};
(function loadDict() {
  var G = window.GR_DICT; if (!G) return;
  D.L = G.L.split('\n').map(function (l, i) { var p = l.split('|'); return {w: p[0], pos: p[1], g: p[2], gl: p[3], i: i}; });
  G.F.split('\n').forEach(function (l) { var p = l.split('|'); D.F[p[0]] = p[1].split(',').map(Number); });
  D.C = G.C;
  D.L.forEach(function (e) { var k = e.w.toLowerCase(); (D.byWord[k] || (D.byWord[k] = [])).push(e.i); });
})();
App.D = D;
var POSNAME = {n: 'noun', v: 'verb', a: 'adjective', d: 'adverb', p: 'pronoun', c: 'conjunction', r: 'preposition', i: 'interjection', x: 'phrase', m: 'name', u: 'number', t: 'article', k: 'particle'};
App.POSNAME = POSNAME;
App.article = function (e) { return e.pos === 'n' ? ({m: 'ο', f: 'η', n: 'το'}[e.g] || '') : ''; };
App.dictHeadword = function (e) { var a = App.article(e); return (a ? a + ' ' : '') + e.w; };

function buildFoldIdx() {
  D.foldIdx = {};
  function add(k, ids) { var f = fold(k); var a = D.foldIdx[f] || (D.foldIdx[f] = []); ids.forEach(function (i) { if (a.indexOf(i) < 0) a.push(i); }); }
  for (var w in D.byWord) add(w, D.byWord[w]);
  for (var f in D.F) add(f, D.F[f]);
}
/* Elided forms that show up in texts. */
var ELIDE = {"σ'": 'σε', "μ'": 'με', "τ'": 'το', "απ'": 'από', "γι'": 'για', "κι": 'και', "π'": 'που', "θ'": 'θα', "ν'": 'να'};
/* Short, very common forms the dictionary tables leave out (contractions, articles, irregular subjunctives). */
var FUNC = {'στη': 'σε', 'στην': 'σε', 'στο': 'σε', 'στον': 'σε', 'στις': 'σε', 'στους': 'σε', 'στα': 'σε', 'στων': 'σε',
  'οι': 'ο', 'των': 'ο', 'μια': 'ένας', 'μία': 'ένας', 'μιας': 'ένας', 'κυρ': 'κύριος', 'κυρα': 'κυρία',
  'πω': 'λέω', 'πεις': 'λέω', 'πει': 'λέω', 'πούμε': 'λέω', 'πείτε': 'λέω', 'πουν': 'λέω', 'πούνε': 'λέω',
  'δω': 'βλέπω', 'δεις': 'βλέπω', 'δει': 'βλέπω', 'δούμε': 'βλέπω', 'δείτε': 'βλέπω', 'δουν': 'βλέπω',
  'αυγό': 'αβγό', 'αυγά': 'αβγό', 'αυγού': 'αβγό', 'αυγών': 'αβγό'};
/* Last resort for inflected forms the tables miss: undo a common ending and see if a known word appears. */
var SUFFIX = [['ες', 'α'], ['ες', 'η'], ['ων', 'α'], ['ων', 'η'], ['ων', 'ο'], ['ων', 'ος'], ['ιά', 'ί'], ['ια', 'ι'], ['ιού', 'ί'], ['ιών', 'ί'],
  ['α', 'ο'], ['ου', 'ος'], ['ου', 'ο'], ['οι', 'ος'], ['ους', 'ος'], ['ο', 'ος'], ['η', 'ος'], ['ης', 'η'], ['ας', 'α'], ['ες', 'ος'], ['ε', 'ος'],
  ['εις', 'ω'], ['ει', 'ω'], ['ουμε', 'ω'], ['ετε', 'ω'], ['ουν', 'ω'], ['ουνε', 'ω'], ['άει', 'άω'], ['άς', 'άω'], ['άμε', 'άω'], ['άτε', 'άω'],
  ['άνε', 'άω'], ['ούν', 'ώ'], ['είς', 'ώ'], ['εί', 'ώ'], ['ούμε', 'ώ'], ['είτε', 'ώ'], ['εσαι', 'ομαι'], ['εται', 'ομαι'], ['όμαστε', 'ομαι'], ['ονται', 'ομαι']];

/* dictionary entry ids for a surface form, best first */
App.dictLookup = function (form) {
  var f = form.toLowerCase().replace(/[’ʼ`]/g, "'");
  if (ELIDE[f]) f = ELIDE[f];
  f = f.replace(/σ$/, 'ς');
  var ids = [];
  function add(a) { (a || []).forEach(function (i) { if (ids.indexOf(i) < 0) ids.push(i); }); }
  if (FUNC[f]) add(D.byWord[FUNC[f]]);
  add(D.byWord[f]); add(D.F[f]);
  if (!ids.length) { if (!D.foldIdx) buildFoldIdx(); add(D.foldIdx[fold(f)]); }
  if (!ids.length) {
    var ff = fold(f);
    SUFFIX.forEach(function (r) {
      var a = fold(r[0]);
      if (ff.length > a.length + 2 && ff.slice(-a.length) === a) add(D.foldIdx[ff.slice(0, -a.length) + fold(r[1])]);
    });
  }
  // lemma entries that are themselves "form of X" glosses → prefer X
  ids.sort(function (a, b) { return a - b; });
  return ids;
};

/* deck index: maps dict entry ids and folded keys to deck words */
function deckIndex() {
  if (App.deckIndex) return App.deckIndex;
  var byKey = {}, byFold = {}, byDict = {};
  App.words.forEach(function (w) {
    var k = keyOf(w.greek);
    byKey[k] = byKey[k] || w;
    byFold[fold(k)] = byFold[fold(k)] || w;
    if (k.indexOf(' ') < 0) App.dictLookup(k).slice(0, 3).forEach(function (i) {
      // only link when the dict entry's headword is this key, or this key is an inflected/alternative form of it
      if (!byDict[i]) byDict[i] = w;
    });
  });
  App.deckIndex = {byKey: byKey, byFold: byFold, byDict: byDict};
  return App.deckIndex;
}
App.getDeckIndex = deckIndex;

/* Analyse one token: returns {form, cands:[{e, deck}], deck, best} */
var anCache = {};
App.analyse = function (form) {
  if (anCache[form]) return anCache[form];
  var low = form.toLowerCase().replace(/σ$/, 'ς');
  var di = deckIndex();
  var ids = App.dictLookup(low);
  var cands = ids.map(function (i) { return {e: D.L[i], deck: di.byDict[i] || di.byKey[D.L[i].w.toLowerCase()] || null}; });
  var direct = di.byKey[low] || di.byFold[fold(low)] || null;
  if (direct && !cands.some(function (c) { return c.deck === direct; })) cands.unshift({e: null, deck: direct});
  // prefer candidates that are in the deck, then lower frequency rank
  cands.sort(function (a, b) { return (b.deck ? 1 : 0) - (a.deck ? 1 : 0) || (a.e ? a.e.i : -1) - (b.e ? b.e.i : -1); });
  // drop "form of" pseudo-lemmas when a real lemma exists
  var real = cands.filter(function (c) { return !c.e || !/form of|nonfinite form|inflection of/.test(c.e.gl); });
  if (real.length) cands = real;
  return (anCache[form] = {form: form, cands: cands, best: cands[0] || null});
};

/* ---------------- scheduler (SM-2 with learning steps) ---------------- */
var STEPS = [1, 10];   // minutes
function card(greek) {
  return S.cards[greek] || (S.cards[greek] = {st: 'new', due: 0, ivl: 0, ease: 2.5, reps: 0, lapses: 0, step: 0});
}
App.card = card;
App.cardState = function (greek) {
  var c = S.cards[greek];
  if (!c || c.st === 'new') return 'new';
  if (c.st === 'learn') return 'learn';
  return c.ivl >= 21 ? 'mature' : 'young';
};
function fuzz(d) { return d < 2 ? d : d * (0.95 + Math.random() * 0.1); }
/* returns the next state for each grade without mutating */
App.preview = function (greek, grade) {
  var c = Object.assign({}, card(greek)), now = Date.now();
  if (c.st === 'new' || c.st === 'learn') {
    var relearn = c.st === 'learn' && c.lapses > 0 && c.ivl > 0;
    if (grade === 1) { c.st = 'learn'; c.step = 0; c.due = now + STEPS[0] * 60000; }
    else if (grade === 2) { c.st = 'learn'; c.due = now + (c.step === 0 ? 6 : STEPS[Math.min(c.step, STEPS.length - 1)] * 1.5) * 60000; }
    else if (grade === 3) {
      if (c.step + 1 < STEPS.length) { c.st = 'learn'; c.step++; c.due = now + STEPS[c.step] * 60000; }
      else { c.st = 'review'; c.ivl = relearn ? Math.max(1, c.ivl) : 1; c.due = dayStart() + c.ivl * DAY; }
    } else { c.st = 'review'; c.ivl = relearn ? Math.max(2, c.ivl * 1.5) : 4; c.due = dayStart() + Math.round(c.ivl) * DAY; }
  } else {
    var late = Math.max(0, (now - c.due) / DAY);
    if (grade === 1) { c.lapses++; c.ease = Math.max(1.3, c.ease - 0.2); c.ivl = Math.max(1, c.ivl * 0.3); c.st = 'learn'; c.step = 1; c.due = now + STEPS[1] * 60000; }
    else if (grade === 2) { c.ease = Math.max(1.3, c.ease - 0.15); c.ivl = Math.max(c.ivl + 1, c.ivl * 1.2); }
    else if (grade === 3) { c.ivl = Math.max(c.ivl + 1, (c.ivl + late / 2) * c.ease); }
    else { c.ease += 0.15; c.ivl = Math.max(c.ivl + 2, (c.ivl + late) * c.ease * 1.3); }
    if (grade > 1) { c.ivl = Math.min(3650, fuzz(c.ivl)); c.due = dayStart() + Math.round(c.ivl) * DAY; }
  }
  return c;
};
App.answer = function (greek, grade) {
  var wasNew = card(greek).st === 'new';
  var c = App.preview(greek, grade);
  c.reps++; c.seen = Date.now();
  S.cards[greek] = c;
  var d = App.day(); d.rev++; if (wasNew) d.nw++; if (grade > 1) d.ok++;
  App.save();
};
App.nextLabel = function (greek, grade) {
  var c = App.preview(greek, grade);
  return fmtIvl(Math.max(0, (c.due - Date.now()) / DAY));
};
/* Words in deck order for new-card introduction. */
App.newOrder = function () {
  var di = deckIndex();
  var rank = function (w) {
    if (S.cards[w.greek] && S.cards[w.greek].prio) return -1e6 + (S.cards[w.greek].prio || 0);
    if (w.added) return -5e5;
    if (S.settings.order === 'lesson') return w.date && w.date !== '-' ? Date.parse(w.date) / 1e8 : 1e9;
    // a phrase is as hard as its rarest word
    return Math.max.apply(null, keyOf(w.greek).split(/\s+/).map(function (t) { var ids = App.dictLookup(t.replace(/[;.!?,]/g, '')); return ids.length ? ids[0] : 30000; }));
  };
  return App.words.filter(function (w) { return App.cardState(w.greek) === 'new' && !(S.cards[w.greek] && S.cards[w.greek].sus); })
    .map(function (w) { return [rank(w), w]; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (x) { return x[1]; });
};
App.queue = function () {
  var now = Date.now(), learn = [], rev = [], nextLearn = Infinity;
  App.words.forEach(function (w) {
    var c = S.cards[w.greek]; if (!c || c.sus) return;
    if (c.st === 'learn') { if (c.due <= now + 60000) learn.push(w); else nextLearn = Math.min(nextLearn, c.due); }
    else if (c.st === 'review' && c.due <= now) rev.push(w);
  });
  learn.sort(function (a, b) { return S.cards[a.greek].due - S.cards[b.greek].due; });
  rev.sort(function (a, b) { return S.cards[a.greek].due - S.cards[b.greek].due; });
  var d = App.day();
  var newLeft = Math.max(0, S.settings.newPerDay - d.nw);
  var nw = newLeft ? App.newOrder().slice(0, newLeft) : [];
  return {learn: learn, rev: rev, nw: nw, nextLearn: nextLearn};
};
App.dueCount = function () { var q = App.queue(); return q.learn.length + q.rev.length + q.nw.length; };

/* ---------------- speech ---------------- */
var voice = null;
function pickVoice() {
  if (!window.speechSynthesis) return;
  var vs = speechSynthesis.getVoices().filter(function (v) { return /^el/i.test(v.lang); });
  voice = vs.find(function (v) { return /Melina|Google/.test(v.name); }) || vs[0] || null;
}
if (window.speechSynthesis) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
App.hasVoice = function () { return !!voice; };
App.say = function (text, opts) {
  opts = opts || {};
  if (!window.speechSynthesis) return;
  if (!opts.queue) speechSynthesis.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.lang = 'el-GR'; if (voice) u.voice = voice;
  u.rate = opts.rate || S.settings.rate;
  if (opts.onend) u.onend = opts.onend;
  if (opts.onstart) u.onstart = opts.onstart;
  speechSynthesis.speak(u);
  return u;
};
App.hush = function () { if (window.speechSynthesis) speechSynthesis.cancel(); };

/* ---------------- adding words ---------------- */
App.addWord = function (w) {
  // w: {greek, english, part_of_speech, ctx, src}
  w.greek = w.greek.trim(); w.english = (w.english || '').trim();
  if (!w.greek) return false;
  if (App.byGreek[w.greek]) { toast('Already in your words'); return false; }
  w.lesson_date = todayKey(); w.synced = false; w.at = Date.now();
  S.added.push(w);
  App.rebuildWords();
  var c = card(w.greek); c.prio = Date.now() / 1e7; c.mt = Date.now();
  App.day().added++;
  App.addXP(2);
  App.save();
  App.csvAutoSave();
  App.renderHud();
  return true;
};

/* ---------------- words.csv sync (File System Access API, with download fallback) ---------------- */
var fileHandle = null;
App.csv = {state: 'none'};   // none | need-permission | ok | unsupported
var IDB = {
  open: function () { return new Promise(function (res, rej) { var r = indexedDB.open('sigasiga', 1); r.onupgradeneeded = function () { r.result.createObjectStore('kv'); }; r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); }; }); },
  get: function (k) { return IDB.open().then(function (db) { return new Promise(function (res) { var q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = function () { res(q.result); }; q.onerror = function () { res(null); }; }); }); },
  set: function (k, v) { return IDB.open().then(function (db) { return new Promise(function (res) { var t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); }); }
};
App.csvSupported = function () { return 'showOpenFilePicker' in window; };
App.csvInit = function () {
  if (!App.csvSupported()) { App.csv.state = 'unsupported'; return Promise.resolve(); }
  return IDB.get('csvHandle').then(function (hd) {
    if (!hd) return;
    fileHandle = hd;
    return hd.queryPermission({mode: 'readwrite'}).then(function (p) {
      if (p === 'granted') { App.csv.state = 'ok'; return App.csvRead(true); }
      App.csv.state = 'need-permission';
    });
  }).catch(function (e) { console.warn(e); });
};
App.csvConnect = function () {
  return window.showOpenFilePicker({types: [{description: 'CSV', accept: {'text/csv': ['.csv']}}], multiple: false})
    .then(function (hs) { fileHandle = hs[0]; return IDB.set('csvHandle', fileHandle); })
    .then(function () { return fileHandle.requestPermission({mode: 'readwrite'}); })
    .then(function (p) { App.csv.state = p === 'granted' ? 'ok' : 'need-permission'; return App.csvRead(false); })
    .catch(function (e) { if (e.name !== 'AbortError') toast('Could not open file: ' + e.message); });
};
App.csvReconnect = function () {
  if (!fileHandle) return App.csvConnect();
  return fileHandle.requestPermission({mode: 'readwrite'}).then(function (p) {
    App.csv.state = p === 'granted' ? 'ok' : 'need-permission';
    if (p === 'granted') return App.csvRead(false);
  });
};
/* Read words.csv from disk; then write back any words added in the app that the file doesn't have yet. */
App.csvRead = function (quiet) {
  return fileHandle.getFile().then(function (f) { App.csv.name = f.name; return f.text(); }).then(function (text) {
    var rows = parseCSV(text);
    if (!rows.length || !('greek' in rows[0])) { toast('That file has no "greek" column'); App.csv.state = 'none'; return; }
    if (text !== S.csvText) { S.csvText = text; S.csvAt = Date.now(); }
    var inFile = {}; rows.forEach(function (r) { inFile[r.greek] = 1; });
    S.added.forEach(function (w) { w.synced = !!inFile[w.greek]; });
    App.rebuildWords(); App.save();
    var pending = S.added.filter(function (w) { return !w.synced; }).length;
    if (!quiet) toast('Loaded ' + rows.length + ' words from ' + App.csv.name);
    if (pending || Object.keys(S.edits).length) return App.csvWrite();
  }).then(function () { App.refresh(); });
};
App.csvText = function () {
  var base = parseCSV(S.csvText || window.GR_WORDS_CSV || '');
  var cols = ['greek', 'english', 'part_of_speech', 'lesson_date'];
  if (base.length) Object.keys(base[0]).forEach(function (k) { if (cols.indexOf(k) < 0) cols.push(k); });
  var have = {};
  var out = [cols.join(',')];
  base.forEach(function (r) {
    have[r.greek] = 1;
    if (S.edits[r.greek] != null) r.english = S.edits[r.greek];
    out.push(cols.map(function (c) { return csvCell(r[c]); }).join(','));
  });
  S.added.forEach(function (w) { if (!have[w.greek]) out.push(cols.map(function (c) { return csvCell(w[c] || ''); }).join(',')); });
  return out.join('\n') + '\n';
};
App.csvWrite = function () {
  if (!fileHandle || App.csv.state !== 'ok') return Promise.resolve(false);
  var text = App.csvText();
  return fileHandle.createWritable().then(function (w) { return w.write(text).then(function () { return w.close(); }); }).then(function () {
    S.csvText = text; S.csvSaved = S.csvAt = Date.now();
    S.added.forEach(function (w) { w.synced = true; });
    S.edits = {};
    App.rebuildWords(); App.save();
    return true;
  }).catch(function (e) { toast('Could not write words.csv: ' + e.message); App.csv.state = 'need-permission'; return false; });
};
App.csvAutoSave = function () { if (App.csv.state === 'ok') App.csvWrite().then(function (ok) { if (ok) toast('Saved to ' + (App.csv.name || 'words.csv')); }); };
App.csvDownload = function () {
  var blob = new Blob([App.csvText()], {type: 'text/csv;charset=utf-8'});
  var a = h('a', {href: URL.createObjectURL(blob), download: 'words.csv'});
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
};
App.pendingCount = function () { return S.added.filter(function (w) { return !w.synced; }).length + Object.keys(S.edits).length; };

/* ---------------- texts ---------------- */
App.texts = (window.GR_TEXTS || []).slice();
App.SERIES = [
  {id: 'myth', name: 'Ελληνικοί μύθοι', label: 'Myth', about: 'Greek myths retold in simple language, the way a children’s book would tell them. Mostly past tense, with dialogue. A2 to A2+.'},
  {id: 'why', name: 'Γιατί;', label: 'Question', about: 'Science and nature for kids: why the sea is salty, how bees make honey, why Greece has so many earthquakes. Mostly present tense. A2 to A2+.'},
  {id: 'true', name: 'Αληθινές ιστορίες', label: 'Story', about: 'True stories from Greek and Cypriot history and science, from Eratosthenes measuring the Earth to the cats of a monastery near Limassol. A2+ to B1.'},
  {id: 'culture', name: 'Μικρά κείμενα', label: 'Article', about: 'Short articles about Greek life and culture, A2+ to B1.'},
  {id: 'story', name: 'Ένας χρόνος στη Θεσσαλονίκη', label: 'Chapter', about: 'A story in 10 chapters about Alex, a data analyst who moves to Thessaloniki. It starts at A2 and finishes at B1, and the chapters follow the topics of an A2 course.'}
];
/* today's suggested text: the next unread one, taking the series in turn day by day */
App.nextText = function () {
  var unread = function (t) { return !(S.texts[t.id] && S.texts[t.id].done); };
  var firsts = App.SERIES.map(function (s) { return App.texts.find(function (t) { return t.series === s.id && unread(t); }); }).filter(Boolean);
  return firsts.length ? firsts[Math.floor(Date.parse(studyDay()) / DAY) % firsts.length] : null;
};
App.allTexts = function () {
  return App.texts.concat(S.myTexts.map(function (t) { return Object.assign({series: 'mine', level: '', paragraphs: null}, t); }));
};
App.textById = function (id) { return App.allTexts().find(function (t) { return t.id === id; }); };
/* split Greek text into tokens: words and the stuff between them */
var WORD_RE = /[A-Za-zÀ-ɏͰ-Ͽἀ-῿]+(?:['’][A-Za-zÀ-ɏͰ-Ͽἀ-῿]+)*['’]?/g;
App.tokenize = function (s) {
  var out = [], last = 0, m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(s))) {
    if (m.index > last) out.push({t: s.slice(last, m.index)});
    out.push({w: m[0]});
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push({t: s.slice(last)});
  return out;
};
/* split plain text into sentences (for imported texts) */
App.sentences = function (p) {
  var out = [], re = /[^.!;;?…]+[.!;;?…]*["»”)]*\s*/g, m;
  while ((m = re.exec(p))) if (m[0].trim()) out.push(m[0].trim());
  return out.length ? out : [p];
};
App.textParas = function (t) {
  if (t.paragraphs) return t.paragraphs;
  return t.body.split(/\n\s*\n|\n/).filter(function (p) { return p.trim(); }).map(function (p) {
    return App.sentences(p).map(function (s) { return [s, null]; });
  });
};
/* status of a token for colouring: known | lrn | new | unk | basic | name */
App.tokenStatus = function (form, sentenceStart) {
  var a = App.analyse(form);
  var b = a.best;
  if (b && b.deck) return {s: App.cardState(b.deck.greek) === 'learn' ? 'lrn' : 'known', a: a};
  if (b && b.e && (b.e.i < 300 || b.e.pos === 'u')) return {s: 'basic', a: a};   // very common words and numbers
  if (form.length === 1 || /[a-z\u00c0-\u024f]/i.test(form)) return {s: 'name', a: a};   // single letters, Latin-script words
  if (/^[Α-ΩΆΈΉΊΌΎΏ]/.test(form) && !sentenceStart) return {s: 'name', a: a};
  if (b && b.e && b.e.pos === 'm') return {s: 'name', a: a};
  if (b && b.e) return {s: 'new', a: a};
  return {s: 'unk', a: a};
};
App.coverage = function (t) {
  if (t._cov != null && t._covAt === App.words.length) return t._cov;
  var tot = 0, ok = 0;
  App.textParas(t).forEach(function (para) {
    para.forEach(function (pair) {
      var first = true;
      App.tokenize(pair[0]).forEach(function (tk) {
        if (!tk.w) return;
        var s = App.tokenStatus(tk.w, first).s; first = false;
        tot++; if (s !== 'new' && s !== 'unk') ok++;
      });
    });
  });
  t._cov = tot ? ok / tot : 1; t._covAt = App.words.length; t._words = tot;
  return t._cov;
};

/* ---------------- views ---------------- */
App.views = {};
App.current = 'today';
App.show = function (v, arg) {
  App.hush();
  App.current = v;
  $$('#tabs button').forEach(function (b) { b.classList.toggle('on', b.dataset.v === v); });
  $$('section.view').forEach(function (s) { s.classList.toggle('on', s.id === 'v-' + v); });
  if (App.views[v]) App.views[v](arg);
  window.scrollTo(0, 0);
  try { history.replaceState(null, '', '#' + v); } catch (e) {}
};
App.refresh = function () { if (App.views[App.current]) App.views[App.current](); App.renderHud(); };
App.renderHud = function () {
  var lv = App.level();
  $('#hud').innerHTML = '<span title="Streak">🔥 <b>' + App.streak() + '</b></span><span title="Level ' + esc(lv.name) + '">' + esc(lv.name) + ' · <b>' + S.xp + '</b> XP</span>';
  var due = App.dueCount();
  var b = $('#due-badge'); b.hidden = !due; b.textContent = due > 99 ? '99+' : due;
};
document.addEventListener('DOMContentLoaded', function () {
  $('#tabs').addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) App.show(b.dataset.v, '__tab'); });
  App.rebuildWords();
  App.csvInit().then(function () { App.renderHud(); });
  var start = (location.hash || '#today').slice(1);
  App.show(App.views[start] ? start : 'today');
  App.renderHud();
});
