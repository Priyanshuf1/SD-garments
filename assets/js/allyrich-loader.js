/* ==========================================================================
   AllyRich Loader Controller
   Plays ONLY ONCE when page is opened or refreshed.
   Never replays on button taps or internal link navigations.
   ========================================================================== */
(function () {
  var loader = document.getElementById('ForumLoader');
  if (!loader) return;

  var animationTimer1 = null;
  var animationTimer2 = null;
  var capTimer = null;

  function isPageRefresh() {
    try {
      if (window.performance && typeof performance.getEntriesByType === 'function') {
        var navEntries = performance.getEntriesByType('navigation');
        if (navEntries && navEntries.length > 0) {
          return navEntries[0].type === 'reload';
        }
      }
      if (window.performance && window.performance.navigation) {
        return window.performance.navigation.type === 1; // TYPE_RELOAD
      }
    } catch (e) {}
    return false;
  }

  function shouldRunLoader() {
    // 1. If user refreshed the page, always run
    if (isPageRefresh()) {
      return true;
    }
    // 2. If opening page for first time in session, run
    try {
      var hasSeen = sessionStorage.getItem('allyrich_loader_seen');
      if (!hasSeen) {
        sessionStorage.setItem('allyrich_loader_seen', 'true');
        return true;
      }
    } catch (e) {
      return false;
    }
    // 3. Otherwise (clicking buttons, internal page browsing), do not run
    return false;
  }

  function hideLoaderImmediately() {
    if (!loader) return;
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

    // Clear existing timers if replaying
    clearTimeout(animationTimer1);
    clearTimeout(animationTimer2);
    clearTimeout(capTimer);

    // Reset classes and styles
    loader.classList.remove('loader--done', 'loader--filling', 'loader--lit');
    loader.style.display = 'flex';
    loader.style.opacity = '1';
    loader.style.pointerEvents = 'auto';

    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function finish() {
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
    capTimer = setTimeout(finish, 2800);

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        loader.classList.add('loader--filling');
        animationTimer1 = setTimeout(function () {
          loader.classList.add('loader--lit');
          animationTimer2 = setTimeout(function () {
            clearTimeout(capTimer);
            finish();
          }, 750);
        }, 1200);
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
    try { sessionStorage.removeItem('allyrich_loader_seen'); } catch (e) {}
    runLoaderAnimation();
  };
})();
