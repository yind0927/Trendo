// Trendo Service Worker — network-first, auto-update on deploy
const CACHE = "trendo-v702";
// JS is versioned via ?v= query in index.html — precache the same URLs so offline
// fallback matches the real requests. Bump the version here AND in index.html together.
const PRECACHE = ["/", "/index.html", "/data.js?v=702", "/desk.js?v=702", "/logo.svg", "/icon-192.png", "/icon-512.png", "/manifest.json"];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE)));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()).then(() =>
      self.clients.matchAll({ type: "window" }).then(clients =>
        clients.forEach(c => c.postMessage({ type: "NEW_VERSION" }))
      )
    )
  );
});

self.addEventListener("message", e => {
  if (e.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", e => {
  // Only handle same-origin GET requests; skip API calls
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.startsWith("/api/")) return;

  // Navigation (page load): serve the cached shell immediately, refresh it in the
  // background. This is what makes a PWA relaunch instant instead of waiting on a
  // full download of index.html — iOS drops backgrounded web apps from memory on its
  // own schedule, which a page cannot extend, so the fix is to make the reload cheap
  // rather than rare.
  //
  // Serving from cache does NOT strand anyone on an old build: CACHE is versioned, so
  // a deploy means a new service worker with an empty cache, and its first navigation
  // necessarily goes to the network. index.html also carries an update check that
  // polls /sw.js and reloads when the version moves.
  if (e.request.mode === "navigate") {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match("/index.html").then(cached => {
          const fresh = fetch(e.request).then(res => {
            if (res.ok) cache.put("/index.html", res.clone());
            return res;
          });
          return cached || fresh.catch(() => cache.match("/"));
        })
      )
    );
    return;
  }

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
