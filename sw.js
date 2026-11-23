// Expert Study — PWA Service Worker (GitHub Pages Relative-Path Safe)
const CACHE_NAME = "expert-study-v3";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./admin.html",
  "./manifest.json",
  "./css/glass-theme.css",
  "./css/app.css",
  "./js/firebase-config.js",
  "./js/utils.js",
  "./js/student-app.js",
  "./js/live-test.js",
  "./js/admin-app.js",
  "./assets/logo.png",
  "./assets/icon-192.png",
  "./assets/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Network-first for Firebase, Google APIs, YouTube, and HTML navigations
  const isNetworkFirst =
    req.mode === "navigate" ||
    url.hostname.includes("firestore.googleapis.com") ||
    url.hostname.includes("gstatic.com") ||
    url.hostname.includes("youtube.com") ||
    url.hostname.includes("drive.google.com");

  if (isNetworkFirst) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (req.mode === "navigate" && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
    return;
  }

  // Cache-first for local static assets
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res.ok && url.origin === self.location.origin) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
