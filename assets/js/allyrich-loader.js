/* ==========================================================================
   AllyRich Loader Controller
   Plays on website initial open or page refresh/reload.
   Guarantees the loader covers the screen immediately (Frame 0)
   and ONLY reveals the website after the luxury animation finishes.
   ========================================================================== */
(function () {
  var p = window.location.pathname || '';
  var isHome = (p === '/' || p === '/index.html' || p === '');

  function getLoader() {
    return document.getElementById('ForumLoader');
  }

  var animationTimer1 = null;
  var animationTimer2 = null;
  var capTimer = null;
  var isFinished = false;

  function finish() {
    if (isFinished) return;
    isFinished = true;

    clearTimeout(animationTimer1);
    clearTimeout(animationTimer2);
    clearTimeout(capTimer);

    var loader = getLoader();
    if (!loader) {
      document.documentElement.classList.remove('ar-loading');
      document.documentElement.style.overflow = '';
      return;
    }

    loader.querySelectorAll('video').forEach(function (v) { try { v.pause(); } catch (e) {} });
    loader.classList.remove('loader--filling');
    loader.classList.add('loader--done');
    loader.style.pointerEvents = 'none';

    document.documentElement.classList.remove('ar-loading');
    document.documentElement.style.overflow = '';

    setTimeout(function () {
      loader.classList.remove('is-active', 'loader--lit');
      loader.classList.add('loader--hidden');
      loader.style.display = 'none';
    }, 650);
  }

  function startSequence() {
    if (!isHome) {
      var l = getLoader();
      if (l) l.style.display = 'none';
      document.documentElement.classList.remove('ar-loading');
      return;
    }

    var loader = getLoader();
    if (!loader) return;

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) {
      loader.style.transition = 'none';
      finish();
      return;
    }

    // Step 1: Start filling animation
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        loader.classList.add('loader--filling');

        // Step 2: Shine / lit state at 800ms
        animationTimer1 = setTimeout(function () {
          loader.classList.add('loader--lit');

          // Step 3: Complete & dissolve into website at 1200ms
          animationTimer2 = setTimeout(function () {
            finish();
          }, 400);
        }, 800);
      });
    });

    // Hard fallback cap at 2.2 seconds in case of slow assets
    capTimer = setTimeout(finish, 2200);
  }

  // Start sequence immediately if loader element is present in DOM
  if (getLoader()) {
    startSequence();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startSequence);
  } else {
    startSequence();
  }

  // Also finish when window fully loads if sequence is ready
  window.addEventListener('load', function() {
    setTimeout(function() {
      if (!isFinished && document.getElementById('ForumLoader')?.classList.contains('loader--lit')) {
        finish();
      }
    }, 300);
  });

  // Expose function for manual developer testing
  window.replayAllyRichLoader = function () {
    isFinished = false;
    var loader = getLoader();
    if (!loader) return;
    document.documentElement.classList.add('ar-loading');
    loader.style.display = 'flex';
    loader.style.opacity = '1';
    loader.style.pointerEvents = 'auto';
    loader.classList.remove('loader--done', 'loader--hidden');
    loader.classList.add('is-active');
    startSequence();
  };
})();
