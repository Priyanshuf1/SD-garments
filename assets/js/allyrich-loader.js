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
    loader.classList.add('loader--done');
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
    loader.classList.remove('loader--done');
    loader.classList.add('is-active');
    loader.style.display = 'flex';
    loader.style.opacity = '1';
    loader.style.pointerEvents = 'auto';

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function finish() {
      loader.classList.remove('is-active', 'loader--filling', 'loader--lit');
      loader.classList.add('loader--done');
      loader.style.pointerEvents = 'none';
      document.documentElement.style.overflow = '';
      setTimeout(function () {
        loader.style.display = 'none';
      }, 650);
    }

    if (reduced) {
      loader.style.transition = 'none';
      finish();
      return;
    }

    document.documentElement.style.overflow = 'hidden';
    capTimer = setTimeout(finish, 1200);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        loader.classList.add('loader--filling');
        animationTimer1 = setTimeout(function () {
          loader.classList.add('loader--lit');
          animationTimer2 = setTimeout(function () {
            clearTimeout(capTimer);
            finish();
          }, 400);
        }, 450);
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
