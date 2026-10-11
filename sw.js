/* Calc Pro Max — Service Worker v12 */
const CACHE = "calc-promax-v15";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

/* ═══ INSTALL ═══ */
self.addEventListener("install", (e) => {
  console.log("📦 Installing SW v12");
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(ASSETS).catch((err) => console.warn("Asset missing:", err)))
      .then(() => self.skipWaiting())
  );
});

/* ═══ ACTIVATE ═══ */
self.addEventListener("activate", (e) => {
  console.log("✅ SW v12 activated");
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ═══ FETCH — Cache-first ═══ */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  // Icons — cache aggressively
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

  // Default — cache-first
  e.respondWith(
    caches.match(e.request).then((hit) => {
      if (hit) return hit;
      return fetch(e.request).then((res) => {
        if (res && res.status === 200 && res.type === "basic") {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, clone));
        }
        return res;
      }).catch(() => caches.match("./index.html"));
    })
  );
});

/* ═══ BACKGROUND SYNC ═══ */
self.addEventListener("sync", (e) => {
  console.log("🔄 Background sync:", e.tag);
  if (e.tag === "sync-history") e.waitUntil(Promise.resolve("history synced"));
  if (e.tag === "sync-settings") e.waitUntil(Promise.resolve("settings synced"));
});

/* ═══ PERIODIC SYNC ═══ */
self.addEventListener("periodicsync", (e) => {
  console.log("⏰ Periodic sync:", e.tag);
  if (e.tag === "update-cache") {
    e.waitUntil(
      caches.open(CACHE).then((cache) =>
        Promise.all(
          ASSETS.map((u) => fetch(u).then((r) => cache.put(u, r)).catch(() => {}))
        )
      )
    );
  }
});

/* ═══ PUSH NOTIFICATIONS ═══ */
self.addEventListener("push", (e) => {
  let data = { title: "Calc Pro Max", body: "New update available!" };
  try {
    if (e.data) data = e.data.json();
  } catch {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
      vibrate: [200, 100, 200],
      tag: "calc-notif",
      data: { url: "./index.html", dateOfArrival: Date.now() }
    })
  );
});

/* ═══ NOTIFICATION CLICK ═══ */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.includes("index.html") && "focus" in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow("./index.html");
    })
  );
});

/* ═══ MESSAGE ═══ */
self.addEventListener("message", (e) => {
  console.log("💬 Message:", e.data);
  if (e.data === "skipWaiting") self.skipWaiting();
  if (e.data && e.data.type === "SHOW_NOTIF") {
    self.registration.showNotification(e.data.title || "Calc Pro", {
      body: e.data.body || "",
      icon: "./icon-192.png"
    });
  }
});
