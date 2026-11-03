/* Read: library of graded texts, the tap-to-look-up reader, and adding words while reading. */
'use strict';
(function () {
  var u = App.u, S = App.S, $ = u.$, $$ = u.$$, esc = u.esc;
  var root = $('#v-read');
  var cur = null, toks = [], sents = [], playing = false, playIdx = 0, pop = null, selTok = -1;

  var LV = {'A2': 'lv-A2', 'A2+': 'lv-A2p', 'B1': 'lv-B1', 'B1+': 'lv-B1p', 'B2': 'lv-B2'};
  function lvPill(l) { return l ? '<span class="pill ' + (LV[l] || '') + '">' + esc(l) + '</span>' : '<span class="pill">your text</span>'; }

  var SOURCES = [
    ['Lingvoberry · A2', 'https://lingvoberry.com/read/el/a2', '17 free graded readers at A2 (5 short books and 12 short stories) with tap-to-translate and audio. There is a B1 shelf too.'],
    ['PollyStop · Greek stories', 'https://pollystop.com/polly-stories/greek', 'Free short stories by level, A2 to C1, with audio and quizzes. No account needed.'],
    ['FluencyDrop · Greek', 'https://fluencydrop.com/stories/greek', 'Stories sorted by CEFR level, A1 to C2. Reads free on the web.'],
    ['Omilo · Lydia easy reader', 'https://omilo.com/for-free/', 'Free units of the Lydia easy-reader series (A1–A2 and A2–B1) with audiobook and an English word list.'],
    ['ReadNative · Aesop’s fables', 'https://readnative.org/learn-greek/', 'Aesop’s fables retold in graded Greek, A1 to B1. The first book is free.'],
    ['Centre for the Greek Language · text bank', 'https://www.greek-language.gr/certification/dbs/teachers/index.html', 'Real texts sorted by level (A1–C2) from the people who write the Ελληνομάθεια exams, many with exercises. Good for exam-style practice.']
  ];

  /* ---------------- library ---------------- */
  function library() {
    App.hush(); closePop(); cur = null;
    var next = App.nextText();
    function cardHtml(t, label) {
      var done = S.texts[t.id] && S.texts[t.id].done;
      var cov = App.coverage(t);
      var mins = Math.max(1, Math.round((t._words || 200) / 70));   // a relaxed learner pace
      return '<button class="tcard' + (done ? ' done' : '') + (t === next ? ' next' : '') + '" data-id="' + esc(t.id) + '">' +
        '<span class="ch">' + esc(label) + '</span><span class="tt">' + esc(t.title) + '</span><span class="te">' + esc(t.title_en || '') + '</span>' +
        '<span class="tf">' + lvPill(t.level) + '<span>~' + mins + ' min</span><span class="spacer"></span><span class="cov" title="Share of words you already have in your list (or are very common)">' + Math.round(cov * 100) + '% known</span></span></button>';
    }
    var mine = S.myTexts.map(function (t) { return App.textById(t.id); });
    root.innerHTML = '<h1>Read</h1><p class="sub">Tap any word to see what it means, hear it, and add it to your words. Words you don’t have yet are <span style="border-bottom:2px solid var(--gold);background:color-mix(in srgb,var(--gold) 16%,transparent)">highlighted</span>. Aim for texts where you know about 90%: that’s the level where reading grows your vocabulary without feeling like decoding.</p>' +
      App.SERIES.map(function (s) {
        var ts = App.texts.filter(function (t) { return t.series === s.id; });
        return ts.length ? '<div class="lib-group"><h2>' + esc(s.name) + '</h2><p class="sub small">' + esc(s.about) + '</p><div class="lib">' +
          ts.map(function (t) { return cardHtml(t, s.label + ' ' + t.chapter); }).join('') + '</div></div>' : '';
      }).join('') +
      '<div class="lib-group"><h2>Your texts</h2><p class="sub small">Paste anything in Greek: a story from the sites below, a news article, song lyrics, a message from your teacher. You get the same tap-to-look-up and word saving.</p><div class="lib">' +
      mine.map(function (t) { return cardHtml(t, new Date(t.at).toLocaleDateString()); }).join('') +
      '<button class="tcard" id="add-text" style="align-items:center;justify-content:center;border-style:dashed"><span class="tt">+ Add a text</span><span class="te">paste Greek text</span></button></div></div>' +
      '<div class="lib-group"><h2>More to read online</h2><p class="sub small">Free graded readers I found for Greek. They aren’t openly licensed, so they aren’t copied in here, but you can paste a story into “Add a text” to read it with your dictionary.</p><div class="ext">' +
      SOURCES.map(function (s) { return '<a href="' + s[1] + '" target="_blank" rel="noopener"><b>' + esc(s[0]) + ' ↗</b><span>' + esc(s[2]) + '</span></a>'; }).join('') + '</div></div>';
    $$('.tcard[data-id]', root).forEach(function (b) { b.onclick = function () { open(b.dataset.id); }; });
    $('#add-text').onclick = importDialog;
  }

  function importDialog() {
    var d = u.h('dialog', {}, '<h2 style="margin-top:0">Add a text</h2><label class="f">Title</label><input type="text" id="im-title" placeholder="e.g. Η κάρτα που δεν πλήρωνε">' +
      '<label class="f">Greek text</label><textarea id="im-body" lang="el" placeholder="Paste Greek text here…"></textarea>' +
      '<div class="row" style="margin-top:14px;justify-content:flex-end"><button class="btn ghost" id="im-cancel">Cancel</button><button class="btn pri" id="im-save">Save and read</button></div>');
    document.body.appendChild(d); d.showModal();
    $('#im-cancel', d).onclick = function () { d.close(); d.remove(); };
    $('#im-save', d).onclick = function () {
      var body = $('#im-body', d).value.trim(); if (!body) return;
      var title = $('#im-title', d).value.trim() || body.split(/\s+/).slice(0, 5).join(' ') + '…';
      var t = {id: 'my-' + Date.now(), title: title, body: body, at: Date.now()};
      S.myTexts.push(t); App.save();
      d.close(); d.remove();
      open(t.id);
    };
  }

  /* ---------------- reader ---------------- */
  function open(id) {
    var t = App.textById(id); if (!t) return library();
    cur = t; toks = []; sents = []; selTok = -1; playing = false;
    var paras = App.textParas(t);
    var html = '';
    paras.forEach(function (para, pi) {
      html += '<p>';
      var prevDialog = false;
      para.forEach(function (pair, si) {
        var sIdx = sents.length;
        sents.push({gr: pair[0], en: pair[1]});
        var isDialog = /^\s*[—–-]/.test(pair[0]);
        if (si > 0 && (isDialog || prevDialog)) html += '<br>';
        prevDialog = isDialog;
        html += '<span class="s" data-s="' + sIdx + '">';
        var first = true;
        App.tokenize(pair[0]).forEach(function (tk) {
          if (!tk.w) { html += esc(tk.t); return; }
          var st = App.tokenStatus(tk.w, first); first = false;
          var k = toks.length;
          if (st.s === 'unk' && noteFor({w: tk.w, s: sIdx})) st = {s: 'new', a: st.a};   // explained in the text's notes
          toks.push({w: tk.w, s: sIdx, st: st.s, a: st.a});
          html += '<span class="w ' + st.s + '" data-k="' + k + '">' + esc(tk.w) + '</span>';
        });
        html += '<button class="trbtn" data-tr="' + sIdx + '" title="' + (pair[1] ? 'Show translation' : 'Translate in Google Translate') + '">' + (pair[1] ? 'EN' : '↗') + '</button>';
        html += '</span> ';
      });
      html += '</p>';
    });
    var done = S.texts[t.id] && S.texts[t.id].done;
    var cov = App.coverage(t);
    var head = '<div class="reader-head"><button class="btn sm ghost" id="rd-back">← Library</button>' +
      '<h1 style="margin-top:8px">' + esc(t.title) + '</h1>' +
      '<div class="row">' + lvPill(t.level) + '<span class="muted small">' + (t.title_en ? esc(t.title_en) + ' · ' : '') + (t._words || toks.length) + ' words · ' + Math.round(cov * 100) + '% known' + (done ? ' · ✓ read' : '') + '</span></div>' +
      (t.summary_en ? '<p class="summary">' + esc(t.summary_en) + '</p>' : '') + '</div>';
    var bar = '<div class="reader-bar"><button class="btn sm pri" id="rd-play">▶ Read aloud</button>' +
      '<select id="rd-rate" style="width:auto" title="Speed">' + [[0.7, 'slow'], [0.85, 'relaxed'], [1, 'normal']].map(function (r) { return '<option value="' + r[0] + '"' + (Math.abs(S.settings.rate - r[0]) < 0.08 ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select>' +
      '<span class="spacer"></span>' +
      (t.paragraphs ? '<button class="btn sm" id="rd-tr">Show all translations</button>' : '') +
      '<label class="small row" style="gap:5px;cursor:pointer"><input type="checkbox" id="rd-marks" checked> highlight new words</label></div>';
    root.innerHTML = '<div class="reader">' + head + bar + '<div class="txt marks gr" id="rd-txt" lang="el">' + html + '</div>' + tail(t) + '</div>';
    bindReader();
  }

  function tail(t) {
    var out = '';
    if (t.questions && t.questions.length) {
      out += '<div class="card quiz" style="margin-top:26px"><h2 style="margin-top:0">Did you get it?</h2>' + t.questions.map(function (q, qi) {
        return '<div class="q" data-q="' + qi + '"><b>' + esc(q.q) + '</b><span class="qe">' + esc(q.q_en || '') + '</span><div class="opts">' +
          q.options.map(function (o, oi) { return '<button data-o="' + oi + '">' + esc(o) + '</button>'; }).join('') + '</div></div>';
      }).join('') + '</div>';
    }
    out += '<div class="card" style="margin-top:18px" id="rd-new"></div>';
    out += '<div class="row" style="margin:20px 0 10px;justify-content:center"><button class="btn pri" id="rd-finish">Finish reading</button>' +
      (t.series === 'mine' ? '<button class="btn ghost" id="rd-del">Delete this text</button>' : '') + '</div>';
    return out;
  }

  /* words in this text that aren't in your list yet, most common first */
  function renderNewWords() {
    var box = $('#rd-new'); if (!box) return;
    var seen = {}, items = [];
    toks.forEach(function (tk) {
      if (tk.st !== 'new') return;
      var e = tk.a.best && tk.a.best.e; if (!e || seen[e.i]) return;
      if (App.getDeckIndex().byDict[e.i]) return;
      seen[e.i] = 1;
      items.push({e: e, tk: tk});
    });
    items.sort(function (a, b) { return a.e.i - b.e.i; });
    if (!items.length) { box.innerHTML = '<h3 style="margin-top:0">Words from this text</h3><p class="muted small">Every word here is already in your list. Nice.</p>'; return; }
    box.innerHTML = '<h3 style="margin-top:0">Words from this text you don’t have yet</h3><p class="muted small" style="margin-top:-4px">Most common first, so the top of the list gives the most value. Adding one also adds it to your reviews with this sentence as an example.</p><div class="newlist">' +
      items.map(function (it, i) {
        var e = it.e, note = noteFor(it.tk);
        return '<div class="nl"><span class="gr ' + gcls(e) + '">' + esc(App.dictHeadword(e)) + '</span><span class="en">' + esc(note ? note.gloss : e.gl) + '</span><button class="btn sm" data-add="' + i + '">+ Add</button></div>';
      }).join('') + '</div>';
    $$('[data-add]', box).forEach(function (b) {
      b.onclick = function () {
        var it = items[+b.dataset.add], e = it.e, note = noteFor(it.tk);
        if (App.addWord({greek: App.dictHeadword(e), english: shortGloss(e.gl), part_of_speech: App.POSNAME[e.pos] || '', ctx: sents[it.tk.s].gr, src: cur.title})) {
          App.toast('Added ' + e.w);
          markAdded(e); b.disabled = true; b.textContent = '✓ Added';
        }
      };
    });
  }
  function gcls(e) { return e.pos === 'n' ? ({m: 'g-m', f: 'g-f', n: 'g-n'}[e.g] || '') : ''; }
  function shortGloss(g) { return g.split(';')[0].trim(); }
  function noteFor(tk) {
    if (!cur || !cur.notes) return null;
    var w = tk.w.toLowerCase(), sent = sents[tk.s].gr;
    return cur.notes.find(function (n) { return n.form.toLowerCase() === w; }) ||
      cur.notes.find(function (n) { return n.form.indexOf(' ') > 0 && sent.indexOf(n.form) >= 0 && n.form.toLowerCase().split(/\s+/).indexOf(w) >= 0; }) || null;
  }
  function markAdded(e) {
    App.getDeckIndex();
    toks.forEach(function (tk, k) {
      if (tk.a.best && tk.a.best.e && tk.a.best.e.i === e.i) {
        var st = App.tokenStatus(tk.w, false); tk.a = st.a; tk.st = 'lrn';
        var el = $('.w[data-k="' + k + '"]'); if (el) { el.className = 'w lrn added'; }
      }
    });
  }

  function bindReader() {
    $('#rd-back').onclick = function () { App.hush(); playing = false; library(); };
    var txt = $('#rd-txt');
    txt.addEventListener('click', function (e) {
      var w = e.target.closest('.w');
      if (w) { e.stopPropagation(); showPop(+w.dataset.k, w); return; }
      var tb = e.target.closest('.trbtn');
      if (tb) { e.stopPropagation(); toggleTr(+tb.dataset.tr); }
    });
    $('#rd-marks').onchange = function () { txt.classList.toggle('marks', this.checked); };
    if ($('#rd-tr')) $('#rd-tr').onclick = function () {
      var showing = $$('.tr', txt).length > 0;
      $$('.tr', txt).forEach(function (x) { x.remove(); });
      if (!showing) sents.forEach(function (s, i) { toggleTr(i, true); });
      this.textContent = showing ? 'Show all translations' : 'Hide translations';
    };
    $('#rd-play').onclick = function () { if (playing) stopPlay(); else startPlay(selTok >= 0 ? toks[selTok].s : 0); };
    $('#rd-rate').onchange = function () { S.settings.rate = +this.value; App.save(); };
    $$('.quiz .q').forEach(function (qd) {
      var qi = +qd.dataset.q, q = cur.questions[qi], tries = 0;
      $$('button', qd).forEach(function (b) {
        b.onclick = function () {
          if (qd.dataset.done) return;
          tries++;
          if (+b.dataset.o === q.answer) { b.classList.add('right'); qd.dataset.done = tries === 1 ? 'first' : 'later'; }
          else b.classList.add('wrong');
        };
      });
    });
    $('#rd-finish').onclick = finish;
    if ($('#rd-del')) $('#rd-del').onclick = function () {
      if (!confirm('Delete this text? Words you added from it stay in your list.')) return;
      S.myTexts = S.myTexts.filter(function (t) { return t.id !== cur.id; }); S.gone['t:' + cur.id] = Date.now(); App.save(); library();
    };
    renderNewWords();
  }

  function toggleTr(i, forceOn) {
    var span = $('.s[data-s="' + i + '"]'); if (!span) return;
    var ex = $('.tr', span);
    if (ex && !forceOn) { ex.remove(); return; }
    if (ex) return;
    var s = sents[i];
    if (!s.en) { window.open('https://translate.google.com/?sl=el&tl=en&op=translate&text=' + encodeURIComponent(s.gr), '_blank', 'noopener'); return; }
    span.appendChild(u.h('span', {class: 'tr'}, esc(s.en)));
  }

  /* ---------------- word popover ---------------- */
  function closePop() { if (pop) { pop.remove(); pop = null; } $$('.w.sel').forEach(function (x) { x.classList.remove('sel'); }); selTok = -1; }
  document.addEventListener('click', function (e) { if (pop && !pop.contains(e.target) && !e.target.closest('.w')) closePop(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePop(); });

  function showPop(k, el, candIdx) {
    closePop();
    selTok = k; el.classList.add('sel');
    var tk = toks[k], a = tk.a, cands = a.cands, note = noteFor(tk);
    candIdx = candIdx || 0;
    var c = cands[candIdx] || null, e = c && c.e, deck = c && c.deck;
    var html = '<button class="p-x" title="Close">×</button><div class="p-form">' + esc(tk.w) + '</div>';
    if (deck) {
      var st = App.cardState(deck.greek), card = S.cards[deck.greek];
      html += '<div class="p-lemma ' + App.genderClass(deck.greek) + '">' + esc(deck.greek) + (deck.pos ? '<span class="p-pos">' + esc(deck.pos) + '</span>' : '') + '</div>' +
        '<div class="p-gloss">' + esc(deck.english) + '</div>' +
        '<div class="p-state st-' + st + '">In your words · ' + (st === 'new' ? 'not studied yet' : st === 'learn' ? 'learning' : st === 'mature' ? 'well known' : 'next review in ' + u.fmtIvl(Math.max(0, (card.due - Date.now()) / 864e5))) + '</div>';
    } else if (e) {
      html += '<div class="p-lemma ' + gcls(e) + '">' + esc(App.dictHeadword(e)) + '<span class="p-pos">' + esc(App.POSNAME[e.pos] || '') + '</span></div><div class="p-gloss">' + esc(e.gl) + '</div>';
    } else {
      html += '<div class="p-lemma">' + esc(tk.w) + '</div><div class="p-gloss muted">Not in the offline dictionary (often a name or a rare form).</div>';
    }
    if (note) html += '<div class="p-note"><b>' + esc(note.form) + '</b> → ' + esc(note.lemma) + ': ' + esc(note.gloss) + (note.note ? '<br><span class="muted">' + esc(note.note) + '</span>' : '') + '</div>';
    var alts = cands.map(function (x, i) { return i === candIdx ? null : '<button data-alt="' + i + '">' + esc(x.deck ? x.deck.greek : x.e.w) + '</button>'; }).filter(Boolean).slice(0, 3);
    if (alts.length) html += '<div class="p-alt">Or: ' + alts.join(' · ') + '</div>';
    var lemma = deck ? App.keyOf(deck.greek) : e ? e.w : tk.w.toLowerCase();
    html += '<div class="row"><button class="btn sm" id="p-say">🔊 word</button><button class="btn sm" id="p-says">🔊 sentence</button>' +
      (deck ? '<button class="btn sm" id="p-forgot" title="Bring this word back into today’s reviews">Forgot it</button>' : '<button class="btn sm pri" id="p-add">+ Add to my words</button>') + '</div>' +
      '<div class="p-alt"><a href="https://en.wiktionary.org/wiki/' + encodeURIComponent(lemma) + '#Greek" target="_blank" rel="noopener">Wiktionary</a> · <a href="https://www.greek-language.gr/greekLang/modern_greek/tools/lexica/search.html?lq=' + encodeURIComponent(lemma) + '" target="_blank" rel="noopener">Λεξικό Τριανταφυλλίδη</a></div>' +
      '<div class="addform" id="p-form" hidden></div>';
    pop = u.h('div', {class: 'pop'}, html);
    document.body.appendChild(pop);
    place(pop, el);
    $('.p-x', pop).onclick = closePop;
    $$('[data-alt]', pop).forEach(function (b) { b.onclick = function (ev) { ev.stopPropagation(); showPop(k, el, +b.dataset.alt); }; });
    $('#p-say').onclick = function () { App.say(tk.w); };
    $('#p-says').onclick = function () { App.say(sents[tk.s].gr.replace(/^[—–-]\s*/, '')); };
    if ($('#p-forgot')) $('#p-forgot').onclick = function () {
      var cd = App.card(deck.greek);
      if (cd.st === 'review') { cd.st = 'learn'; cd.step = 1; cd.lapses++; cd.ivl = Math.max(1, cd.ivl * 0.5); }
      cd.due = cd.mt = Date.now(); if (cd.st === 'new') cd.prio = -Date.now() / 1e7;
      App.save(); App.renderHud(); App.toast('It’s back in today’s reviews'); closePop();
    };
    if ($('#p-add')) $('#p-add').onclick = function () { addForm(tk, e, note); };
    if (S.settings.autoplay) App.say(tk.w);
  }
  function place(p, el) {
    if (window.innerWidth <= 760) return;   // bottom sheet on phones (CSS)
    var r = el.getBoundingClientRect(), pw = p.offsetWidth, ph = p.offsetHeight;
    var left = Math.min(window.innerWidth - pw - 12, Math.max(12, r.left + r.width / 2 - pw / 2));
    var top = r.bottom + 8; if (top + ph > window.innerHeight - 12) top = Math.max(12, r.top - ph - 8);
    p.style.left = left + 'px'; p.style.top = top + 'px';
  }
  var POS_OPTS = ['noun', 'verb', 'adjective', 'adverb', 'phrase', 'preposition', 'conjunction', 'pronoun', 'name', 'number', 'interjection'];
  function addForm(tk, e, note) {
    var f = $('#p-form'); f.hidden = false;
    var greek = e ? App.dictHeadword(e) : (note ? note.lemma : tk.w.toLowerCase());
    var en = e ? shortGloss(e.gl) : note ? note.gloss : '';
    var pos = e ? (App.POSNAME[e.pos] || '') : '';
    f.innerHTML = '<label class="f">Greek (dictionary form)</label><input type="text" id="af-gr" lang="el" value="' + esc(greek) + '">' +
      '<label class="f">English</label><input type="text" id="af-en" value="' + esc(en) + '">' +
      '<label class="f">Part of speech</label><select id="af-pos">' + POS_OPTS.map(function (p) { return '<option' + (p === pos ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>' +
      '<div class="row"><span class="small muted">Saved with this sentence as an example.</span><span class="spacer"></span><button class="btn sm pri" id="af-save">Save</button></div>';
    $('#p-add').hidden = true;
    $('#af-en').focus(); $('#af-en').select();
    function save() {
      var ok = App.addWord({greek: $('#af-gr').value, english: $('#af-en').value, part_of_speech: $('#af-pos').value, ctx: sents[tk.s].gr, src: cur.title});
      if (ok) {
        App.toast('Added to your words' + (App.csv.state === 'ok' ? '' : ' (not in words.csv yet: see Words)'));
        if (e) markAdded(e); else { var el = $('.w[data-k="' + selTok + '"]'); if (el) el.className = 'w lrn added'; }
        closePop(); renderNewWords();
      }
    }
    $('#af-save').onclick = save;
    $$('input', f).forEach(function (i) { i.addEventListener('keydown', function (ev) { if (ev.key === 'Enter') save(); }); });
  }

  /* ---------------- read aloud ---------------- */
  function startPlay(from) {
    if (!App.hasVoice()) { App.toast('No Greek voice available in this browser'); return; }
    playing = true; playIdx = from; $('#rd-play').textContent = '■ Stop'; speakNext();
  }
  function stopPlay() { playing = false; App.hush(); $$('.s.speaking').forEach(function (x) { x.classList.remove('speaking'); }); var b = $('#rd-play'); if (b) b.textContent = '▶ Read aloud'; }
  function speakNext() {
    $$('.s.speaking').forEach(function (x) { x.classList.remove('speaking'); });
    if (!playing || !cur || playIdx >= sents.length) return stopPlay();
    var span = $('.s[data-s="' + playIdx + '"]'); if (span) { span.classList.add('speaking'); span.scrollIntoView({block: 'center', behavior: 'smooth'}); }
    var i = playIdx;
    App.say(sents[i].gr.replace(/^[—–-]\s*/, ''), {onend: function () { if (playing && playIdx === i) { playIdx++; speakNext(); } }});
  }

  /* ---------------- finish ---------------- */
  function finish() {
    var t = cur, prev = S.texts[t.id];
    var qs = $$('.quiz .q'), first = qs.filter(function (q) { return q.dataset.done === 'first'; }).length;
    var answered = qs.filter(function (q) { return q.dataset.done; }).length;
    if (qs.length && answered < qs.length && !confirm('You haven’t answered all the questions. Finish anyway?')) return;
    var xp = prev && prev.done ? 10 : 25 + first * 5;
    S.texts[t.id] = {done: true, quiz: qs.length ? first + '/' + qs.length : null, at: Date.now()};
    App.day().read++;
    App.addXP(xp);
    App.save();
    stopPlay();
    App.toast('Text finished · +' + xp + ' XP');
    library();
  }

  App.views.read = function (id) { if (id && id !== '__tab') open(id); else if (cur && id !== '__tab') open(cur.id); else library(); };
  App.openText = function (id) { App.show('read', id); };
})();
