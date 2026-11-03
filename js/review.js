/* Review: spaced-repetition flashcards, plus a fast "sort what I already know" mode. */
'use strict';
(function () {
  var u = App.u, S = App.S, $ = u.$, esc = u.esc;
  var root = $('#v-review');
  var cur = null, flipped = false, mode = 'review', triageList = null, triageI = 0, triageShown = false, sessionDone = 0;
  var posF = 'all', ahead = false, sp = null, prac = null, waitTimer = null;

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

  function inF(w) { return App.posMatch(w, posF); }
  function pickNext() {
    var q = App.queue(inF);
    // interleave: learning cards that are due first, then reviews and new cards mixed
    if (q.learn.length && S.cards[q.learn[0].greek].due <= Date.now()) return q.learn[0];
    var pool = [];
    if (q.rev.length) pool.push(q.rev[0]);
    if (q.nw.length) pool.push(q.nw[0]);
    if (pool.length === 2) return sessionDone % 4 === 3 ? pool[1] : pool[0];
    if (pool.length) return pool[0];
    if (ahead) return q.learn[0] || q.later[0] || null;   // only when asked: go through learning cards before they're due
    return null;
  }
  /* production (English → Greek), mixed in for words you've reviewed before */
  function isReverse(w) {
    var c = S.cards[w.greek], r = S.settings.reverse;
    return !!r && c && c.st === 'review' && c.ivl >= (r === 'all' ? 1 : 7) && (c.reps % 2 === 1);
  }
  /* the day's reviews count as done once nothing is due and no new cards are left; learning cards may still come back */
  function markDone() {
    var q = App.queue(), d = App.day();
    if (d.rev && !d.done && !q.rev.length && !q.nw.length) { d.done = true; App.addXP(10); App.save(); App.toast('Reviews done for today'); }
    return d.done;
  }

  function counts(q) {
    return '<div class="counts"><span class="c-new" title="new">' + q.nw.length + ' new</span><span class="c-lrn" title="learning">' + q.learn.length + ' learning</span><span class="c-rev" title="due">' + q.rev.length + ' due</span></div>';
  }
  /* word-type chips with how many cards of each type are waiting */
  function posChips() {
    var now = Date.now(), n = {}, nn = {}, newLeft = Math.max(0, S.settings.newPerDay - App.day().nw), all = 0;
    App.words.forEach(function (w) {
      var c = S.cards[w.greek]; if (!c || c.sus) return;
      if ((c.st === 'learn' && c.due <= now + 60000) || (c.st === 'review' && c.due <= now)) { var g = App.posOf(w); n[g] = (n[g] || 0) + 1; all++; }
    });
    if (newLeft) { var no = App.newOrder(); no.forEach(function (w) { var g = App.posOf(w); nn[g] = (nn[g] || 0) + 1; }); all += Math.min(newLeft, no.length); }
    Object.keys(nn).forEach(function (g) { n[g] = (n[g] || 0) + Math.min(newLeft, nn[g]); });
    n.all = all;
    return '<div class="chips rv-pos" id="rv-pos">' + App.POS_GROUPS.map(function (p) {
      if (p[0] === 'other' && !n.other && posF !== 'other') return '';
      return '<button data-p="' + p[0] + '"' + (posF === p[0] ? ' class="on"' : '') + '>' + p[1] + (n[p[0]] ? ' <small>' + n[p[0]] + '</small>' : '') + '</button>';
    }).join('') + '</div>';
  }
  function bindChips() {
    u.$$('#rv-pos button').forEach(function (b) { b.onclick = function () { posF = b.dataset.p; ahead = false; if (mode === 'practice') startPractice(); else render(); }; });
  }

  /* English → Greek: the answer box (tiles, typing, or nothing when you say it in your head) and checking it */
  function enInput() {
    var m = S.settings.typing;
    return m === 'tiles' ? '<div class="sp" id="rv-sp"></div>' : m ? '<input class="typed" id="rv-typed" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="type in Greek" lang="el">' : '';
  }
  function enSetup(w, onEnter) {
    sp = null;
    if (S.settings.typing === 'tiles') sp = App.spell($('#rv-sp'), w);
    else if (S.settings.typing) { var inp = $('#rv-typed'); inp.focus(); inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }); }
  }
  /* returns {html, ok}; ok is null when there was nothing to check */
  function enCheck(w) {
    var html = '<div class="ans gr ' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</div>', ok = null, typedEl = $('#rv-typed');
    if (sp) {
      var r = sp.result(); sp.lock(); ok = r.ok;
      html += '<div class="diff">' + (r.ok ? '<span class="ok">✓ right' + (r.hints ? ', with ' + r.hints + ' hint' + (r.hints === 1 ? '' : 's') : '') + '</span>' :
        !r.lettersOk ? '<span class="bad">' + esc(r.said) + '</span>' : '<span class="small muted">the letters are right, the article isn’t</span>') + '</div>';
      if (r.ok && r.hints) ok = 'hint';
    } else if (typedEl) {
      var said = typedEl.value.trim(), target = App.keyOf(w.greek), saidK = App.keyOf(said);
      var verdict = saidK === target ? 'exact' : u.fold(saidK) === u.fold(target) ? 'accent' : 'wrong';
      typedEl.disabled = true;
      ok = verdict === 'exact' ? true : verdict === 'accent' ? 'hint' : false;
      html += '<div class="diff">' + (verdict === 'exact' ? '<span class="ok">✓ ' + esc(said) + '</span>' : verdict === 'accent' ? '<span class="ok">' + esc(said) + '</span> <span class="small muted">· check the accent</span>' : (said ? '<span class="bad">' + esc(said) + '</span>' : '<span class="muted small">(no answer)</span>')) + '</div>';
    }
    App.say(w.greek);
    return {html: html, ok: ok};
  }

  function render() {
    if (mode === 'triage') return renderTriage();
    if (mode === 'practice') return renderPractice();
    clearTimeout(waitTimer);
    cur = pickNext(); flipped = false; sp = null;
    var q = App.queue(inF), done = markDone();
    var head = '<div class="rv-top"><h1 style="margin:0">Review</h1><span class="spacer"></span>' + counts(q) + '</div>' + posChips();
    if (!cur) {
      var d = App.day(), allQ = posF === 'all' ? q : App.queue();
      var what = App.posName(posF, 2);
      var newLeft = App.newOrder().filter(inF).length;
      var met = App.words.filter(function (w) { return inF(w) && App.cardState(w.greek) !== 'new'; }).length;
      var title = posF !== 'all' ? 'No ' + what + ' due right now' : done ? 'That’s all for today' : 'Nothing due right now';
      root.innerHTML = head + '<div class="card empty"><div class="big">☀️</div><h2 style="margin-top:8px">' + title + '</h2>' +
        '<p class="muted">' + (d.rev ? 'You reviewed ' + d.rev + ' card' + (d.rev === 1 ? '' : 's') + ' today. ' : '') +
        (q.later.length ? q.later.length + ' card' + (q.later.length === 1 ? ' is' : 's are') + ' still being learned; the next one comes back in ' + u.fmtIvl(Math.max(0, q.nextLearn - Date.now()) / 86400000) + '. ' : '') +
        (posF !== 'all' && allQ.learn.length + allQ.rev.length + allQ.nw.length ? allQ.learn.length + allQ.rev.length + allQ.nw.length + ' other cards are waiting under All. ' : '') + '</p>' +
        '<div class="row" style="justify-content:center;margin-top:16px">' +
        (q.learn.length + q.later.length ? '<button class="btn" id="rv-ahead">Go through the learning cards now</button>' : '') +
        (met >= 4 ? '<button class="btn" id="rv-prac">Practise ' + Math.min(20, met) + ' ' + what + ' you’ve met</button>' : '') +
        (newLeft ? '<button class="btn" id="rv-more">Learn 5 more new ' + what + '</button>' : '') +
        (posF === 'all' ? '<button class="btn" id="rv-tri">Quick sort words you already know</button>' : '<button class="btn" id="rv-all">Back to all words</button>') +
        '<button class="btn pri" id="rv-read">Go read something</button></div>' +
        (met >= 4 ? '<p class="small muted" style="margin-top:14px">Practice goes through words you find hard, and doesn’t change when they’re next due.</p>' : '') + '</div>' + settingsHtml();
      bindSettings(); bindChips();
      $('#rv-read').onclick = function () { App.show('read'); };
      if ($('#rv-tri')) $('#rv-tri').onclick = startTriage;
      if ($('#rv-all')) $('#rv-all').onclick = function () { posF = 'all'; render(); };
      if ($('#rv-ahead')) $('#rv-ahead').onclick = function () { ahead = true; render(); };
      if ($('#rv-prac')) $('#rv-prac').onclick = startPractice;
      if ($('#rv-more')) $('#rv-more').onclick = function () { App.day().nw = Math.max(0, App.day().nw - 5); App.save(); render(); App.renderHud(); };
      // a learning card due soon: show it when it's ready, if this screen is still open
      if (q.nextLearn - Date.now() < 15 * 60000) waitTimer = setTimeout(function () { if (App.current === 'review' && mode === 'review' && !cur) render(); }, Math.max(1000, q.nextLearn - Date.now() + 500));
      App.renderHud();
      return;
    }
    var w = cur, rev = isReverse(w), st = App.cardState(w.greek);
    var kind = st === 'new' ? 'new word' : st === 'learn' ? 'learning' : rev ? 'English → Greek' : 'review';
    var front = rev ? '<div class="front en">' + esc(w.english) + '</div>' : '<div class="front ' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</div>';
    var note = done && st === 'learn' ? '<div class="rv-note">Today’s reviews are done. The cards left are ones you’re still learning; if you stop now they wait for next time. <button class="btn sm" id="rv-stop">Stop here</button></div>' : '';
    root.innerHTML = head + note +
      '<div class="card flash" id="flash"><div class="kind">' + kind + (w.pos ? ' · ' + esc(w.pos) : '') + '</div>' +
      (rev ? '' : '<button class="btn sm ghost say" id="rv-say" title="Listen (S)">🔊</button>') +
      front + (rev ? enInput() : '') +
      '<div class="back" id="rv-back" hidden></div>' +
      '<div class="reveal" id="rv-reveal"><button class="btn pri" id="rv-show">' + (rev && S.settings.typing ? 'Check' : 'Show answer') + '</button></div>' +
      '<div class="kbd">' + (rev && S.settings.typing === 'tiles' ? 'type with a Greek or Latin keyboard · <kbd>Enter</kbd> check · ' : '<kbd>Space</kbd> show · ') + '<kbd>1</kbd>–<kbd>4</kbd> grade' + (rev ? '' : ' · <kbd>S</kbd> listen') + '</div></div>' + settingsHtml();
    bindSettings(); bindChips();
    if ($('#rv-stop')) $('#rv-stop').onclick = function () { ahead = false; App.show('today'); };
    if ($('#rv-say')) $('#rv-say').onclick = function () { App.say(w.greek); };
    $('#rv-show').onclick = flip;
    if (rev) enSetup(w, flip);
    else if (S.settings.autoplay) App.say(w.greek);
  }

  function flip() {
    if (flipped || !cur) return;
    flipped = true;
    var w = cur, rev = isReverse(w);
    var back = $('#rv-back'), html = '', sug = 0;
    if (rev) {
      var r = enCheck(w); html += r.html;
      sug = r.ok === true ? 3 : r.ok === 'hint' ? 2 : r.ok === false ? 1 : 0;
    } else {
      html += '<div class="ans">' + esc(w.english) + '</div>';
    }
    var c = S.cards[w.greek];
    html += '<div class="meta">' + esc(w.pos || '') + (w.date && w.date !== '-' ? ' · lesson ' + esc(w.date) : '') + (w.added ? ' · added while reading' : '') + (c && c.lapses ? ' · forgotten ' + c.lapses + '×' : '') + '</div>';
    html += ctxHtml(App.exampleFor(w), w);
    html += '<div class="grade">' + [['again', 1, 'Again'], ['hard', 2, 'Hard'], ['good', 3, 'Good'], ['easy', 4, 'Easy']].map(function (g) {
      return '<button class="' + g[0] + (g[1] === sug ? ' sug' : '') + '" data-g="' + g[1] + '">' + g[2] + '<small>' + App.nextLabel(w.greek, g[1]) + '</small></button>';
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

  /* ---- practice: go over words you've met, of one type if you like, without touching the schedule ---- */
  function startPractice() {
    var pool = App.words.filter(function (w) { var c = S.cards[w.greek]; return inF(w) && App.cardState(w.greek) !== 'new' && !(c && c.sus); });
    // the hardest first: forgotten often, short interval, still learning; with some randomness so rounds differ
    var list = pool.map(function (w) { var c = S.cards[w.greek]; return [c.lapses * 2 - Math.log(1 + c.ivl) + (c.st === 'learn' ? 2 : 0) + Math.random() * 2, w]; })
      .sort(function (a, b) { return b[0] - a[0]; }).slice(0, 20).map(function (x) { return x[1]; });
    prac = {list: u.shuffle(list), i: 0, log: [], again: {}, shown: false, n: list.length};
    mode = 'practice'; render();
  }
  function renderPractice() {
    var w = prac.list[prac.i], dir = S.settings.pracDir || 'gr';
    var head = '<div class="rv-top"><h1 style="margin:0">Practice</h1><span class="spacer"></span><span class="muted small">' + Math.min(prac.i, prac.list.length) + ' / ' + prac.list.length + '</span><button class="btn sm" id="pr-stop">' + (w ? 'Stop' : 'Back to review') + '</button></div>' + posChips() +
      '<div class="chips" id="pr-dir" style="margin:-4px 0 12px">' + [['gr', 'Greek → English'], ['en', 'English → Greek']].map(function (d) { return '<button data-d="' + d[0] + '"' + (dir === d[0] ? ' class="on"' : '') + '>' + d[1] + '</button>'; }).join('') + '</div>';
    if (!w) {
      var right = prac.log.filter(function (x) { return x.ok; }).length;
      root.innerHTML = head + '<div class="card result"><div class="big">' + right + ' / ' + prac.log.length + '</div><p class="muted">known the first time</p>' +
        App.resultList(prac.log) + '<div class="row" style="justify-content:center;margin-top:16px"><button class="btn pri" id="pr-again">Another round</button></div></div>';
      bindPractice();
      $('#pr-again').onclick = startPractice;
      return;
    }
    var en = dir === 'en';
    root.innerHTML = head + '<div class="card flash"><div class="kind">practice' + (prac.again[w.greek] === 2 ? ' · again' : '') + (w.pos ? ' · ' + esc(w.pos) : '') + '</div>' +
      (en ? '' : '<button class="btn sm ghost say" id="pr-say">🔊</button>') +
      (en ? '<div class="front en">' + esc(w.english) + '</div>' + enInput() : '<div class="front ' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</div>') +
      '<div class="back" id="pr-back" hidden></div>' +
      '<div class="reveal" id="pr-reveal"><button class="btn pri" id="pr-show">' + (en && S.settings.typing ? 'Check' : 'Show answer') + '</button></div>' +
      '<div class="kbd"><kbd>' + (en && S.settings.typing ? 'Enter' : 'Space') + '</kbd> show · <kbd>←</kbd> didn’t know · <kbd>→</kbd> knew it</div></div>';
    bindPractice();
    if ($('#pr-say')) $('#pr-say').onclick = function () { App.say(w.greek); };
    $('#pr-show').onclick = pracShow;
    if (en) enSetup(w, pracShow); else if (S.settings.autoplay) App.say(w.greek);
  }
  function bindPractice() {
    bindChips();
    $('#pr-stop').onclick = function () { mode = 'review'; render(); };
    u.$$('#pr-dir button').forEach(function (b) { b.onclick = function () { S.settings.pracDir = b.dataset.d; App.save(); renderPractice(); }; });
  }
  function pracShow() {
    if (prac.shown) return;
    prac.shown = true;
    var w = prac.list[prac.i], html = '', sug = null;
    if ((S.settings.pracDir || 'gr') === 'en') { var r = enCheck(w); html = r.html; sug = r.ok == null ? null : r.ok === true; }
    else html = '<div class="ans">' + esc(w.english) + '</div>';
    html += ctxHtml(App.exampleFor(w), w);
    html += '<div class="grade two"><button class="again' + (sug === false ? ' sug' : '') + '" data-k="0">Didn’t know</button><button class="good' + (sug === true ? ' sug' : '') + '" data-k="1">Knew it</button></div>';
    var back = $('#pr-back'); back.innerHTML = html; back.hidden = false; $('#pr-reveal').hidden = true;
    u.$$('.grade button', back).forEach(function (b) { b.onclick = function () { pracAnswer(+b.dataset.k); }; });
  }
  function pracAnswer(knew) {
    var w = prac.list[prac.i]; if (!w || !prac.shown) return;
    if (!prac.again[w.greek]) {
      prac.log.push({ok: !!knew, gr: w.greek, en: w.english, cls: App.genderClass(w.greek)});
      if (knew) App.addXP(1);
    }
    // a word you didn't know comes back once at the end of the round
    if (!knew && !prac.again[w.greek]) { prac.again[w.greek] = 2; prac.list.push(w); } else prac.again[w.greek] = prac.again[w.greek] || 1;
    var d = App.day(); d.prac = (d.prac || 0) + 1; App.save();
    prac.i++; prac.shown = false;
    renderPractice();
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
      '<div><label class="f">English → Greek cards</label><select id="set-rev">' + [['0', 'Off'], ['1', 'Mixed in for words known a week or more'], ['all', 'Mixed in for every word past learning']].map(function (o) { return '<option value="' + o[0] + '"' + (String(st.reverse === true ? 1 : st.reverse || 0) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">Answer English → Greek by</label><select id="set-type">' + [['0', 'Saying it in my head'], ['tiles', 'Picking the letters'], ['1', 'Typing (Greek keyboard)']].map(function (o) { return '<option value="' + o[0] + '"' + (String(st.typing === true ? 1 : st.typing || 0) === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></div>' +
      '<div><label class="f">Auto-play pronunciation</label><select id="set-auto"><option value="1"' + (st.autoplay ? ' selected' : '') + '>On</option><option value="0"' + (!st.autoplay ? ' selected' : '') + '>Off</option></select></div>' +
      '<div><label class="f">Speech speed</label><select id="set-rate">' + [[0.7, 'Slow'], [0.9, 'Relaxed'], [1, 'Normal']].map(function (r) { return '<option value="' + r[0] + '"' + (st.rate === r[0] ? ' selected' : '') + '>' + r[1] + '</option>'; }).join('') + '</select></div>' +
      '</div>' + (App.hasVoice() ? '' : '<p class="small muted">No Greek voice found in this browser, so audio is off. On a Mac, Chrome and Safari use the built-in “Melina” voice.</p>') + '</details>';
  }
  function bindSettings() {
    var st = S.settings;
    function on(id, fn) { var e = $(id); if (e) e.onchange = function () { fn(e.value); App.save(); App.renderHud(); }; }
    on('#set-new', function (v) { st.newPerDay = +v; });
    on('#set-order', function (v) { st.order = v; });
    on('#set-rev', function (v) { st.reverse = v === 'all' ? 'all' : v === '1'; render(); });
    on('#set-type', function (v) { st.typing = v === 'tiles' ? 'tiles' : v === '1'; render(); });
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
    if (mode === 'practice') {
      if (!prac || !prac.list[prac.i]) return;
      if (!prac.shown) { if (App.spellBusy()) { if (e.key === 'Enter') { e.preventDefault(); pracShow(); } } else if (!typing && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); pracShow(); } }
      else if (e.key === 'ArrowLeft') pracAnswer(0);
      else if (e.key === 'ArrowRight') pracAnswer(1);
      return;
    }
    if (!flipped && App.spellBusy()) { if (e.key === 'Enter') { e.preventDefault(); flip(); } return; }
    if (typing && !flipped) return;
    if (e.key === ' ' || e.key === 'Enter') { if (!flipped) { e.preventDefault(); flip(); } else if (e.key === ' ') { e.preventDefault(); grade(3); } }
    else if (/^[1-4]$/.test(e.key) && flipped) grade(+e.key);
    else if ((e.key === 's' || e.key === 'σ') && cur && !typing) App.say(cur.greek);
  });

  App.views.review = function (arg) { if (arg === 'triage') startTriage(); else { if (mode === 'triage' && !triageList) mode = 'review'; render(); } };
})();
