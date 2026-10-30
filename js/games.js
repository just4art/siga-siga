/* Play: five short games, each aimed at a different part of Greek. All of them draw on your own word list. */
'use strict';
(function () {
  var u = App.u, S = App.S, $ = u.$, $$ = u.$$, esc = u.esc;
  var root = $('#v-play');
  var timer = null, keyHandler = null;

  var GAMES = [
    {id: 'art', icon: 'ο η το', name: 'Ο, η, το?', desc: 'Sixty seconds. Give each noun its article. Wrong answers cost three seconds.', start: artGame},
    {id: 'stress', icon: 'ά', name: 'Where’s the stress?', desc: 'The accent marks are gone. Tap the vowel that carries the stress. Ten words.', start: stressGame},
    {id: 'listen', icon: '🔊', name: 'Listen', desc: 'Hear a word, pick its meaning. Ten words, trains your ear for real speech.', start: listenGame},
    {id: 'conj', icon: 'είπα', name: 'Verb forms', desc: 'Pick the right form: εσύ in the past, εμείς in the future… Twelve rounds with your verbs.', start: conjGame},
    {id: 'build', icon: '⇄', name: 'Build the sentence', desc: 'Put the words in order, using sentences from the stories. Six sentences.', start: buildGame}
  ];

  function stop() { clearInterval(timer); timer = null; if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = null; App.hush(); }
  function onKey(fn) { if (keyHandler) document.removeEventListener('keydown', keyHandler); keyHandler = function (e) { if (App.current === 'play' && !e.metaKey && !e.ctrlKey) fn(e); }; document.addEventListener('keydown', keyHandler); }

  function hub() {
    stop();
    root.innerHTML = '<h1>Play</h1><p class="sub">Short games for the parts of Greek that flashcards don’t cover well: articles, stress, listening, verb forms and word order. One game a day completes the daily plan.</p><div class="games">' +
      GAMES.map(function (g) {
        var best = S.games[g.id];
        return '<button class="gcard" data-g="' + g.id + '"><span class="gi gr">' + esc(g.icon) + '</span><b>' + esc(g.name) + '</b><span>' + esc(g.desc) + '</span><span class="best">' + (best != null ? 'Best: ' + best : 'Not played yet') + '</span></button>';
      }).join('') + '</div>';
    $$('.gcard', root).forEach(function (b) { b.onclick = function () { GAMES.find(function (g) { return g.id === b.dataset.g; }).start(); }; });
  }
  function stage(g, inner) {
    root.innerHTML = '<div class="stage"><div class="ghead"><button class="btn sm ghost" id="g-back">← Games</button><h2>' + esc(g.name) + '</h2></div>' + inner + '</div>';
    $('#g-back').onclick = hub;
  }
  function result(g, score, xp, lines) {
    stop();
    var prev = S.games[g.id], best = prev == null || score > prev;
    if (best) S.games[g.id] = score;
    App.day().games++;
    App.addXP(Math.min(40, xp));
    App.save();
    stage(g, '<div class="card result"><div class="big">' + score + '</div><p class="muted">' + (best && prev != null ? 'New best! (was ' + prev + ')' : prev != null ? 'Best: ' + prev : 'First score') + ' · +' + Math.min(40, xp) + ' XP</p>' +
      (lines || '') + '<div class="row" style="justify-content:center;margin-top:16px"><button class="btn" id="g-hub">All games</button><button class="btn pri" id="g-again">Play again</button></div></div>');
    $('#g-hub').onclick = hub; $('#g-again').onclick = g.start;
  }
  function seenWeight(w) { var st = App.cardState(w.greek); return st === 'new' ? 1 : st === 'learn' ? 3 : 2; }
  function weighted(list, n) {
    var pool = list.map(function (w) { return [Math.random() * seenWeight(w), w]; }).sort(function (a, b) { return b[0] - a[0]; });
    return pool.slice(0, n).map(function (x) { return x[1]; });
  }
  function single(w) { return App.keyOf(w.greek).indexOf(' ') < 0; }

  /* ---------------- 1. articles ---------------- */
  function artGame() {
    var g = GAMES[0];
    var nouns = App.words.filter(function (w) { return /^(ο|η|το) \S+$/.test(w.greek); });
    if (nouns.length < 10) return stage(g, '<p>Not enough nouns with articles in your list yet.</p>');
    var deck = u.shuffle(nouns), i = 0, score = 0, streak = 0, left = 60, missed = [], lock = false;
    stage(g, '<div class="timer"><i id="a-t" style="width:100%"></i></div><div class="gscore"><span>Score <b id="a-s">0</b></span><span>Streak <b id="a-k">0</b></span><span class="spacer"></span><span><b id="a-l">60</b>s</span></div>' +
      '<div class="bigword" id="a-w"></div><div class="hint" id="a-h"></div>' +
      '<div class="choices c3 art"><button class="m" data-a="ο">ο</button><button class="f" data-a="η">η</button><button class="n" data-a="το">το</button></div><div class="kbd"><kbd>1</kbd> ο · <kbd>2</kbd> η · <kbd>3</kbd> το</div>');
    function show() { var w = deck[i % deck.length]; $('#a-w').textContent = App.keyOf(w.greek); $('#a-h').textContent = w.english; lock = false; }
    function answer(a) {
      if (lock || left <= 0) return;
      var w = deck[i % deck.length], right = w.greek.split(' ')[0];
      var bw = $('#a-w');
      if (a === right) { streak++; score += 1 + (streak >= 5 ? 1 : 0); bw.className = 'bigword flashfb ' + App.genderClass(w.greek); }
      else { streak = 0; left = Math.max(0, left - 3); missed.push(w); bw.className = 'bigword flashfb'; bw.innerHTML = '<span class="' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</span>'; }
      $('#a-s').textContent = score; $('#a-k').textContent = streak;
      lock = true; i++;
      setTimeout(function () { $('#a-w').className = 'bigword'; if (left > 0) show(); }, a === right ? 260 : 1100);
    }
    $$('.art button', root).forEach(function (b) { b.onclick = function () { answer(b.dataset.a); }; });
    onKey(function (e) { var m = {'1': 'ο', '2': 'η', '3': 'το'}[e.key]; if (m) answer(m); });
    show();
    timer = setInterval(function () {
      left -= 0.25; $('#a-t').style.width = Math.max(0, left / 60 * 100) + '%'; $('#a-l').textContent = Math.max(0, Math.ceil(left));
      if (left <= 0) {
        var uniq = []; missed.forEach(function (w) { if (uniq.indexOf(w) < 0) uniq.push(w); });
        result(g, score, score, uniq.length ? '<p class="small muted">To look at again:</p><p class="gr" style="font-size:18px">' + uniq.slice(0, 12).map(function (w) { return '<span class="' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</span>'; }).join(' · ') + '</p>' : '<p>No mistakes!</p>');
      }
    }, 250);
  }

  /* ---------------- 2. stress ---------------- */
  var VOW = 'αεηιουωάέήίόύώϊϋΐΰ', ACC = 'άέήίόύώΐΰ';
  var DIGRAPH = ['αι', 'αί', 'ει', 'εί', 'οι', 'οί', 'υι', 'υί', 'ου', 'ού', 'αυ', 'αύ', 'ευ', 'εύ', 'ηυ', 'ηύ'];
  function units(word) {
    // split a word into consonant runs and vowel units (diphthongs like αι, ει, οι, ου, αυ, ευ count as one)
    var out = [], ch = word.toLowerCase().split('');
    for (var i = 0; i < ch.length; i++) {
      var c = ch[i];
      if (VOW.indexOf(c) < 0) { if (out.length && !out[out.length - 1].v) out[out.length - 1].t += word[i]; else out.push({t: word[i], v: false}); continue; }
      var n = ch[i + 1], unit = word[i], acc = ACC.indexOf(c) >= 0;
      if (n && DIGRAPH.indexOf(c + n) >= 0) { unit += word[i + 1]; acc = ACC.indexOf(n) >= 0; i++; }
      out.push({t: unit, v: true, acc: acc});
    }
    return out;
  }
  function noAcc(s) { return s.normalize('NFD').replace(/́/g, '').normalize('NFC'); }
  function stressGame() {
    var g = GAMES[1];
    var pool = App.words.filter(function (w) {
      if (!single(w)) return false;
      var k = App.keyOf(w.greek), us = units(k);
      return us.filter(function (x) { return x.v; }).length >= 2 && us.filter(function (x) { return x.acc; }).length === 1;
    });
    var list = weighted(pool, 10), i = 0, right = 0, miss = [];
    if (list.length < 5) return stage(g, '<p>Not enough words yet.</p>');
    stage(g, '<div class="gscore"><span>Word <b id="s-i">1</b> / ' + list.length + '</span><span>Correct <b id="s-r">0</b></span></div><div class="syl" id="s-w"></div><div class="hint" id="s-h"></div><div class="row" style="justify-content:center;margin-top:18px"><button class="btn" id="s-next" hidden>Next →</button></div>');
    function show() {
      var w = list[i], k = App.keyOf(w.greek), us = units(k);
      $('#s-i').textContent = i + 1;
      $('#s-h').textContent = w.english;
      $('#s-next').hidden = true;
      $('#s-w').innerHTML = (w.greek !== k ? '<span class="muted" style="margin-right:10px">' + esc(w.greek.slice(0, w.greek.length - k.length).trim()) + '</span>' : '') +
        us.map(function (x, j) { return x.v ? '<button data-j="' + j + '">' + esc(noAcc(x.t)) + '</button>' : '<span>' + esc(x.t) + '</span>'; }).join('');
      $$('#s-w button').forEach(function (b) {
        b.onclick = function () {
          if ($('#s-w').dataset.done === '1') return;
          $('#s-w').dataset.done = '1';
          var j = +b.dataset.j, ok = us[j].acc;
          if (ok) { right++; b.classList.add('right'); b.textContent = us[j].t; }
          else { miss.push(w); b.classList.add('wrong'); var rb = $$('#s-w button').find(function (x) { return us[+x.dataset.j].acc; }); rb.classList.add('right'); rb.textContent = us[+rb.dataset.j].t; }
          $('#s-r').textContent = right;
          App.say(k);
          $('#s-next').hidden = false; $('#s-next').focus();
        };
      });
      $('#s-w').dataset.done = '0';
    }
    $('#s-next').onclick = function () { i++; if (i >= list.length) return result(g, right * 10, right * 2, miss.length ? '<p class="small muted">Missed:</p><p class="gr" style="font-size:18px">' + miss.map(function (w) { return esc(w.greek); }).join(' · ') + '</p>' : '<p>Perfect round!</p>'); show(); };
    onKey(function (e) { if ((e.key === 'Enter' || e.key === ' ') && !$('#s-next').hidden) { e.preventDefault(); $('#s-next').click(); } });
    show();
  }

  /* ---------------- 3. listening ---------------- */
  function listenGame() {
    var g = GAMES[2];
    if (!App.hasVoice()) return stage(g, '<div class="card"><p>This game needs a Greek voice for speech, and this browser doesn’t have one. On a Mac, Chrome and Safari use the built-in “Melina” voice (System Settings → Accessibility → Spoken Content → System voice → Manage voices → Greek).</p></div>');
    var pool = App.words.filter(function (w) { return w.english && App.keyOf(w.greek).length > 2; });
    var list = weighted(pool, 10), i = 0, right = 0, tries = 0, miss = [];
    stage(g, '<div class="gscore"><span>Word <b id="l-i">1</b> / 10</span><span>Correct <b id="l-r">0</b></span></div>' +
      '<div style="text-align:center;margin-top:24px"><button class="btn pri" id="l-play" style="font-size:22px;padding:18px 28px;border-radius:50px">🔊 Play</button> <button class="btn" id="l-slow">🐢 slower</button></div>' +
      '<div class="bigword" id="l-w" style="min-height:56px"></div><div class="choices c2" id="l-c"></div><div class="row" style="justify-content:center;margin-top:16px"><button class="btn" id="l-next" hidden>Next →</button></div>');
    function say(slow) { App.say(App.keyOf(list[i].greek), {rate: slow ? 0.6 : S.settings.rate}); }
    function show() {
      var w = list[i]; tries = 0;
      $('#l-i').textContent = i + 1; $('#l-w').textContent = ''; $('#l-next').hidden = true;
      var same = pool.filter(function (x) { return x !== w && x.pos === w.pos && x.english !== w.english; });
      var opts = u.shuffle([w].concat(u.shuffle(same.length >= 3 ? same : pool.filter(function (x) { return x !== w; })).slice(0, 3)));
      $('#l-c').innerHTML = opts.map(function (o, j) { return '<button data-j="' + j + '" style="font-size:15px;font-weight:500">' + esc(o.english) + '</button>'; }).join('');
      $$('#l-c button').forEach(function (b) {
        b.onclick = function () {
          if ($('#l-c').dataset.done === '1') return;
          var o = opts[+b.dataset.j]; tries++;
          if (o === w) {
            b.classList.add('right'); $('#l-c').dataset.done = '1';
            if (tries === 1) right++; else miss.push(w);
            $('#l-r').textContent = right;
            $('#l-w').innerHTML = '<span class="' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</span>';
            $('#l-next').hidden = false;
          } else { b.classList.add('wrong'); say(true); }
        };
      });
      $('#l-c').dataset.done = '0';
      setTimeout(function () { say(false); }, 250);
    }
    $('#l-play').onclick = function () { say(false); };
    $('#l-slow').onclick = function () { say(true); };
    $('#l-next').onclick = function () { i++; if (i >= list.length) return result(g, right * 10, right * 2, miss.length ? '<p class="small muted">Needed a second listen:</p><p class="gr" style="font-size:18px">' + miss.map(function (w) { return esc(w.greek); }).join(' · ') + '</p>' : ''); show(); };
    onKey(function (e) { if (e.key === ' ' && $('#l-next').hidden) { e.preventDefault(); say(false); } else if ((e.key === 'Enter' || e.key === ' ') && !$('#l-next').hidden) { e.preventDefault(); $('#l-next').click(); } });
    show();
  }

  /* ---------------- 4. verb forms ---------------- */
  var PERS = ['εγώ', 'εσύ', 'αυτός / αυτή', 'εμείς', 'εσείς', 'αυτοί / αυτές'];
  var TENSE = {pres: ['Ενεστώτας', 'present'], past: ['Αόριστος', 'simple past'], impf: ['Παρατατικός', 'past continuous'], fut: ['Μέλλοντας', 'future']};
  function conjGame() {
    var g = GAMES[3];
    var di = App.getDeckIndex(), verbs = [];
    Object.keys(App.D.C).forEach(function (i) {
      var w = di.byDict[i]; if (!w) return;
      var parts = App.D.C[i].split('|').map(function (x) { return x.split(','); });
      verbs.push({w: w, e: App.D.L[+i], t: {pres: parts[0], past: parts[1], impf: parts[2], fut: parts[3]}});
    });
    if (verbs.length < 4) return stage(g, '<p>Not enough verbs with conjugation tables yet.</p>');
    var rounds = [], tenses = ['pres', 'past', 'past', 'fut', 'fut', 'impf'];
    weighted(verbs.map(function (v) { return v.w; }), 12).forEach(function (w) {
      var v = verbs.find(function (x) { return x.w === w; });
      var tn = u.pick(tenses); if (!v.t[tn] || !v.t[tn].every(Boolean)) tn = 'pres';
      rounds.push({v: v, tn: tn, p: Math.floor(Math.random() * 6)});
    });
    var i = 0, right = 0, miss = [];
    stage(g, '<div class="gscore"><span>Round <b id="c-i">1</b> / ' + rounds.length + '</span><span>Correct <b id="c-r">0</b></span></div><div class="conj-prompt" id="c-p"></div><div class="choices c2" id="c-c"></div><div class="hint" id="c-h" style="margin-top:12px"></div><div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="c-next" hidden>Next →</button></div>');
    function show() {
      var r = rounds[i], v = r.v, ans = v.t[r.tn][r.p];
      $('#c-i').textContent = i + 1; $('#c-next').hidden = true; $('#c-h').innerHTML = '';
      $('#c-p').innerHTML = '<div class="verb">' + esc(v.e.w) + '</div><div class="muted small">' + esc(v.w.english) + '</div><span class="slot">' + esc(PERS[r.p]) + ' · ' + TENSE[r.tn][0] + ' <span style="font-weight:400">(' + TENSE[r.tn][1] + ')</span></span>';
      var pool = [];
      ['pres', 'past', 'impf', 'fut'].forEach(function (tn) { (v.t[tn] || []).forEach(function (f, p) { if (f && f !== ans && pool.indexOf(f) < 0 && (tn === r.tn || p === r.p)) pool.push(f); }); });
      var opts = u.shuffle([ans].concat(u.shuffle(pool).slice(0, 3)));
      $('#c-c').innerHTML = opts.map(function (o) { return '<button class="gr">' + esc(o) + '</button>'; }).join('');
      $('#c-c').dataset.done = '0';
      $$('#c-c button').forEach(function (b) {
        b.onclick = function () {
          if ($('#c-c').dataset.done === '1') return;
          $('#c-c').dataset.done = '1';
          if (b.textContent === ans) { right++; b.classList.add('right'); }
          else { miss.push(v.e.w + ' → ' + ans); b.classList.add('wrong'); $$('#c-c button').find(function (x) { return x.textContent === ans; }).classList.add('right'); }
          $('#c-r').textContent = right;
          $('#c-h').innerHTML = '<span class="gr">' + v.t[r.tn].map(function (f, p) { return p === r.p ? '<b>' + esc(f) + '</b>' : esc(f); }).join(', ') + '</span>';
          App.say(ans);
          $('#c-next').hidden = false;
        };
      });
    }
    $('#c-next').onclick = function () { i++; if (i >= rounds.length) return result(g, right * 10, right * 2, miss.length ? '<p class="small muted">Worth another look:</p><p class="gr" style="font-size:17px">' + miss.map(esc).join('<br>') + '</p>' : '<p>All correct!</p>'); show(); };
    onKey(function (e) { if ((e.key === 'Enter' || e.key === ' ') && !$('#c-next').hidden) { e.preventDefault(); $('#c-next').click(); } else if (/^[1-4]$/.test(e.key) && $('#c-next').hidden) { var b = $$('#c-c button')[+e.key - 1]; if (b) b.click(); } });
    show();
  }

  /* ---------------- 5. sentence builder ---------------- */
  function buildGame() {
    var g = GAMES[4];
    var read = App.texts.filter(function (t) { return S.texts[t.id] && S.texts[t.id].done; });
    var src = read.length >= 2 ? read : App.texts.filter(function (t) { return t.series === 'story'; }).slice(0, Math.max(3, read.length + 2));
    var cands = [];
    src.forEach(function (t) {
      t.paragraphs.forEach(function (p) {
        p.forEach(function (pair) {
          var gr = pair[0].replace(/^[—–-]\s*/, '');
          var ws = App.tokenize(gr).filter(function (x) { return x.w; }).map(function (x) { return x.w; });
          if (ws.length >= 4 && ws.length <= 9 && pair[1]) cands.push({gr: gr, en: pair[1].replace(/^[—–-]\s*/, ''), ws: ws, src: t.title});
        });
      });
    });
    var list = u.shuffle(cands).slice(0, 6), i = 0, right = 0;
    if (!list.length) return stage(g, '<p>No sentences available yet.</p>');
    stage(g, '<div class="gscore"><span>Sentence <b id="b-i">1</b> / ' + list.length + '</span><span>Correct <b id="b-r">0</b></span></div>' +
      '<p style="text-align:center;font-size:17px;margin:18px 0 4px" id="b-en"></p><p class="hint small" id="b-src"></p>' +
      '<div class="tiles answer" id="b-a"></div><div class="tiles" id="b-pool"></div><div class="hint" id="b-h" style="margin-top:10px"></div>' +
      '<div class="row" style="justify-content:center;margin-top:12px"><button class="btn" id="b-undo">Clear</button><button class="btn pri" id="b-check">Check</button><button class="btn" id="b-ok" hidden>Mine works too</button><button class="btn" id="b-next" hidden>Next →</button></div>');
    var built = [], tiles = [];
    // the first word loses its capital so it doesn't give the answer away, unless it's a name or an acronym
    function low(w) { return isName(w) || w === w.toUpperCase() ? w : w.charAt(0).toLowerCase() + w.slice(1); }
    function isName(w) { var a = App.analyse(w); return !a.best || !!(a.best.e && a.best.e.pos === 'm'); }
    function show() {
      var it = list[i]; built = [];
      tiles = it.ws.map(function (w, j) { return {w: j === 0 ? low(w) : w, j: j}; });
      tiles = u.shuffle(tiles);
      $('#b-i').textContent = i + 1; $('#b-en').textContent = it.en; $('#b-src').textContent = 'from “' + it.src + '”';
      $('#b-h').innerHTML = ''; $('#b-a').className = 'tiles answer';
      $('#b-check').hidden = false; $('#b-undo').hidden = false; $('#b-next').hidden = true; $('#b-ok').hidden = true;
      draw();
    }
    function draw() {
      $('#b-a').innerHTML = built.map(function (t, k) { return '<button data-k="' + k + '">' + esc(t.w) + '</button>'; }).join('');
      $('#b-pool').innerHTML = tiles.map(function (t, k) { return built.indexOf(t) >= 0 ? '' : '<button data-p="' + k + '">' + esc(t.w) + '</button>'; }).join('');
      $$('#b-pool button').forEach(function (b) { b.onclick = function () { built.push(tiles[+b.dataset.p]); draw(); }; });
      $$('#b-a button').forEach(function (b) { b.onclick = function () { if (!$('#b-next').hidden) return; built.splice(+b.dataset.k, 1); draw(); }; });
    }
    $('#b-undo').onclick = function () { built = []; draw(); };
    $('#b-check').onclick = function () {
      var it = list[i];
      if (built.length < it.ws.length) { $('#b-h').textContent = 'Use all the words.'; return; }
      var ok = built.every(function (t, k) { return t.w.toLowerCase() === it.ws[k].toLowerCase(); });
      $('#b-a').classList.add(ok ? 'right' : 'wrong');
      if (ok) right++;
      $('#b-r').textContent = right;
      $('#b-h').innerHTML = (ok ? '✓ ' : 'Original: ') + '<span class="gr" style="font-size:18px;color:var(--ink)">' + esc(it.gr) + '</span>';
      App.say(it.gr);
      $('#b-check').hidden = true; $('#b-undo').hidden = true; $('#b-next').hidden = false; $('#b-ok').hidden = ok;
    };
    $('#b-ok').onclick = function () { right++; $('#b-r').textContent = right; $('#b-ok').hidden = true; $('#b-a').className = 'tiles answer right'; };
    $('#b-next').onclick = function () { i++; if (i >= list.length) return result(g, right * 10, right * 4); show(); };
    show();
  }

  App.views.play = function () { hub(); };
  App.games = GAMES;
})();
