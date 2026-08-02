// Registers the Scrubby PWA service worker and — crucially — forces a fresh
// update check on every page load so a newly deployed sw.js (with a bumped
// CACHE version) is discovered without the user having to hard-refresh.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', function () {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then(function (registration) {
        // Poll for an updated sw.js on every load. Browsers already do this once
        // per page, but a hard call guarantees the check happens for PWAs that
        // stayed open for days.
        registration.update();
      })
      .catch(function (err) {
        console.warn('Service worker registration failed:', err);
      });

    // When a new SW takes over the page, auto-reload once so the fresh JS
    // bundle is actually running.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  });
}
