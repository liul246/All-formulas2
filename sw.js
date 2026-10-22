/* Smart Calculator — Service Worker v1 */
const CACHE = "smartcalculator-v29";
const ASSETS = [
  "./",
  "./All-formulas2/index.html",
  "./All-formulas2/manifest.json",
  "./All-formulas2/icon-192.png",
  "./All-formulas2/icon-512.png"
];

/* INSTALL */
self.addEventListener("install", (e) => {
  console.log("📦 Installing SW v1");
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch((err) => console.warn("Missing:", err)))
      .then(() => self.skipWaiting())
  );
});

/* ACTIVATE */
self.addEventListener("activate", (e) => {
  console.log("✅ SW v1 activated");
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* FETCH */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  if (url.pathname.match(/\.(png|jpg|svg|webp|ico)$/i)) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        if (hit) return hit;
        return fetch(e.request).then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match("./All-formulas2/index.html"));
    })
  );
});

/* BACKGROUND SYNC */
self.addEventListener("sync", (e) => {
  if (e.tag === "sync-history") e.waitUntil(Promise.resolve("ok"));
});

/* PERIODIC SYNC */
self.addEventListener("periodicsync", (e) => {
  if (e.tag === "update-cache") {
    e.waitUntil(
      caches.open(CACHE).then((c) =>
        Promise.all(ASSETS.map((u) => fetch(u).then((r) => c.put(u, r)).catch(() => {})))
      )
    );
  }
});

/* PUSH NOTIFICATIONS */
self.addEventListener("push", (e) => {
  let d = { title: "Smart Calculator", body: "New update!" };
  try { if (e.data) d = e.data.json(); } catch {}
  e.waitUntil(
    self.registration.showNotification(d.title, {
      body: d.body,
      icon: "./All-formulas2/icon-192.png",
      badge: "./All-formulas2/icon-192.png"
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow("./All-formulas2/index.html"));
});

self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
