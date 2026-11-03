/* Shared by Review and Play: building a Greek word from its own letters, and the list of answers after a round. */
'use strict';
(function () {
  var u = App.u, esc = u.esc;
  // Latin keys as on a Greek keyboard, so typing works without switching layouts; ";" puts an accent on the next vowel
  var LAT = {a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', u: 'θ', i: 'ι', k: 'κ', l: 'λ', m: 'μ', n: 'ν', j: 'ξ', o: 'ο', p: 'π', r: 'ρ', s: 'σ', t: 'τ', y: 'υ', f: 'φ', x: 'χ', c: 'ψ', v: 'ω', w: 'ς'};
  var ACC = {'α': 'ά', 'ε': 'έ', 'η': 'ή', 'ι': 'ί', 'ο': 'ό', 'υ': 'ύ', 'ω': 'ώ'};
  var LETTER = /[Ͱ-Ͽἀ-῿]/;
  var ARTCLS = {'ο': 'g-m', 'η': 'g-f', 'το': 'g-n', 'οι': '', 'τα': 'g-n'};
  var active = null;

  function letters(w) { return Array.from(App.keyOf(w.greek).normalize('NFC')); }
  App.spellable = function (w) {
    var k = App.keyOf(w.greek), n = letters(w).filter(function (c) { return LETTER.test(c); }).length;
    return n >= 2 && n <= 16 && !/[a-z]/i.test(k);
  };
  /* true while a tile board is waiting for letters (Review uses it to leave the keys alone) */
  App.spellBusy = function () { return !!active && active.busy(); };

  /* Draws a tile board for word w into box. opts.onFull runs when every letter (and the article) is placed,
     opts.onEnter when Enter is pressed. */
  App.spell = function (box, w, opts) {
    opts = opts || {};
    if (active) active.off();
    var target = letters(w);
    var m = w.greek.trim().match(/^(ο|η|το|οι|τα)\s+/), art = m ? m[1] : null;
    var arts = !art ? null : art === 'οι' || art === 'τα' ? ['οι', 'τα'] : ['ο', 'η', 'το'];
    var slots = [];   // positions in target that take a letter tile
    target.forEach(function (c, i) { if (LETTER.test(c)) slots.push(i); });
    var right = slots.map(function (i) { return target[i]; });
    var tiles = u.shuffle(right);
    for (var n = 0; n < 6 && right.length > 1 && tiles.join('') === right.join(''); n++) tiles = u.shuffle(right);
    var placed = [], pickedArt = null, hints = 0, locked = false, accent = false;

    function draw() {
      var html = '';
      if (arts) html += '<div class="sp-art">' + arts.map(function (a, i) {
        var cls = ARTCLS[a] + (a === pickedArt ? ' on' : '') + (locked && a === pickedArt ? (a === art ? ' right' : ' wrong') : '');
        return '<button data-a="' + i + '" class="' + cls + '">' + a + '</button>';
      }).join('') + '</div>';
      html += '<div class="sp-word">';
      var k = 0;
      target.forEach(function (c) {
        if (!LETTER.test(c)) { html += c === ' ' ? '<span class="sp-gap"></span>' : '<span class="sp-fx">' + esc(c) + '</span>'; return; }
        var t = placed[k], cls = 'sp-sl' + (t != null ? ' full' : '') + (!locked && k === placed.length ? ' cur' : '');
        if (locked) cls += t != null && tiles[t] === c ? ' right' : ' wrong';
        html += '<button class="' + cls + '" data-k="' + k + '">' + (t != null ? esc(tiles[t]) : '') + '</button>';
        k++;
      });
      html += '</div>';
      if (!locked) html += '<div class="sp-pool">' + tiles.map(function (c, j) {
        return '<button data-t="' + j + '"' + (placed.indexOf(j) >= 0 ? ' class="used" disabled' : '') + '>' + esc(c) + '</button>';
      }).join('') + '</div><div class="sp-tools"><button class="btn sm ghost" data-x="back" title="Remove the last letter (Backspace)">⌫ Back</button><button class="btn sm ghost" data-x="hint">Hint</button></div>';
      box.innerHTML = html;
    }
    function full() { return placed.length === slots.length && (!arts || pickedArt); }
    function changed() { draw(); if (full() && opts.onFull) opts.onFull(); }
    function put(j) { if (placed.length < slots.length && placed.indexOf(j) < 0) { placed.push(j); changed(); } }
    function back() { if (placed.length) { placed.pop(); draw(); } }
    function hint() {
      var k = 0; while (k < placed.length && tiles[placed[k]] === right[k]) k++;
      placed = placed.slice(0, k);
      if (k < slots.length) placed.push(tiles.findIndex(function (c, j) { return c === right[k] && placed.indexOf(j) < 0; }));
      else if (arts) pickedArt = art;
      hints++; changed();
    }
    box.onclick = function (e) {
      var b = e.target.closest('button'); if (!b || locked) return;
      if (b.dataset.a != null) { pickedArt = arts[+b.dataset.a]; changed(); }
      else if (b.dataset.t != null) put(+b.dataset.t);
      else if (b.dataset.k != null) { if (+b.dataset.k < placed.length) { placed.splice(+b.dataset.k, 1); draw(); } }
      else if (b.dataset.x === 'back') back();
      else if (b.dataset.x === 'hint') hint();
    };
    function key(e) {
      if (!box.isConnected) return off();
      if (locked || e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (e.key === 'Enter') { if (opts.onEnter) { e.preventDefault(); opts.onEnter(); } return; }
      if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
      if (arts && /^[1-3]$/.test(e.key) && arts[+e.key - 1]) { pickedArt = arts[+e.key - 1]; changed(); return; }
      if (e.key === ';' || e.key === '΄') { accent = true; return; }
      var ch = e.key.length === 1 ? e.key.toLowerCase() : '';
      ch = LAT[ch] || ch;
      if (!LETTER.test(ch)) return;
      if (accent && ACC[ch]) ch = ACC[ch];
      accent = false;
      var free = tiles.map(function (c, j) { return j; }).filter(function (j) { return placed.indexOf(j) < 0 && u.fold(tiles[j]) === u.fold(ch); });
      if (!free.length) return;
      e.preventDefault();
      var exact = free.filter(function (j) { return tiles[j] === ch; });
      put(exact.length ? exact[0] : free[0]);
    }
    function off() { document.removeEventListener('keydown', key); if (active === api) active = null; }
    document.addEventListener('keydown', key);

    var api = {
      busy: function () { return !locked && box.isConnected; },
      off: off,
      lock: function () { locked = true; off(); draw(); },
      result: function () {
        var k = 0;
        var built = target.map(function (c) { return LETTER.test(c) ? (placed[k] != null ? tiles[placed[k++]] : (k++, '_')) : c; }).join('');
        var lettersOk = placed.length === slots.length && placed.every(function (t, i) { return tiles[t] === right[i]; });
        var artOk = !arts || pickedArt === art;
        return {ok: lettersOk && artOk, lettersOk: lettersOk, artOk: artOk, hints: hints, said: (pickedArt ? pickedArt + ' ' : arts ? '… ' : '') + built};
      }
    };
    active = api;
    draw();
    return api;
  };

  /* The answers from a round: mistakes first, then the ones that were right. Tap a row to hear it.
     items: {ok, gr, en, note, cls} */
  App.resultList = function (items) {
    if (!items || !items.length) return '';
    var bad = items.filter(function (x) { return !x.ok; }), good = items.filter(function (x) { return x.ok; });
    function row(x) {
      return '<div class="rr ' + (x.ok ? 'ok' : 'bad') + '" data-say="' + esc(x.say || x.gr) + '"><span class="mk">' + (x.ok ? '✓' : '✗') + '</span>' +
        '<span class="gr ' + (x.cls || '') + '">' + esc(x.gr) + '</span><span class="en">' + esc(x.en || '') + (x.note ? '<small>' + esc(x.note) + '</small>' : '') + '</span></div>';
    }
    return '<div class="rlist">' + (bad.length ? '<h3>Wrong (' + bad.length + ')</h3>' + bad.map(row).join('') : '') +
      (good.length ? '<h3>Right (' + good.length + ')</h3>' + good.map(row).join('') : '') + '</div>';
  };
  document.addEventListener('click', function (e) { var r = e.target.closest && e.target.closest('.rr[data-say]'); if (r) App.say(r.dataset.say); });
})();
