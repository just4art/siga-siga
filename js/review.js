/* Review: spaced-repetition flashcards, plus a fast "sort what I already know" mode. */
'use strict';
(function () {
  var u = App.u, S = App.S, $ = u.$, esc = u.esc;
  var root = $('#v-review');
  var cur = null, flipped = false, mode = 'review', triageList = null, triageI = 0, triageShown = false, sessionDone = 0;

  App.genderClass = function (greek) { var g = App.genderOf(greek); return g === 'm' ? 'g-m' : g === 'f' ? 'g-f' : g === 'n' ? 'g-n' : ''; };

  /* an example sentence for a word: saved reading context first, then any graded text */
  App.exampleFor = function (w) {
    if (w.ctx) return {gr: w.ctx, en: null, src: w.src};
    var key = App.keyOf(w.greek); if (key.indexOf(' ') >= 0) return null;
    var di = App.getDeckIndex();
    var hits = [];
    App.texts.forEach(function (t) {
      t.paragraphs.forEach(function (para) {
        para.forEach(function (pair) {
          App.tokenize(pair[0]).forEach(function (tk) {
            if (!tk.w || hits.length > 6) return;
            var a = App.analyse(tk.w);
            if (a.best && a.best.deck === w) hits.push({gr: pair[0], en: pair[1], form: tk.w, src: t.title});
          });
        });
      });
    });
    if (!hits.length) return null;
    hits.sort(function (a, b) { return a.gr.length - b.gr.length; });
    return hits[Math.min(hits.length - 1, Math.floor(Math.random() * Math.min(3, hits.length)))];
  };
  function ctxHtml(ex, w) {
    if (!ex) return '';
    var s = esc(ex.gr);
    if (ex.form) s = s.replace(new RegExp('(^|[^\\u0370-\\u03ff\\u1f00-\\u1fff])(' + ex.form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\u0370-\\u03ff\\u1f00-\\u1fff])'), '$1<em>$2</em>');
    return '<div class="ctx">' + s + (ex.en ? '<div class="en">' + esc(ex.en) + '</div>' : '') + (ex.src ? '<div class="en muted">— ' + esc(ex.src) + '</div>' : '') + '</div>';
  }

  function pickNext() {
    var q = App.queue();
    // interleave: learning cards that are due first, then reviews and new cards mixed
    if (q.learn.length && S.cards[q.learn[0].greek].due <= Date.now()) return q.learn[0];
    var pool = [];
    if (q.rev.length) pool.push(q.rev[0]);
    if (q.nw.length) pool.push(q.nw[0]);
    if (pool.length === 2) return sessionDone % 4 === 3 ? pool[1] : pool[0];
    if (pool.length) return pool[0];
    if (q.learn.length) return q.learn[0];   // learn ahead a little rather than idling
    return null;
  }
  /* production (English → Greek) for words that are already settled */
  function isReverse(w) {
    var c = S.cards[w.greek];
    return S.settings.reverse && c && c.st === 'review' && c.ivl >= 7 && (c.reps % 2 === 1);
  }

  function counts() {
    var q = App.queue();
    return '<div class="counts"><span class="c-new" title="new">' + q.nw.length + ' new</span><span class="c-lrn" title="learning">' + q.learn.length + ' learning</span><span class="c-rev" title="due">' + q.rev.length + ' due</span></div>';
  }

  function render() {
    if (mode === 'triage') return renderTriage();
    cur = pickNext(); flipped = false;
    var head = '<div class="rv-top"><h1 style="margin:0">Review</h1><span class="spacer"></span>' + counts() + '</div>';
    if (!cur) {
      var q = App.queue();
      var d = App.day();
      if (d.rev && !d.done) { d.done = true; App.addXP(10); App.save(); App.toast('Reviews done for today'); }
      var newLeft = App.newOrder().length;
      root.innerHTML = head + '<div class="card empty"><div class="big">☀️</div><h2 style="margin-top:8px">Nothing due right now</h2>' +
        '<p class="muted">' + (d.rev ? 'You reviewed ' + d.rev + ' card' + (d.rev === 1 ? '' : 's') + ' today. ' : '') +
        (q.nextLearn < Infinity ? 'Next learning card in ' + u.fmtIvl((q.nextLearn - Date.now()) / 86400000) + '. ' : '') + '</p>' +
        '<div class="row" style="justify-content:center;margin-top:16px">' +
        (newLeft ? '<button class="btn" id="rv-more">Learn 5 more new words</button>' : '') +
        '<button class="btn" id="rv-tri">Quick sort words you already know</button>' +
        '<button class="btn pri" id="rv-read">Go read something</button></div></div>' + settingsHtml();
      bindSettings();
      $('#rv-read').onclick = function () { App.show('read'); };
      $('#rv-tri').onclick = startTriage;
      if ($('#rv-more')) $('#rv-more').onclick = function () { App.day().nw = Math.max(0, App.day().nw - 5); App.save(); render(); App.renderHud(); };
      App.renderHud();
      return;
    }
    var w = cur, rev = isReverse(w), st = App.cardState(w.greek);
    var kind = st === 'new' ? 'new word' : st === 'learn' ? 'learning' : rev ? 'English → Greek' : 'review';
    var front = rev ? '<div class="front en">' + esc(w.english) + '</div>' : '<div class="front ' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</div>';
    var typing = rev && S.settings.typing;
    root.innerHTML = head +
      '<div class="card flash" id="flash"><div class="kind">' + kind + (w.pos ? ' · ' + esc(w.pos) : '') + '</div>' +
      '<button class="btn sm ghost say" id="rv-say" title="Listen (S)">🔊</button>' +
      front +
      (typing ? '<input class="typed" id="rv-typed" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type in Greek" lang="el">' : '') +
      '<div class="back" id="rv-back" hidden></div>' +
      '<div class="reveal" id="rv-reveal"><button class="btn pri" id="rv-show">' + (typing ? 'Check' : 'Show answer') + '</button></div>' +
      '<div class="kbd"><kbd>Space</kbd> show · <kbd>1</kbd>–<kbd>4</kbd> grade · <kbd>S</kbd> listen</div></div>' + settingsHtml();
    bindSettings();
    $('#rv-say').onclick = function () { App.say(w.greek); };
    $('#rv-show').onclick = flip;
    if (typing) { var inp = $('#rv-typed'); inp.focus(); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); flip(); } }); }
    else if (!rev && S.settings.autoplay) App.say(w.greek);
  }

  function flip() {
    if (flipped || !cur) return;
    flipped = true;
    var w = cur, rev = isReverse(w);
    var back = $('#rv-back'), html = '';
    var typedEl = $('#rv-typed');
    if (rev) {
      html += '<div class="ans gr ' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</div>';
      if (typedEl) {
        var said = typedEl.value.trim(), target = App.keyOf(w.greek), saidK = App.keyOf(said);
        var verdict = saidK === target ? 'exact' : u.fold(saidK) === u.fold(target) ? 'accent' : 'wrong';
        typedEl.disabled = true;
        html += '<div class="diff">' + (verdict === 'exact' ? '<span class="ok">✓ ' + esc(said) + '</span>' : verdict === 'accent' ? '<span class="ok">' + esc(said) + '</span> <span class="small muted">· check the accent</span>' : (said ? '<span class="bad">' + esc(said) + '</span>' : '<span class="muted small">(no answer)</span>')) + '</div>';
      }
      App.say(w.greek);
    } else {
      html += '<div class="ans">' + esc(w.english) + '</div>';
    }
    var c = S.cards[w.greek];
    html += '<div class="meta">' + esc(w.pos || '') + (w.date && w.date !== '-' ? ' · lesson ' + esc(w.date) : '') + (w.added ? ' · added while reading' : '') + (c && c.lapses ? ' · forgotten ' + c.lapses + '×' : '') + '</div>';
    html += ctxHtml(App.exampleFor(w), w);
    html += '<div class="grade">' + [['again', 1, 'Again'], ['hard', 2, 'Hard'], ['good', 3, 'Good'], ['easy', 4, 'Easy']].map(function (g) {
      return '<button class="' + g[0] + '" data-g="' + g[1] + '">' + g[2] + '<small>' + App.nextLabel(w.greek, g[1]) + '</small></button>';
    }).join('') + '</div>';
    back.innerHTML = html; back.hidden = false;
    $('#rv-reveal').hidden = true;
    u.$$('.grade button', back).forEach(function (b) { b.onclick = function () { grade(+b.dataset.g); }; });
  }
  function grade(g) {
    if (!cur || !flipped) return;
    var rev = isReverse(cur);
    App.answer(cur.greek, g);
    sessionDone++;
    App.addXP(g > 1 ? (rev ? 2 : 1) : 0);
    App.renderHud();
    render();
  }

  /* ---- quick sort (triage): mark words you still know so they skip the new-card queue ---- */
  function startTriage() {
    mode = 'triage';
    triageList = App.newOrder().slice(0, 400);
    triageI = 0; triageShown = false;
    render();
  }
  function renderTriage() {
    var w = triageList[triageI];
    var head = '<div class="rv-top"><h1 style="margin:0">Quick sort</h1><span class="spacer"></span><span class="muted small">' + triageI + ' / ' + triageList.length + '</span><button class="btn sm" id="tr-stop">Done</button></div>' +
      '<p class="sub">Go through words from your list fast. Say the meaning in your head, then reveal. Words you know get scheduled for a check-up in 1–4 weeks; the rest become new cards, first in line.</p>';
    if (!w) { mode = 'review'; App.toast('Sorted ' + triageI + ' words'); return render(); }
    root.innerHTML = head + '<div class="card flash triage"><button class="btn sm ghost say" id="tr-say">🔊</button>' +
      '<div class="front ' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</div>' +
      '<div class="back" id="tr-back"' + (triageShown ? '' : ' hidden') + '><div class="ans">' + esc(w.english) + '</div></div>' +
      (triageShown ? '' : '<div class="reveal"><button class="btn" id="tr-show">Reveal</button></div>') +
      '<div class="grade"><button class="again" data-k="0">Didn’t know<small>← </small></button><button class="good" data-k="1">Knew it<small>→</small></button></div>' +
      '<div class="kbd"><kbd>Space</kbd> reveal · <kbd>←</kbd> didn’t know · <kbd>→</kbd> knew it</div></div>';
    $('#tr-stop').onclick = function () { mode = 'review'; render(); App.renderHud(); };
    $('#tr-say').onclick = function () { App.say(w.greek); };
    if ($('#tr-show')) $('#tr-show').onclick = function () { triageShown = true; renderTriage(); };
    u.$$('.grade button', root).forEach(function (b) { b.onclick = function () { triage(+b.dataset.k); }; });
  }
  function triage(knew) {
    var w = triageList[triageI]; if (!w) return;
    var c = App.card(w.greek);
    if (knew) {
      var ivl = 7 + Math.floor(Math.random() * 22);
      Object.assign(c, {st: 'review', ivl: ivl, ease: 2.5, due: Date.now() + ivl * 86400000, reps: 1});
    } else {
      c.prio = triageI;
    }
    c.mt = Date.now();
    App.save();
    triageI++; triageShown = false;
    renderTriage();
  }

  /* ---- settings ---- */
  function settingsHtml() {
    var st = S.settings;
    return '<details class="card" style="margin-top:18px"><summary style="cursor:pointer;font-weight:600">Review settings</summary>' +
      '<div class="grid g2" style="margin-top:10px">' +
      '<div><label class="f">New words per day</label><select id="set-new">' + [5, 10, 15, 20, 30].map(function (n) { return '<option' + (st.newPerDay === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">New-word order</label><select id="set-order"><option value="freq"' + (st.order === 'freq' ? ' selected' : '') + '>Most common words first</option><option value="lesson"' + (st.order === 'lesson' ? ' selected' : '') + '>By lesson date</option></select></div>' +
      '<div><label class="f">English → Greek cards</label><select id="set-rev"><option value="1"' + (st.reverse ? ' selected' : '') + '>Mix in for settled words</option><option value="0"' + (!st.reverse ? ' selected' : '') + '>Off</option></select></div>' +
      '<div><label class="f">Answer English → Greek by</label><select id="set-type"><option value="0"' + (!st.typing ? ' selected' : '') + '>Saying it in my head</option><option value="1"' + (st.typing ? ' selected' : '') + '>Typing (Greek keyboard)</option></select></div>' +
      '<div><label class="f">Auto-play pronunciation</label><select id="set-auto"><option value="1"' + (st.autoplay ? ' selected' : '') + '>On</option><option value="0"' + (!st.autoplay ? ' selected' : '') + '>Off</option></select></div>' +
      '<div><label class="f">Speech speed</label><select id="set-rate">' + [[0.7, 'Slow'], [0.9, 'Relaxed'], [1, 'Normal']].map(function (r) { return '<option value="' + r[0] + '"' + (st.rate === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></div>' +
      '</div>' + (App.hasVoice() ? '' : '<p class="small muted">No Greek voice found in this browser, so audio is off. On a Mac, Chrome and Safari use the built-in “Melina” voice.</p>') + '</details>';
  }
  function bindSettings() {
    var st = S.settings;
    function on(id, fn) { var e = $(id); if (e) e.onchange = function () { fn(e.value); App.save(); App.renderHud(); }; }
    on('#set-new', function (v) { st.newPerDay = +v; });
    on('#set-order', function (v) { st.order = v; });
    on('#set-rev', function (v) { st.reverse = v === '1'; });
    on('#set-type', function (v) { st.typing = v === '1'; });
    on('#set-auto', function (v) { st.autoplay = v === '1'; });
    on('#set-rate', function (v) { st.rate = +v; });
  }

  document.addEventListener('keydown', function (e) {
    if (App.current !== 'review' || e.metaKey || e.ctrlKey || e.altKey) return;
    var typing = e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT';
    if (mode === 'triage') {
      if (e.key === ' ') { e.preventDefault(); triageShown = true; renderTriage(); }
      else if (e.key === 'ArrowLeft') triage(0);
      else if (e.key === 'ArrowRight') triage(1);
      return;
    }
    if (typing && !flipped) return;
    if (e.key === ' ' || e.key === 'Enter') { if (!flipped) { e.preventDefault(); flip(); } else if (e.key === ' ') { e.preventDefault(); grade(3); } }
    else if (/^[1-4]$/.test(e.key) && flipped) grade(+e.key);
    else if ((e.key === 's' || e.key === 'σ') && cur && !typing) App.say(cur.greek);
  });

  App.views.review = function (arg) { if (arg === 'triage') startTriage(); else { mode = mode === 'triage' && triageList ? 'triage' : 'review'; render(); } };
})();
