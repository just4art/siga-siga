/* Progress between devices: export/import a progress file, and syncing through a private GitHub gist. */
'use strict';
(function () {
  var u = App.u, S = App.S;
  var CFG_KEY = 'sigasiga-sync', FILE = 'sigasiga-progress.json', API = 'https://api.github.com';
  var cfg = {};
  try { cfg = JSON.parse(localStorage.getItem(CFG_KEY) || '{}') || {}; } catch (e) {}
  function saveCfg() { try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) {} }

  // the local word list snapshot travels with the progress, so another device gets your words too
  if (!S.csvText && window.GR_WORDS_CSV) { S.csvText = window.GR_WORDS_CSV; S.csvAt = S.csvAt || 1; }

  // state: off | idle | busy | error
  App.sync = {state: cfg.token ? 'idle' : 'off', at: cfg.at || 0, error: ''};

  /* ---------------- merging two copies of the progress ---------------- */
  function cardTime(c) { return c ? Math.max(c.mt || 0, c.seen || 0) : 0; }
  function byId(list, key) { var o = {}; (list || []).forEach(function (x) { o[x[key]] = x; }); return o; }

  /* Merge progress `b` into `a` (mutates a). Every step gives the same result however often it runs. */
  function merge(a, b, opts) {
    opts = opts || {};
    var gone = a.gone = a.gone || {};
    Object.keys(b.gone || {}).forEach(function (k) { gone[k] = Math.max(gone[k] || 0, b.gone[k]); });

    // cards: the copy that was touched last wins; a reset after that removes it
    Object.keys(b.cards || {}).forEach(function (g) { if (cardTime(b.cards[g]) > cardTime(a.cards[g])) a.cards[g] = b.cards[g]; });
    Object.keys(a.cards).forEach(function (g) { if (gone['c:' + g] && gone['c:' + g] >= cardTime(a.cards[g])) delete a.cards[g]; });

    // words added in the app
    var have = byId(a.added, 'greek');
    (b.added || []).forEach(function (w) {
      var x = have[w.greek];
      if (!x) { a.added.push(w); have[w.greek] = w; }
      else { x.synced = x.synced || w.synced; if ((w.at || 0) > (x.at || 0)) { x.english = w.english; x.at = w.at; } }
    });
    a.added = a.added.filter(function (w) { var t = gone['w:' + w.greek]; return !t || (w.at || 0) > t; });

    // texts you pasted in
    var mine = byId(a.myTexts, 'id');
    (b.myTexts || []).forEach(function (t) { if (!mine[t.id]) a.myTexts.push(t); });
    a.myTexts = a.myTexts.filter(function (t) { return !gone['t:' + t.id]; });

    // daily log: the larger count wins (both devices count the same day separately)
    Object.keys(b.log || {}).forEach(function (d) {
      var x = a.log[d], y = b.log[d];
      if (!x) { a.log[d] = y; return; }
      Object.keys(y).forEach(function (k) { x[k] = typeof y[k] === 'number' ? Math.max(x[k] || 0, y[k]) : x[k] || y[k]; });
    });
    a.xp = Math.max(a.xp || 0, b.xp || 0);

    Object.keys(b.texts || {}).forEach(function (id) {
      var x = a.texts[id], y = b.texts[id];
      if (!x || (y.at || 0) > (x.at || 0)) a.texts[id] = y;
    });
    Object.keys(b.games || {}).forEach(function (id) { if (a.games[id] == null || b.games[id] > a.games[id]) a.games[id] = b.games[id]; });
    a.hiddenGaps = Object.assign({}, b.hiddenGaps || {}, a.hiddenGaps || {});
    a.edits = Object.assign({}, b.edits || {}, a.edits);

    if ((b.csvAt || 0) > (a.csvAt || 0)) { a.csvText = b.csvText; a.csvAt = b.csvAt; a.csvSaved = Math.max(a.csvSaved || 0, b.csvSaved || 0); }

    // settings: keep this device's if they changed since the last sync, otherwise take the other copy
    if (opts.settingsBase != null && b.settings && JSON.stringify(a.settings) === opts.settingsBase) Object.assign(a.settings, b.settings);

    // tidy up: edits and added words that words.csv already contains
    if (a.csvText) {
      var rows = byId(App.parseCSV(a.csvText), 'greek');
      Object.keys(a.edits).forEach(function (g) { if (rows[g] && rows[g].english === a.edits[g]) delete a.edits[g]; });
      a.added.forEach(function (w) { if (rows[w.greek]) w.synced = true; });
    }
    return a;
  }
  App.mergeProgress = merge;

  function snapshot() { return JSON.stringify(S); }
  function afterMerge(before) {
    if (snapshot() === before) return false;
    try { localStorage.setItem('sigasiga-v1', snapshot()); } catch (e) {}
    App.rebuildWords();
    if (App.csv.state === 'ok' && App.pendingCount()) App.csvWrite();
    // don't redraw a review or a text in the middle of it
    if (App.current === 'today' || App.current === 'words') App.refresh(); else App.renderHud();
    return true;
  }

  /* ---------------- progress file ---------------- */
  App.exportProgress = function () {
    var blob = new Blob([JSON.stringify(Object.assign({app: 'sigasiga', v: 1, exported: Date.now()}, S))], {type: 'application/json'});
    var a = u.h('a', {href: URL.createObjectURL(blob), download: 'sigasiga-progress-' + u.studyDay() + '.json'});
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  };
  App.importProgress = function (file) {
    return file.text().then(function (text) {
      var data = JSON.parse(text);
      if (data.app !== 'sigasiga' || !data.cards) throw new Error('This isn’t a Σιγά σιγά progress file');
      var before = snapshot();
      merge(S, data);
      afterMerge(before);
      App.toast('Progress imported and merged');
      scheduleSync();
    }).catch(function (e) { App.toast('Could not import: ' + e.message); });
  };

  /* ---------------- GitHub gist ---------------- */
  function gh(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: {Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json'},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      if (r.ok) return r.json();
      return r.json().catch(function () { return {}; }).then(function (j) {
        var e = new Error(r.status === 401 ? 'GitHub didn’t accept the token' : j.message || 'GitHub answered ' + r.status);
        e.status = r.status; throw e;
      });
    });
  }
  function payload() { return JSON.stringify(Object.assign({app: 'sigasiga', v: 1}, S)); }
  function findGist() {
    if (cfg.gist) return Promise.resolve(cfg.gist);
    return gh('GET', '/gists?per_page=100').then(function (list) {
      var g = list.find(function (x) { return x.files && x.files[FILE]; });
      if (g) return g.id;
      var files = {}; files[FILE] = {content: payload()};
      return gh('POST', '/gists', {description: 'Σιγά σιγά: Greek practice progress', public: false, files: files}).then(function (g) { cfg.created = true; return g.id; });
    }).then(function (id) { cfg.gist = id; saveCfg(); return id; });
  }
  function readGist(id) {
    return gh('GET', '/gists/' + id).then(function (g) {
      var f = g.files[FILE]; if (!f) return null;
      return f.truncated ? fetch(f.raw_url).then(function (r) { return r.text(); }) : f.content;
    });
  }

  var running = null, again = false, dirty = false, timer = null;
  function paint() { if (App.current === 'words' && !document.querySelector('dialog[open]')) App.views.words(); }
  App.syncNow = function () {
    if (!cfg.token) return Promise.resolve();
    if (running) { again = true; return running; }
    App.sync.state = 'busy'; paint();
    var pushing = dirty; dirty = false;   // kept so a failed write is retried
    running = findGist().then(function (id) {
      return readGist(id).then(function (text) {
        var before = snapshot(), remote = null;
        try { remote = text ? JSON.parse(text) : null; } catch (e) {}
        if (remote) merge(S, remote, {settingsBase: cfg.settingsBase == null ? JSON.stringify(S.settings) : cfg.settingsBase});
        afterMerge(before);
        cfg.settingsBase = JSON.stringify(S.settings);
        // write only when this device has something the gist doesn't
        var mine = payload();
        if (remote && JSON.stringify(S.settings) === JSON.stringify(remote.settings) &&
            JSON.stringify(merge(JSON.parse(text), JSON.parse(mine))) === JSON.stringify(remote)) return;
        var files = {}; files[FILE] = {content: mine};
        return gh('PATCH', '/gists/' + id, {files: files});
      });
    }).then(function () {
      App.sync.state = 'idle'; App.sync.error = ''; App.sync.at = cfg.at = Date.now(); saveCfg();
    }).catch(function (e) {
      if (e.status === 404 && cfg.gist) { cfg.gist = null; saveCfg(); again = true; }
      App.sync.state = 'error'; App.sync.error = e.message || String(e);
      dirty = dirty || pushing;
    }).then(function () {
      running = null; paint();
      if (again) { again = false; return App.syncNow(); }
    });
    return running;
  };
  function scheduleSync() {
    if (!cfg.token) return;
    dirty = true;
    clearTimeout(timer); timer = setTimeout(App.syncNow, 20000);
  }
  App.syncConnect = function (token) {
    cfg = {token: token.trim()}; saveCfg();
    App.sync.state = 'idle';
    return App.syncNow().then(function () {
      if (App.sync.state === 'error') { var err = App.sync.error; cfg = {}; saveCfg(); App.sync.state = 'off'; App.sync.error = err; paint(); App.toast('Could not connect: ' + err); }
      else App.toast(cfg.created ? 'Connected. Your progress is now saved to GitHub.' : 'Connected and merged with your saved progress');
    });
  };
  App.syncDisconnect = function () { clearTimeout(timer); cfg = {}; saveCfg(); App.sync.state = 'off'; App.sync.at = 0; paint(); };
  App.syncGistUrl = function () { return cfg.gist ? 'https://gist.github.com/' + cfg.gist : ''; };

  // sync a while after each change, when leaving the page, and when coming back to it
  var save = App.save;
  App.save = function () { save(); scheduleSync(); };
  document.addEventListener('visibilitychange', function () {
    if (!cfg.token) return;
    if (document.hidden) { if (dirty) { clearTimeout(timer); App.syncNow(); } }
    else if (Date.now() - (App.sync.at || 0) > 60000) App.syncNow();
  });
  document.addEventListener('DOMContentLoaded', function () { if (cfg.token) App.syncNow(); });
})();
