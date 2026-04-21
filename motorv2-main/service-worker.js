const CACHE_NAME = "motor-estudo-shell-v20260421";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/data/study-data.json",
  "./assets/data/ui-config.json",
  "./assets/css/app.css",
  "./assets/css/base.css",
  "./assets/css/dashboard.css",
  "./assets/css/calendar.css",
  "./assets/css/grades.css",
  "./assets/css/week.css",
  "./assets/css/flashcards.css",
  "./assets/js/polyfills.js",
  "./assets/js/app-data.js",
  "./assets/js/store.js",
  "./assets/js/dates.js",
  "./assets/js/theme.js",
  "./assets/js/backup.js",
  "./assets/js/sync-service.js",
  "./assets/js/app-core.js",
  "./assets/js/app-pages.js",
  "./assets/js/week-planner.js",
  "./assets/js/study-features.js",
  "./assets/js/flashcards-exams.js",
  "./assets/js/app-actions.js",
  "./assets/js/app-init.js",
  "./assets/js/firebase-init.js",
  "./assets/js/auth-panel.js",
  "./assets/js/firebase-sync.js",
  "./assets/pwa/icon-192.svg",
  "./assets/pwa/icon-512.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseClone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, responseClone));
          }
          return response;
        })
        .catch(() => cached);

      return cached || network;
    })
  );
});
