/*
 * Light and dark theme switch.
 * Light is the default. The choice is remembered in localStorage.
 * Loaded in <head> so the saved theme is applied before the page paints.
 */
(function () {
  'use strict';

  var KEY = 'c4-theme';
  var root = document.documentElement;

  function saved() {
    try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light'; }
    catch (e) { return 'light'; }
  }

  function apply(theme) {
    root.setAttribute('data-theme', theme);
    window.dispatchEvent(new Event('c4-theme'));
  }

  root.setAttribute('data-theme', saved());

  var SUN = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

  document.addEventListener('DOMContentLoaded', function () {
    var nav = document.querySelector('.nav');
    if (!nav) return;

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'theme-toggle';

    function paint() {
      var dark = root.getAttribute('data-theme') === 'dark';
      btn.innerHTML = dark ? SUN : MOON;
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.title = dark ? 'Switch to light mode' : 'Switch to dark mode';
    }

    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(KEY, next); } catch (e) { /* private mode: still switch */ }
      apply(next);
      paint();
    });

    paint();
    nav.appendChild(btn);
  });
})();
