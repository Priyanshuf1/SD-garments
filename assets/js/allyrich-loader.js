/* ==========================================================================
   AllyRich Loader Controller
   Self-contained fail-safe: ensures page scroll is never blocked.
   ========================================================================== */
(function () {
  document.documentElement.classList.remove('ar-loading');
  document.documentElement.style.overflow = '';
  if (document.body) document.body.style.overflow = '';
  var loader = document.getElementById('ForumLoader');
  if (loader && (window.location.pathname !== '/' && window.location.pathname !== '/index.html' && window.location.pathname !== '')) {
    loader.style.display = 'none';
    loader.classList.add('loader--done', 'loader--hidden');
  }
})();
