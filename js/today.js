/* Today: the daily routine (review, read, play), streak, and progress. */
'use strict';
(function () {
  var u = App.u, S = App.S, $ = u.$, $$ = u.$$, esc = u.esc;
  var root = $('#v-today');

  function greeting() { var hr = new Date().getHours(); return hr < 12 ? 'Καλημέρα' : hr < 21 ? 'Καλησπέρα' : 'Καληνύχτα'; }
  function dayNum() { return Math.floor(Date.parse(u.studyDay()) / 864e5); }

  function heatmap() {
    var weeks = 18, cells = '', end = new Date(u.studyDay() + 'T12:00:00');
    var start = new Date(end); start.setDate(start.getDate() - (weeks - 1) * 7);
    // align the first column to a Monday
    while (start.getDay() !== 1) start.setDate(start.getDate() - 1);
    for (var d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      var k = u.todayKey(d.getTime()), l = S.log[k], xp = l ? l.xp : 0;
      var lv = xp === 0 ? '' : xp <= 20 ? 'l1' : xp <= 50 ? 'l2' : xp <= 100 ? 'l3' : 'l4';
      cells += '<i class="' + lv + (k === u.studyDay() ? ' today' : '') + '" title="' + k + ': ' + xp + ' XP"></i>';
    }
    return '<div class="heat">' + cells + '</div>';
  }

  function render() {
    var d = App.day(), q = App.queue(), due = q.learn.length + q.rev.length + q.nw.length;
    var everStarted = Object.keys(S.cards).length > 0;
    var lv = App.level();
    var counts = {new: 0, learn: 0, young: 0, mature: 0};
    App.words.forEach(function (w) { counts[App.cardState(w.greek)]++; });
    var total = App.words.length || 1;

    var nextText = App.nextText();
    var game = App.games[dayNum() % App.games.length];

    var revDone = d.done || (d.rev > 0 && due === 0), revTask;
    if (revDone) revTask = ['Reviews done', d.rev + ' card' + (d.rev === 1 ? '' : 's') + ' today'];
    else if (!due) revTask = ['Nothing due', 'Come back later, or learn a few more words'];
    else revTask = ['Review your words', q.rev.length + ' due · ' + q.learn.length + ' learning · ' + q.nw.length + ' new'];
    var readDone = d.read > 0, playDone = d.games > 0;
    if (revDone && readDone && playDone && !d.perfect) { d.perfect = true; App.addXP(15); App.toast('Perfect day! +15 XP'); App.save(); }

    var wotd = App.gapWords('all', 120);
    var wd = wotd.length ? wotd[dayNum() % wotd.length] : null;

    root.innerHTML =
      '<div class="hello"><div><h1>' + greeting() + '!</h1><p class="sub" style="margin:0">' + new Date().toLocaleDateString(undefined, {weekday: 'long', day: 'numeric', month: 'long'}) + '</p></div>' +
      '<div class="streak"><div class="stat"><b>🔥 ' + App.streak() + '</b><span>day streak</span></div><div class="stat"><b>' + counts.mature + '</b><span>words well known</span></div><div class="stat"><b>' + d.xp + '</b><span>XP today</span></div></div></div>' +
      (!everStarted ? welcome() : '') +
      '<div class="grid g2">' +
      '<div class="card plan"><h2 style="margin-top:0">Today’s plan <span class="small muted" style="font-family:var(--sans);font-weight:400">· about 15 minutes</span></h2>' +
        task(revDone, revTask[0], revTask[1], revDone ? '' : due ? '<button class="btn pri" data-go="review">Start</button>' : '<button class="btn" data-go="review">Open</button>') +
        task(readDone, readDone ? 'Read today ✓' : 'Read one text', nextText ? (readDone ? 'Next: ' : '') + esc(nextText.title) + ' · ' + esc(nextText.level) + ' · ' + Math.round(App.coverage(nextText) * 100) + '% known' : 'Add your own text in Read', '<button class="btn' + (readDone ? '' : ' pri') + '" data-text="' + (nextText ? esc(nextText.id) : '') + '">Read</button>') +
        task(playDone, playDone ? 'Played today ✓' : 'Play one game', 'Today’s pick: ' + esc(game.name), '<button class="btn' + (playDone ? '' : ' pri') + '" data-game="' + game.id + '">Play</button>') +
        '<p class="small muted" style="margin:10px 0 0">A day counts toward your streak once you finish your reviews or read a text. Do all three for a +15 XP bonus.</p>' +
      '</div>' +
      '<div class="grid">' +
        '<div class="card"><div class="row"><b>Level: ' + esc(lv.name) + '</b><span class="spacer"></span><span class="small muted">' + S.xp + ' / ' + lv.hi + ' XP</span></div><div class="lvbar"><i style="width:' + Math.round(lv.frac * 100) + '%"></i></div>' +
        '<h3 style="margin-bottom:4px">Your ' + App.words.length + ' words</h3><div class="bars">' +
        [['mature', 'var(--green)'], ['young', 'var(--gold)'], ['learn', 'var(--terra)'], ['new', 'var(--panel2)']].map(function (x) { return '<i style="width:' + (counts[x[0]] / total * 100) + '%;background:' + x[1] + '"></i>'; }).join('') + '</div>' +
        '<div class="legend"><span><i style="background:var(--green)"></i>well known ' + counts.mature + '</span><span><i style="background:var(--gold)"></i>getting there ' + counts.young + '</span><span><i style="background:var(--terra)"></i>learning ' + counts.learn + '</span><span><i style="background:var(--panel2);border:1px solid var(--line)"></i>not started ' + counts.new + '</span></div></div>' +
        (wd ? '<div class="card wotd"><div class="small muted">Word of the day · one of the most common words you don’t have yet</div><div class="row" style="margin-top:4px"><span class="gr ' + (wd.pos === 'n' ? ({m: 'g-m', f: 'g-f', n: 'g-n'}[wd.g] || '') : '') + '">' + esc(App.dictHeadword(wd)) + '</span><button class="btn sm ghost" id="wd-say">🔊</button><span class="spacer"></span><button class="btn sm" id="wd-add">+ Add</button></div><div>' + esc(wd.gl) + '</div></div>' : '') +
      '</div></div>' +
      '<h2>Last 18 weeks</h2><div class="card">' + heatmap() + '</div>';

    $$('[data-go]', root).forEach(function (b) { b.onclick = function () { App.show(b.dataset.go); }; });
    $$('[data-text]', root).forEach(function (b) { b.onclick = function () { if (b.dataset.text) App.openText(b.dataset.text); else App.show('read', '__tab'); }; });
    $$('[data-game]', root).forEach(function (b) { b.onclick = function () { App.show('play'); App.games.find(function (g) { return g.id === b.dataset.game; }).start(); }; });
    if ($('#wd-say')) $('#wd-say').onclick = function () { App.say(wd.w); };
    if ($('#wd-add')) $('#wd-add').onclick = function () { if (App.addWord({greek: App.dictHeadword(wd), english: wd.gl.split(';')[0].trim(), part_of_speech: App.POSNAME[wd.pos] || '', src: 'word of the day'})) { App.toast('Added ' + wd.w); render(); } };
    if ($('#wl-sort')) $('#wl-sort').onclick = function () { App.show('review', 'triage'); };
    if ($('#wl-csv')) $('#wl-csv').onclick = function () { App.show('words'); };
    if ($('#wl-starter')) $('#wl-starter').onclick = function () { addStarter(); };
  }
  function task(done, title, sub, btn) {
    return '<div class="task' + (done ? ' done' : '') + '"><span class="tick">✓</span><div class="t-main"><b>' + title + '</b><span>' + sub + '</span></div>' + btn + '</div>';
  }
  /* the most common words, for someone who starts without a list of their own */
  function addStarter() {
    var day = u.studyDay(), now = Date.now();
    var list = App.parseCSV(window.GR_STARTER_CSV || '').filter(function (w) { return !App.byGreek[w.greek]; });
    list.forEach(function (w) { S.added.push({greek: w.greek, english: w.english, part_of_speech: w.part_of_speech, lesson_date: day, src: 'starter list', synced: false, at: now}); });
    App.rebuildWords(); App.save(); App.csvAutoSave();
    App.toast('Added ' + list.length + ' common words'); render();
  }
  function welcome() {
    if (!App.words.length) return '<div class="card" style="margin-bottom:16px;border-color:var(--blue)"><h2 style="margin-top:0">Welcome! Here’s how this works</h2>' +
      '<p>Each day: review the words that are due (the app spaces them out so you see each one just before you’d forget it), read one text, and play one game.</p>' +
      '<p>You don’t have any words yet. Start with the most common Greek words, or connect your own word list: a CSV file with the columns <code>greek, english, part_of_speech, lesson_date</code>. You can also add words while reading: tap a word and press “Add”.</p>' +
      '<p class="small muted">Already using the app on another device? Connect GitHub sync in the Words tab to bring your progress here.</p>' +
      '<div class="row"><button class="btn pri" id="wl-starter">Start with 300 common words</button><button class="btn" id="wl-csv">Connect a word list</button></div></div>';
    return '<div class="card" style="margin-bottom:16px;border-color:var(--blue)"><h2 style="margin-top:0">Welcome! Here’s how this works</h2>' +
      '<p>Your ' + App.words.length + ' words from <code>words.csv</code> are loaded. Each day: review the words that are due (the app spaces them out so you see each one just before you’d forget it), read one text, and play one game.</p>' +
      '<p><b>Start with a quick sort.</b> You already know many of these words, so flick through them first: the ones you know get scheduled for a check-up in a few weeks, and the ones you’ve forgotten go to the front of the queue. It takes about five minutes for a hundred words.</p>' +
      '<div class="row"><button class="btn pri" id="wl-sort">Quick sort my words</button><button class="btn" id="wl-csv">Connect words.csv</button></div></div>';
  }

  App.views.today = function () { render(); };
})();
