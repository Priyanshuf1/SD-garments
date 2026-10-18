/* ==========================================================================
   AllyRich Loader Controller
   Extracted from RitikPal26/allyrich-loader
   ========================================================================== */
(function () {
  var loader = document.getElementById('ForumLoader');
  var animationTimer1 = null;
  var animationTimer2 = null;
  var capTimer = null;

  function runLoaderAnimation() {
    if (!loader) return;

    // Clear existing timers if replaying
    clearTimeout(animationTimer1);
    clearTimeout(animationTimer2);
    clearTimeout(capTimer);

    // Reset classes and styles
    loader.classList.remove('loader--done', 'loader--filling', 'loader--lit');
    loader.style.display = 'flex';
    loader.style.opacity = '1';
    loader.style.pointerEvents = 'auto';

    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function finish() {
      loader.classList.add('loader--done');
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
    capTimer = setTimeout(finish, 3500);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        loader.classList.add('loader--filling');
        animationTimer1 = setTimeout(function () {
          loader.classList.add('loader--lit');
          animationTimer2 = setTimeout(function () {
            clearTimeout(capTimer);
            finish();
          }, 850);
        }, 1400);
      });
    });
  }

  // Initial run on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', runLoaderAnimation);
  } else {
    runLoaderAnimation();
  }

  // Expose global function to replay anytime
  window.replayAllyRichLoader = runLoaderAnimation;
})();
