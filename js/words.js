/* Words: your list, syncing with words.csv, and common words you don't have yet. */
'use strict';
(function () {
  var u = App.u, S = App.S, $ = u.$, $$ = u.$$, esc = u.esc;
  var root = $('#v-words');
  var q = '', filter = 'all', limit = 100, gapPos = 'all', gapLimit = 25;
  S.hiddenGaps = S.hiddenGaps || {};

  function syncHtml() {
    var st = App.csv.state, pend = App.pendingCount();
    var dot = st === 'ok' ? 'ok' : pend ? 'warn' : '';
    var msg, btns = '';
    if (st === 'ok') {
      msg = 'Connected to <b>' + esc(App.csv.name || 'words.csv') + '</b>. Words you add are written into it straight away.' + (S.csvSaved ? ' Last saved ' + new Date(S.csvSaved).toLocaleString() + '.' : '');
      btns = '<button class="btn sm" id="cs-reload">Reload from file</button>' + (pend ? '<button class="btn sm pri" id="cs-save">Save ' + pend + ' change' + (pend > 1 ? 's' : '') + '</button>' : '');
    } else if (st === 'need-permission') {
      msg = 'Your browser needs permission again to write to <b>words.csv</b>' + (pend ? ' (' + pend + ' change' + (pend > 1 ? 's' : '') + ' waiting)' : '') + '.';
      btns = '<button class="btn sm pri" id="cs-allow">Allow</button>';
    } else if (st === 'unsupported') {
      msg = 'This browser can’t write to files on disk (Chrome and Edge can). ' + (pend ? '<b>' + pend + ' new word' + (pend > 1 ? 's' : '') + '</b> are only saved here. ' : '') + 'Download an updated words.csv and replace your copy.';
    } else {
      msg = (pend ? '<b>' + pend + ' new word' + (pend > 1 ? 's' : '') + '</b> are only saved in this browser. ' : '') + 'Connect your <b>words.csv</b> (columns: greek, english, part_of_speech, lesson_date) and words you add while reading are appended to it automatically, with today’s date.';
      btns = '<button class="btn sm pri" id="cs-connect">Connect words.csv</button>';
    }
    return '<div class="card sync"><span class="dot ' + dot + '"></span><div style="flex:1;min-width:220px">' + msg + '</div><div class="row">' + btns + '<button class="btn sm" id="cs-dl">Download words.csv</button></div></div>';
  }
  function bindSync() {
    function rr() { render(); App.renderHud(); }
    if ($('#cs-connect')) $('#cs-connect').onclick = function () { App.csvConnect().then(rr); };
    if ($('#cs-allow')) $('#cs-allow').onclick = function () { App.csvReconnect().then(rr); };
    if ($('#cs-reload')) $('#cs-reload').onclick = function () { App.csvRead(false).then(rr); };
    if ($('#cs-save')) $('#cs-save').onclick = function () { App.csvWrite().then(function (ok) { if (ok) App.toast('Saved'); rr(); }); };
    $('#cs-dl').onclick = App.csvDownload;
  }

  /* ---- progress: sync between devices, and a backup file ---- */
  function progressHtml() {
    var sy = App.sync, msg, btns = '';
    if (sy.state === 'off') {
      msg = 'Your progress is saved in this browser. To carry it to another device (your phone, another computer), sync it through a private GitHub gist. ' +
        '<a href="https://github.com/settings/tokens/new?scopes=gist&description=Siga%20siga%20sync" target="_blank" rel="noopener">Create a token</a> that can only use gists, then paste it here. Do the same on each device.' +
        (sy.error ? '<br><span style="color:var(--terra)">' + esc(sy.error) + '</span>' : '') +
        '<div class="row" style="margin-top:8px"><input type="password" id="sy-token" placeholder="ghp_…" autocomplete="off" style="flex:1;min-width:180px"><button class="btn sm pri" id="sy-go">Connect</button></div>';
    } else {
      var when = sy.at ? new Date(sy.at).toLocaleString(undefined, {weekday: 'short', hour: '2-digit', minute: '2-digit'}) : 'not yet';
      msg = sy.state === 'busy' ? 'Syncing…' :
        sy.state === 'error' ? 'Sync failed: ' + esc(sy.error) + '. Your progress is still saved in this browser.' :
        'Synced through your <a href="' + esc(App.syncGistUrl()) + '" target="_blank" rel="noopener">GitHub gist</a>. Last synced: ' + esc(when) + '. Changes are sent a few seconds after you make them.';
      btns = '<button class="btn sm" id="sy-now">Sync now</button><button class="btn sm ghost" id="sy-off">Disconnect</button>';
    }
    return '<div class="card sync"><span class="dot ' + ({idle: 'ok', busy: 'warn', error: 'warn'}[sy.state] || '') + '"></span><div style="flex:1;min-width:220px">' + msg + '</div>' +
      '<div class="row">' + btns + '<button class="btn sm" id="pr-ex">Export progress</button><button class="btn sm" id="pr-im">Import progress</button><input type="file" id="pr-file" accept=".json,application/json" hidden></div></div>';
  }
  function bindProgress() {
    if ($('#sy-go')) $('#sy-go').onclick = function () { var t = $('#sy-token').value.trim(); if (t) App.syncConnect(t); };
    if ($('#sy-now')) $('#sy-now').onclick = function () { App.syncNow(); };
    if ($('#sy-off')) $('#sy-off').onclick = function () { if (confirm('Stop syncing on this device? Your progress stays here and in the gist.')) App.syncDisconnect(); };
    $('#pr-ex').onclick = App.exportProgress;
    $('#pr-im').onclick = function () { $('#pr-file').click(); };
    $('#pr-file').onchange = function () { if (this.files[0]) App.importProgress(this.files[0]).then(render); };
  }

  function stateLabel(w) {
    var st = App.cardState(w.greek), c = S.cards[w.greek];
    if (c && c.sus) return '<span class="st muted">skipped</span>';
    if (st === 'new') return '<span class="st st-new">new</span>';
    if (st === 'learn') return '<span class="st st-learn">learning</span>';
    var due = (c.due - Date.now()) / 864e5;
    return '<span class="st st-' + st + '">' + (due <= 0 ? 'due' : 'in ' + u.fmtIvl(due)) + '</span>';
  }
  function matches(w) {
    if (q) { var f = u.fold(q); if (u.fold(w.greek).indexOf(f) < 0 && w.english.toLowerCase().indexOf(q.toLowerCase()) < 0) return false; }
    var st = App.cardState(w.greek), c = S.cards[w.greek];
    if (filter === 'due') return c && !c.sus && c.st !== 'new' && c.due <= Date.now();
    if (filter === 'new') return st === 'new';
    if (filter === 'learn') return st === 'learn' || st === 'young';
    if (filter === 'known') return st === 'mature';
    if (filter === 'added') return w.added;
    return true;
  }

  function render() {
    var list = App.words.filter(matches);
    var counts = {new: 0, learn: 0, young: 0, mature: 0};
    App.words.forEach(function (w) { counts[App.cardState(w.greek)]++; });
    root.innerHTML = '<h1>Words</h1><p class="sub">' + App.words.length + ' words · ' + counts.mature + ' well known · ' + (counts.young + counts.learn) + ' in progress · ' + counts.new + ' not studied yet · ' + S.added.length + ' added in the app</p>' +
      syncHtml() + progressHtml() +
      '<h2>Your list</h2><div class="wtools"><input type="search" id="w-q" placeholder="Search Greek or English (accents optional)" value="' + esc(q) + '">' +
      '<div class="chips" id="w-f">' + [['all', 'All'], ['due', 'Due'], ['new', 'New'], ['learn', 'In progress'], ['known', 'Well known'], ['added', 'Added by you']].map(function (f) { return '<button data-f="' + f[0] + '"' + (filter === f[0] ? ' class="on"' : '') + '>' + f[1] + '</button>'; }).join('') + '</div></div>' +
      '<div class="card" style="padding:4px 8px;overflow-x:auto"><table class="words"><thead><tr><th>Greek</th><th>English</th><th>Type</th><th>Status</th><th></th></tr></thead><tbody>' +
      list.slice(0, limit).map(function (w) {
        return '<tr data-g="' + esc(w.greek) + '"><td class="gr ' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</td><td>' + esc(w.english) + (w.ctx ? '<div class="small muted gr">' + esc(w.ctx) + '</div>' : '') + '</td><td class="small muted">' + esc(w.pos) + '</td><td>' + stateLabel(w) + '</td><td><button class="btn sm ghost" data-say="1" title="Listen">🔊</button></td></tr>';
      }).join('') + '</tbody></table>' + (list.length > limit ? '<div style="text-align:center;padding:10px"><button class="btn sm" id="w-more">Show more (' + (list.length - limit) + ')</button></div>' : '') + (list.length ? '' : '<p class="muted" style="padding:10px">Nothing matches.</p>') + '</div>' +
      gapsHtml();
    bindSync(); bindProgress();
    var qi = $('#w-q');
    qi.oninput = function () { q = qi.value.trim(); limit = 100; var pos = qi.selectionStart; render(); var n = $('#w-q'); n.focus(); n.setSelectionRange(pos, pos); };
    $$('#w-f button').forEach(function (b) { b.onclick = function () { filter = b.dataset.f; limit = 100; render(); }; });
    if ($('#w-more')) $('#w-more').onclick = function () { limit += 200; render(); };
    $$('tr[data-g]', root).forEach(function (tr) {
      tr.onclick = function (e) {
        var w = App.byGreek[tr.dataset.g];
        if (e.target.closest('[data-say]')) { App.say(App.keyOf(w.greek)); return; }
        editDialog(w);
      };
    });
    bindGaps();
  }

  function editDialog(w) {
    var c = S.cards[w.greek];
    var d = u.h('dialog', {}, '<h2 style="margin-top:0" class="gr ' + App.genderClass(w.greek) + '">' + esc(w.greek) + '</h2>' +
      '<label class="f">English</label><input type="text" id="ed-en" value="' + esc(w.english) + '">' +
      '<p class="small muted">' + esc(w.pos || '') + (w.date ? ' · ' + esc(w.date) : '') + (c && c.st !== 'new' ? ' · reviewed ' + c.reps + '× · interval ' + u.fmtIvl(c.ivl) + (c.lapses ? ' · forgotten ' + c.lapses + '×' : '') : '') + '</p>' +
      (w.ctx ? '<p class="gr" style="background:var(--panel2);padding:8px 10px;border-radius:8px">' + esc(w.ctx) + (w.src ? '<br><span class="small muted">— ' + esc(w.src) + '</span>' : '') + '</p>' : '') +
      '<div class="row" style="margin-top:14px"><button class="btn sm" id="ed-reset">Reset progress</button><button class="btn sm" id="ed-sus">' + (c && c.sus ? 'Bring back into reviews' : 'Skip in reviews') + '</button>' +
      (w.added && !(App.S.added.find(function (x) { return x.greek === w.greek; }) || {}).synced ? '<button class="btn sm" id="ed-del">Remove</button>' : '') +
      '<span class="spacer"></span><button class="btn ghost" id="ed-x">Cancel</button><button class="btn pri" id="ed-ok">Save</button></div>');
    document.body.appendChild(d); d.showModal();
    function close() { d.close(); d.remove(); }
    $('#ed-x', d).onclick = close;
    $('#ed-ok', d).onclick = function () {
      var en = $('#ed-en', d).value.trim();
      if (en !== w.english) {
        var a = S.added.find(function (x) { return x.greek === w.greek; });
        if (a && !a.synced) a.english = en; else S.edits[w.greek] = en;
        App.rebuildWords(); App.save(); App.csvAutoSave();
      }
      close(); render();
    };
    $('#ed-reset', d).onclick = function () { if (confirm('Forget all review history for this word?')) { delete S.cards[w.greek]; S.gone['c:' + w.greek] = Date.now(); App.save(); close(); render(); App.renderHud(); } };
    $('#ed-sus', d).onclick = function () { var cc = App.card(w.greek); cc.sus = !cc.sus; cc.mt = Date.now(); App.save(); close(); render(); App.renderHud(); };
    if ($('#ed-del', d)) $('#ed-del', d).onclick = function () { S.added = S.added.filter(function (x) { return x.greek !== w.greek; }); delete S.cards[w.greek]; S.gone['w:' + w.greek] = S.gone['c:' + w.greek] = Date.now(); App.rebuildWords(); App.save(); close(); render(); App.renderHud(); };
  }

  /* ---- common words you don't have yet ---- */
  var SKIP_POS = {t: 1, k: 1, p: 1, c: 1, r: 1, m: 1, u: 1, i: 1};
  App.gapWords = function (pos, n) {
    var di = App.getDeckIndex(), out = [];
    for (var i = 0; i < App.D.L.length && out.length < n; i++) {
      var e = App.D.L[i];
      if (SKIP_POS[e.pos] || di.byDict[i] || S.hiddenGaps[e.w] || di.byKey[e.w.toLowerCase()]) continue;
      if (/form of|inflection of|alternative|nonfinite|participle of|plural of|diminutive of|comparative|superlative|person|singular/.test(e.gl)) continue;
      if (e.w !== e.w.toLowerCase() || e.w.length < 3 || /\s/.test(e.w) || !/[a-z]/i.test(e.gl)) continue;
      // skip homographs ("το είναι") and words that are really an inflected form of a more common word ("ξέρεις")
      var same = App.D.byWord[e.w.toLowerCase()] || [];
      if (same[0] !== i) continue;
      var asForm = App.D.F[e.w.toLowerCase()];
      if (asForm && asForm.some(function (j) { return j < i; })) continue;
      if (pos !== 'all' && e.pos !== pos) continue;
      out.push(e);
    }
    return out;
  };
  function gapsHtml() {
    var list = App.gapWords(gapPos, gapLimit);
    return '<h2>Common words you don’t have yet</h2><p class="sub small">The most frequent Greek words (from film and TV subtitles) that aren’t in your list, most common first. Add the ones you want; hide the ones you already know.</p>' +
      '<div class="chips" id="g-pos" style="margin-bottom:8px">' + [['all', 'All'], ['n', 'Nouns'], ['v', 'Verbs'], ['a', 'Adjectives'], ['d', 'Adverbs']].map(function (p) { return '<button data-p="' + p[0] + '"' + (gapPos === p[0] ? ' class="on"' : '') + '>' + p[1] + '</button>'; }).join('') + '</div>' +
      '<div class="card" style="padding:6px 14px">' + list.map(function (e) {
        var gc = e.pos === 'n' ? ({m: 'g-m', f: 'g-f', n: 'g-n'}[e.g] || '') : '';
        return '<div class="gap-row" data-i="' + e.i + '"><span class="rk">#' + (e.i + 1) + '</span><span class="gr ' + gc + '">' + esc(App.dictHeadword(e)) + '</span><span class="en">' + esc(e.gl) + '</span><button class="btn sm ghost" data-say="1">🔊</button><button class="btn sm ghost" data-hide="1" title="I know this one">Know it</button><button class="btn sm" data-add="1">+ Add</button></div>';
      }).join('') + '<div style="text-align:center;padding:10px"><button class="btn sm" id="g-more">Show more</button></div></div>';
  }
  function bindGaps() {
    $$('#g-pos button').forEach(function (b) { b.onclick = function () { gapPos = b.dataset.p; gapLimit = 25; render(); }; });
    $('#g-more').onclick = function () { gapLimit += 25; render(); };
    $$('.gap-row').forEach(function (r) {
      var e = App.D.L[+r.dataset.i];
      $('[data-say]', r).onclick = function () { App.say(e.w); };
      $('[data-hide]', r).onclick = function () { S.hiddenGaps[e.w] = 1; App.save(); r.remove(); };
      $('[data-add]', r).onclick = function () {
        if (App.addWord({greek: App.dictHeadword(e), english: e.gl.split(';')[0].trim(), part_of_speech: App.POSNAME[e.pos] || '', src: 'common words'})) { App.toast('Added ' + e.w); r.remove(); }
      };
    });
  }

  App.views.words = function () { render(); };
})();
