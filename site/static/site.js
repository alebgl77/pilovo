// Progressive enhancement only: every section is readable without this file. No storage, no requests.
(function () {
  var d = document, root = d.documentElement, w = window;
  var items = [].slice.call(d.querySelectorAll('.reveal'));
  if ('IntersectionObserver' in w && items.length) {
    // The observer's first report says which items are already on screen, without forcing a layout:
    // those stay visible, and only then does the hiding class apply to the others.
    var ready = false;
    var io = new IntersectionObserver(function (entries) {
      var vh = w.innerHeight;
      entries.forEach(function (e) {
        var r = e.boundingClientRect;
        if (e.isIntersecting || (!ready && r.top < vh && r.bottom > 0)) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
      if (!ready) { ready = true; root.classList.add('js'); }
    }, { rootMargin: '0px 0px -10% 0px' });
    items.forEach(function (el) { io.observe(el); });
  }

  function openFromHash() {
    var id = decodeURIComponent(location.hash.slice(1));
    var el = id && d.getElementById(id);
    if (el && el.tagName === 'DETAILS') el.open = true;
  }
  openFromHash();
  w.addEventListener('hashchange', openFromHash);

  // Tour: autoplays muted only when motion is welcome. Under reduced motion (or Save-Data) it rests on its
  // poster and plays only from the site's toggle, which meets WCAG 2.2.2 like the browser's own controls but
  // never covers the caption bar burned into the video. Native controls stay only without this script or
  // after a playback failure. A pause from the toggle is kept.
  var video = d.querySelector('[data-tour]'), toggle = d.querySelector('[data-tour-toggle]');
  if (!video || !toggle || !('IntersectionObserver' in w)) return;
  var reduce = w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)');
  var saveData = !!(navigator.connection && navigator.connection.saveData);
  var auto = false, wanted = false, held = false, seen = false, failed = false;
  function show() { toggle.setAttribute('data-state', video.paused ? 'paused' : 'playing'); }
  function controls(on) {
    if (on) video.setAttribute('controls', ''); else video.removeAttribute('controls');
    // Keyboard focus moves to the player before its toggle goes away.
    if (on && d.activeElement === toggle) video.focus();
  }
  function fail() {
    failed = true; auto = false; wanted = false;
    video.pause();
    controls(true);
    toggle.removeAttribute('data-ready');
  }
  function play() {
    if (failed) return;
    // Nothing is fetched before the tour is wanted: the markup keeps preload="none".
    video.preload = 'auto';
    var p = video.play();
    // A pause() before the first frame rejects the pending play() with AbortError: not a failure.
    if (p && p.catch) p.catch(function (e) { if (!e || e.name !== 'AbortError') fail(); });
  }
  function start() {
    if (!wanted || held || !seen || d.hidden) return;
    play();
  }
  function setMode() {
    var still = !!(reduce && reduce.matches);
    auto = !still && !saveData;
    wanted = auto;
    if (still) video.pause();
    show();
    start();
  }
  // Each source the browser cannot use moves on to the next one; only the last failure, or an error
  // on the element itself, gives up and restores the native controls.
  var sources = video.querySelectorAll('source');
  if (sources.length) sources[sources.length - 1].addEventListener('error', fail);
  video.addEventListener('error', fail);
  video.addEventListener('play', show);
  video.addEventListener('pause', show);
  toggle.addEventListener('click', function () {
    if (video.paused) { held = false; wanted = true; play(); } else { held = true; video.pause(); }
  });
  // A short dwell before autoplay: a deep link (#install) or a quick scroll past never fetches the tour.
  var dwell = 0;
  new IntersectionObserver(function (entries) {
    seen = entries[entries.length - 1].intersectionRatio >= 0.25;
    clearTimeout(dwell);
    if (seen) dwell = setTimeout(start, 400); else video.pause();
  }, { threshold: [0, 0.25] }).observe(video);
  d.addEventListener('visibilitychange', function () { if (d.hidden) video.pause(); else start(); });
  if (reduce && reduce.addEventListener) reduce.addEventListener('change', function () { if (!failed) setMode(); });
  video.muted = true;
  controls(false);
  toggle.setAttribute('data-ready', '');
  setMode();
})();
