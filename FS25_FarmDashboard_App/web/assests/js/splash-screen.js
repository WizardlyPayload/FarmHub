/**
 * Splash: dismiss after first local /api/data merge.
 * Minimum ~5s on screen (branding + progress); cap before fade from first notify.
 */
(function () {
  window.__farmDashSplashAt = Date.now();
  var scheduled = false;
  var dismissed = false;

  function doDismiss() {
    if (dismissed) return;
    dismissed = true;
    var bootPaint = document.getElementById('farmdash-boot-paint');
    if (bootPaint && bootPaint.parentNode) {
      bootPaint.parentNode.removeChild(bootPaint);
    }
    var el = document.getElementById('splash-screen');
    var bar = document.getElementById('farm-splash-progress-bar');
    if (bar) {
      bar.classList.add('farm-splash-progress-bar--done');
    }
    document.body.classList.remove('has-farmdash-splash');
    if (!el) {
      try {
        document.dispatchEvent(new CustomEvent('farmdash-first-data-ready', { bubbles: true }));
      } catch (e) {}
      return;
    }
    el.setAttribute('aria-busy', 'false');
    /** Let the progress bar finish to 100% briefly before fading the overlay */
    setTimeout(function () {
      el.classList.add('fade-out');
      setTimeout(function () {
        el.classList.add('d-none');
        el.setAttribute('aria-hidden', 'true');
        try {
          document.dispatchEvent(new CustomEvent('farmdash-first-data-ready', { bubbles: true }));
        } catch (e2) {}
      }, 500);
    }, 320);
  }

  window.farmDashNotifyDataReady = function farmDashNotifyDataReady() {
    if (scheduled) return;
    scheduled = true;
    var start = window.__farmDashSplashAt || Date.now();
    var elapsed = Date.now() - start;
    /** Show splash at least ~5s locally; remote/demo viewers get a shorter gate. */
    var minMs = window.__farmDashRemoteViewer ? 1200 : 5200;
    /** Hard cap: fade by this time even if data was slow */
    var maxFromStart = 14000;
    var delay = 0;
    if (elapsed < minMs) delay = minMs - elapsed;
    if (elapsed + delay > maxFromStart) delay = Math.max(0, maxFromStart - elapsed);
    setTimeout(doDismiss, delay);
  };

  /** Safety: never stuck forever if merge hooks miss — still reveal shell if hidden */
  setTimeout(function () {
    if (!dismissed && !scheduled) {
      scheduled = true;
      try {
        var landing = document.getElementById('landing-page');
        if (landing && landing.classList.contains('d-none') && window.dashboard) {
          if (typeof window.dashboard.showDashboard === 'function') {
            window.dashboard.showDashboard();
          } else {
            landing.classList.remove('d-none');
            document.getElementById('main-navbar')?.classList.remove('d-none');
          }
        }
      } catch (e) {}
      doDismiss();
    }
  }, 18000);
})();
