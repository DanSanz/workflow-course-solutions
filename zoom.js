/* One zoom level for the course pages. The animation pages, their index, the lab guides, the
   cards and the assessment checklist all load this one file. The run sheet does not, by the
   owner's choice of 19 Nov 2026. It sits on the trainer's second screen, so it keeps the browser's
   own zoom, and a zoom there and a zoom on the projected page never change each other.
   A browser keeps its own zoom for each file address. So a page opened from disk starts at 100%,
   even when the page before was zoomed, and so does the same page with ?manual added. This file
   keeps the level in the browser's local storage instead, under the key course-zoom, which every
   page opened from disk shares, and zooms the page itself.
   - Ctrl and plus, Ctrl and minus, Ctrl with the mouse wheel and a pinch on a touchpad change the
     level in the browser's own steps, from 25% to 500%. The browser's zoom stays as it was.
   - Ctrl and 0 goes back to 100%. The browser sets its own zoom for the page back to 100% too.
   - On a Mac, Cmd does what Ctrl does.
   - The next page opens at the same level. A page already open in another tab follows at once.
   - For two seconds after a change, a line at the top right gives the new level.
   - Print is never zoomed.
   A width media query sees the width of the screen, not of the zoomed page. So that a page still
   switches its layout at the zoomed width, as it would under the browser's own zoom:
   - The width media queries in the page's own style elements are scaled by the level.
   - A linked stylesheet cannot be read from a page opened as a file. It lists the widths it
     switches at in the property --course-zoom-widths on :root instead. While the zoom is not 100%,
     html has the class course-zoomed, and the class zoom-max-800, for example, while the zoomed
     page is 800px wide or less. Part 12 of course.css uses them for the animation pages.
     handout.css lists no widths, so a handout keeps the layout of its screen width.
   Load it in the head, so the page never shows at another level first. A handout loads it from
   beside handout.css, as zoom.js or ../zoom.js. An animation page and the index load
   ../../handouts/zoom.js, and the assessment checklist ../handouts/zoom.js. So the handouts folder
   stays beside the animations folder, as ruling 75 asks already.
   Without this file, or with storage blocked, a page works as before with the browser's zoom.
   It uses no network. */
