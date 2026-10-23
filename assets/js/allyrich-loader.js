/* ==========================================================================
   AllyRich Loader Controller
   Plays on website initial open or page refresh/reload.
   Never plays on in-page taps or collection/product sections.
   ========================================================================== */
(function () {
  var loader = document.getElementById('ForumLoader');
  if (!loader) return;

  var animationTimer1 = null;
  var animationTimer2 = null;
  var capTimer = null;

  function shouldRunLoader() {
    var p = window.location.pathname || '';
    if (p !== '/' && p !== '/index.html' && p !== '') return false;
    // Always run on the homepage when opened or refreshed
    return true;
  }

  function hideLoaderImmediately() {
    if (!loader) return;
    loader.classList.remove('is-active', 'loader--filling', 'loader--lit');
    loader.classList.add('loader--done', 'loader--hidden');
    loader.style.display = 'none';
    loader.style.opacity = '0';
    loader.style.pointerEvents = 'none';
    document.documentElement.style.overflow = '';
  }

  function runLoaderAnimation() {
    if (!loader) return;

    if (!shouldRunLoader()) {
      hideLoaderImmediately();
      return;
    }

    try { document.documentElement.classList.remove('no-loader'); } catch (e) {}

    // Clear existing timers if replaying
    clearTimeout(animationTimer1);
    clearTimeout(animationTimer2);
    clearTimeout(capTimer);

    // Reset classes and styles
    loader.classList.remove('loader--done', 'loader--hidden');
    loader.classList.add('is-active');
    loader.style.display = 'flex';
    loader.style.opacity = '1';
    loader.style.pointerEvents = 'auto';

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function finish() {
      loader.classList.remove('loader--filling');
      loader.classList.add('loader--done');
      loader.style.pointerEvents = 'none';
      document.documentElement.style.overflow = '';
      setTimeout(function () {
        loader.classList.remove('is-active', 'loader--lit');
        loader.classList.add('loader--hidden');
        loader.style.display = 'none';
      }, 650);
    }

    if (reduced) {
      loader.style.transition = 'none';
      finish();
      return;
    }

    document.documentElement.style.overflow = 'hidden';
    capTimer = setTimeout(finish, 3200);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        loader.classList.add('loader--filling');
        // The CSS transition for progress bar and logo clip-path is 1400ms.
        // Wait for 1420ms so it fully unclips and completes progress to 100%,
        // then trigger --lit illumination and hold for 500ms before smooth fade-out.
        animationTimer1 = setTimeout(function () {
          loader.classList.add('loader--lit');
          animationTimer2 = setTimeout(function () {
            clearTimeout(capTimer);
            finish();
          }, 600);
        }, 1500);
      });
    });
  }

  // Run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runLoaderAnimation);
  } else {
    runLoaderAnimation();
  }

  // Expose function for manual developer testing if needed
  window.replayAllyRichLoader = function () {
    runLoaderAnimation();
  };
})();
