/**
 * Keeps the tablet/phone screen on while the dashboard tab is in the foreground.
 *
 * 1) Screen Wake Lock API (Chrome, Edge, Samsung Internet, Safari 16.4+)
 * 2) Fallback: tiny hidden <video> fed by a canvas stream (media-style playback)
 *    when Wake Lock is missing or denied — helps some WebViews / older browsers.
 */
(function () {
  var wakeLock = null;
  var acquiring = false;
  var fallbackStarted = false;
  var reacquireTimer = null;
  var videoEl = null;

  var REACQUIRE_MS = 3.5 * 60 * 1000;

  async function requestWakeLock() {
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== "function") {
      return false;
    }
    if (document.visibilityState !== "visible") {
      return false;
    }
    if (wakeLock && wakeLock.released === false) {
      return true;
    }
    if (acquiring) {
      return false;
    }
    acquiring = true;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", function () {
        wakeLock = null;
        if (document.visibilityState === "visible") {
          requestWakeLock();
        }
      });
      return true;
    } catch (e) {
      return false;
    } finally {
      acquiring = false;
    }
  }

  function startCanvasVideoFallback() {
    if (fallbackStarted) {
      return;
    }
    fallbackStarted = true;
    try {
      var canvas = document.createElement("canvas");
      canvas.width = 4;
      canvas.height = 4;
      var ctx = canvas.getContext("2d");
      if (!ctx || !canvas.captureStream) {
        return;
      }
      function tick() {
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 4, 4);
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(0, 0, 2 + (Date.now() % 2), 2 + (Date.now() % 2));
        requestAnimationFrame(tick);
      }
      tick();
      var stream = canvas.captureStream(8);
      videoEl = document.createElement("video");
      videoEl.setAttribute("playsinline", "");
      videoEl.setAttribute("muted", "");
      videoEl.muted = true;
      videoEl.defaultMuted = true;
      videoEl.autoplay = true;
      videoEl.loop = true;
      videoEl.setAttribute("aria-hidden", "true");
      videoEl.tabIndex = -1;
      videoEl.style.cssText =
        "position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.02;pointer-events:none;z-index:0;border:0;";
      videoEl.srcObject = stream;
      document.body.appendChild(videoEl);
      function tryPlay() {
        if (videoEl) {
          videoEl.play().catch(function () {});
        }
      }
      document.addEventListener("pointerdown", tryPlay, { capture: true });
      document.addEventListener("touchstart", tryPlay, { capture: true, passive: true });
      window.addEventListener("pageshow", tryPlay);
      tryPlay();
    } catch (e) {
      /* ignore */
    }
  }

  function scheduleReacquire() {
    if (reacquireTimer) {
      clearInterval(reacquireTimer);
      reacquireTimer = null;
    }
    if (!navigator.wakeLock || typeof navigator.wakeLock.request !== "function") {
      return;
    }
    reacquireTimer = setInterval(function () {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (wakeLock && wakeLock.released === false) {
        return;
      }
      requestWakeLock();
    }, REACQUIRE_MS);
  }

  async function init() {
    var ok = await requestWakeLock();
    if (ok) {
      scheduleReacquire();
      return;
    }
    if (!("wakeLock" in navigator)) {
      startCanvasVideoFallback();
      return;
    }
    var t = setTimeout(function () {
      if (!wakeLock || wakeLock.released !== false) {
        startCanvasVideoFallback();
      }
    }, 800);
    document.addEventListener(
      "pointerdown",
      function first() {
        clearTimeout(t);
        requestWakeLock().then(function (w) {
          if (w) {
            scheduleReacquire();
          } else {
            startCanvasVideoFallback();
          }
        });
      },
      { once: true, capture: true }
    );
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      requestWakeLock().then(function (w) {
        if (w) {
          scheduleReacquire();
        }
      });
    }
  });
  window.addEventListener("focus", function () {
    requestWakeLock();
  });
  window.addEventListener("pageshow", function () {
    requestWakeLock();
  });

  document.addEventListener(
    "pointerdown",
    function () {
      requestWakeLock();
    },
    { capture: true }
  );

  init();
})();
