// Offline support. The app shell and data are cached on install; pages are
// fetched network-first (so updates arrive quickly), everything else
// cache-first. Bump VERSION together with the ?v= tags in index.html.
const VERSION = "v14";
const CACHE = `kanji-trainer-${VERSION}`;
const FILES = [
  "./",
  "index.html",
  `style.css?${VERSION.replace("v", "v=")}`,
  `app.js?${VERSION.replace("v", "v=")}`,
  `game.js?${VERSION.replace("v", "v=")}`,
  `details.js?${VERSION.replace("v", "v=")}`,
  `search.js?${VERSION.replace("v", "v=")}`,
  `words.json?${VERSION.replace("v", "v=")}`,
  `kanji.json?${VERSION.replace("v", "v=")}`,
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("kanji-trainer-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  if (req.mode === "navigate") {
    // Network first, fall back to the cached page when offline.
    e.respondWith(
      fetch(req)
        .then((res) => { caches.open(CACHE).then((c) => c.put("index.html", res.clone())); return res; })
        .catch(() => caches.match("index.html", { ignoreSearch: true })),
    );
    return;
  }
  // Cache first; cache new files (e.g. Google Fonts) as they're fetched.
  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    })),
  );
});