(function () {
  'use strict';
  if (window.courseZoom) return; /* loaded twice */
  var KEY = 'course-zoom';
  var STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
  var doc = document, root = doc.documentElement, level = 1, pill = null, pillT = null, wheelSum = 0;
  var mac = /Mac/.test(navigator.platform || navigator.userAgent);
  var scaled = typeof WeakMap === 'function' ? new WeakMap() : null;

  /* the zoom and the look of the line are one style element, built here and changed by apply */
  var css = doc.createElement('style');
  (doc.head || doc.documentElement).appendChild(css);

  function read() {
    var z = NaN;
    try { z = parseFloat(localStorage.getItem(KEY)); } catch (e) {}
    return z >= STEPS[0] && z <= STEPS[STEPS.length - 1] ? z : 1;
  }

  function apply(z) {
    level = z;
    /* --course-zoom lets a page's own styles divide a vw or vh length by the level, because under
       this zoom those units grow with the page. The line keeps one size at every level. */
    css.textContent = '@media screen{' + (z === 1 ? '' : 'html{zoom:' + z + ';--course-zoom:' + z + '}') +
      '.course-zoom{zoom:' + (1 / z) + ';position:fixed;top:12px;right:12px;z-index:2147483647;margin:0;' +
      'padding:6px 12px;border-radius:8px;background:#141a28;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.35);' +
      'font:600 15px/1.35 "Segoe UI",system-ui,Arial,sans-serif;pointer-events:none}' +
      '.course-zoom[hidden]{display:none}}@media print{.course-zoom{display:none}}';
    mark();
    scaleMedia();
  }

  /* the classes for a linked stylesheet's widths, measured at the zoomed width */
  function mark() {
    var on = level !== 1, w = window.innerWidth / level, list = [];
    root.classList.toggle('course-zoomed', on);
    try { list = getComputedStyle(root).getPropertyValue('--course-zoom-widths').trim().split(/\s+/); } catch (e) {}
    list.forEach(function (t) { if (+t > 0) root.classList.toggle('zoom-max-' + t, on && w <= +t); });
  }

  /* the width media queries of the page's own style elements, scaled by the level. The first text
     of each query is kept, so going back to 100% gives it back. */
  function scaleMedia() {
    if (!scaled || typeof CSSMediaRule === 'undefined') return;
    Array.prototype.forEach.call(doc.styleSheets, function (sheet) {
      var node = sheet.ownerNode, rules;
      if (!node || node === css || node.tagName !== 'STYLE') return;
      try { rules = sheet.cssRules; } catch (e) { return; }
      Array.prototype.forEach.call(rules, function (r) {
        if (!(r instanceof CSSMediaRule)) return;
        if (!scaled.has(r)) scaled.set(r, r.media.mediaText);
        var text = scaled.get(r).replace(/((?:min|max)-width\s*:\s*)([\d.]+)(px|rem|em)/g, function (m, a, n, u) {
          return a + Math.round(n * level * 100) / 100 + u;
        });
        if (r.media.mediaText !== text) r.media.mediaText = text;
      });
    });
  }

  function tell(z) {
    if (!doc.body) return;
    if (!pill) {
      pill = doc.createElement('p');
      pill.className = 'course-zoom';
      pill.setAttribute('role', 'status');
      doc.body.appendChild(pill);
    }
    pill.textContent = 'Zoom ' + Math.round(z * 100) + '%, kept for the next page.' +
      (z === 1 ? '' : ' Ctrl+0 goes back to 100%.');
    pill.hidden = false;
    clearTimeout(pillT);
    pillT = setTimeout(function () { pill.hidden = true; }, 2000);
  }

  function change(z) {
    if (z === level) return;
    var keep = places();
    apply(z);
    restore(keep);
    /* page scripts that measure on resize measure again, as after a browser zoom */
    window.dispatchEvent(new Event('resize'));
  }

  /* The reader's place, kept across a change of level. For the window, and for each part of the
     page that is scrolled part way, such as open presenter notes, it notes the element whose top is
     nearest the top edge, among those still in view, and where the edge falls on that element, as
     a share of its height. After the change it scrolls each one so that the edge falls at the same
     share of the same element. */
  function places() {
    var all = doc.body ? doc.body.getElementsByTagName('*') : [], list = [], i;
    if (window.scrollY > 0) list.push({ box: null });
    for (i = 0; i < all.length; i++) if (all[i].scrollTop > 0) list.push({ box: all[i] });
    list.forEach(function (p) {
      var edge = edgeOf(p.box), items = p.box ? p.box.getElementsByTagName('*') : all;
      var best = null, gap = Infinity, height = Infinity, j, r, g;
      for (j = 0; j < items.length; j++) {
        r = items[j].getBoundingClientRect();
        if (!r.width || !r.height || r.bottom <= edge) continue;
        g = Math.abs(r.top - edge);
        if ((g < gap || (g === gap && r.height < height)) && (p.box || scrollsWithPage(items[j]))) {
          best = items[j]; gap = g; height = r.height;
        }
      }
      p.el = best;
      if (best) { r = best.getBoundingClientRect(); p.frac = (edge - r.top) / r.height; }
    });
    return list.filter(function (p) { return p.el; });
  }
  function edgeOf(box) { return box ? box.getBoundingClientRect().top : 0; }
  /* a fixed bar, such as the controls or the notes, does not move when the window scrolls */
  function scrollsWithPage(el) {
    for (var e = el; e && e !== doc.body; e = e.parentElement) {
      var pos = getComputedStyle(e).position;
      if (pos === 'fixed' || pos === 'sticky') return false;
    }
    return true;
  }
  function restore(list) {
    list.forEach(function (p) {
      /* twice, because a page that grows or shrinks can stop a scroll short the first time */
      for (var k = 0; k < 2; k++) {
        var r = p.el.getBoundingClientRect(), d = r.top - (edgeOf(p.box) - p.frac * r.height);
        if (Math.abs(d) < 1) return;
        /* the window scrolls in screen pixels, a zoomed part of the page in its own */
        if (p.box) p.box.scrollTo({ top: p.box.scrollTop + d / (p.box.currentCSSZoom || level), behavior: 'instant' });
        else window.scrollTo({ top: window.scrollY + d, behavior: 'instant' });
      }
    });
  }

  function set(z) {
    try { localStorage.setItem(KEY, String(z)); } catch (e) {}
    change(z);
    tell(z);
  }

  function step(dir) {
    var i;
    if (dir > 0) { for (i = 0; i < STEPS.length; i++) if (STEPS[i] > level + 0.001) return set(STEPS[i]); }
    else { for (i = STEPS.length - 1; i >= 0; i--) if (STEPS[i] < level - 0.001) return set(STEPS[i]); }
    tell(level); /* already at the end of the range */
  }

  /* capture on window comes before every page script */
  window.addEventListener('keydown', function (e) {
    if (!(e.ctrlKey || (mac && e.metaKey)) || e.altKey) return;
    var k = e.key, c = e.code;
    if (k === '+' || k === '=' || c === 'Equal' || c === 'NumpadAdd') { e.preventDefault(); step(1); }
    else if (k === '-' || k === '_' || c === 'Minus' || c === 'NumpadSubtract') { e.preventDefault(); step(-1); }
    /* no preventDefault here, so the browser's zoom of the page goes back to 100% as well */
    else if (k === '0' || c === 'Digit0' || c === 'Numpad0') set(1);
  }, true);

  /* a pinch on a touchpad reaches the page as the wheel with Ctrl. One notch of a mouse wheel is
     one step. A pinch adds up its small moves to the size of a notch. */
  window.addEventListener('wheel', function (e) {
    if (!e.ctrlKey) return;
    e.preventDefault();
    var d = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 800 : 1);
    if (wheelSum && (d < 0) !== (wheelSum < 0)) wheelSum = 0;
    wheelSum += d;
    if (Math.abs(wheelSum) >= 50) { step(wheelSum < 0 ? 1 : -1); wheelSum = 0; }
  }, { passive: false, capture: true });

  /* another tab changed the level */
  window.addEventListener('storage', function (e) {
    if (e.key === KEY || e.key === null) change(read());
  });
  /* the browser's back button can show a page kept from before the change */
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) change(read());
  });
  /* a new window width can cross one of the widths */
  window.addEventListener('resize', mark);

  window.courseZoom = { level: function () { return level; } };
  apply(read());

  /* the page's own style elements come after this file, so their queries are scaled as they arrive,
     and once more when the page is read in full */
  if (doc.readyState === 'loading') {
    var watch = window.MutationObserver && new MutationObserver(function (records) {
      for (var i = 0; i < records.length; i++) {
        for (var j = 0; j < records[i].addedNodes.length; j++) {
          if (records[i].addedNodes[j].nodeName === 'STYLE') { scaleMedia(); return; }
        }
      }
    });
    if (watch) watch.observe(root, { childList: true, subtree: true });
    doc.addEventListener('DOMContentLoaded', function () {
      if (watch) watch.disconnect();
      scaleMedia();
    });
  }
})();
