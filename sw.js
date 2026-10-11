const CACHE = "calc-promax-v8";
const ASSETS = ["./", "./index.html", "./manifest.json"];

/* ═══ INSTALL ═══ */
self.addEventListener("install", (e) => {
  console.log("📦 Installing SW");
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

/* ═══ ACTIVATE ═══ */
self.addEventListener("activate", (e) => {
  console.log("✅ SW activated");
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

/* ═══ FETCH — Cache-first ═══ */
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
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
  if (e.tag === "sync-history" || e.tag === "sync-tasks") {
    e.waitUntil(
      new Promise((resolve) => {
        console.log("✅ Sync completed for:", e.tag);
        resolve();
      })
    );
  }
});

/* ═══ PERIODIC BACKGROUND SYNC ═══ */
self.addEventListener("periodicsync", (e) => {
  console.log("⏰ Periodic sync:", e.tag);
  if (e.tag === "update-cache") {
    e.waitUntil(
      caches.open(CACHE).then((cache) =>
        Promise.all(
          ASSETS.map((url) =>
            fetch(url).then((res) => cache.put(url, res)).catch(() => {})
          )
        ).then(() => console.log("✅ Cache refreshed"))
      )
    );
  }
  if (e.tag === "check-updates") {
    e.waitUntil(
      fetch("./manifest.json")
        .then((r) => r.json())
        .then((m) => console.log("📋 Manifest check:", m.version || "ok"))
        .catch(() => {})
    );
  }
});

/* ═══ PUSH NOTIFICATIONS ═══ */
self.addEventListener("push", (e) => {
  let data = { title: "Calc Pro Max", body: "New update!" };
  try {
    if (e.data) data = e.data.json();
  } catch {
    if (e.data) data.body = e.data.text();
  }
  e.waitUntil(
    self.registration.showNotification(data.title || "Calc Pro Max", {
      body: data.body || "Check your calculator",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><text y='.9em' font-size='90'>🧮</text></svg>",
      badge: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><text y='.9em' font-size='90'>🧮</text></svg>",
      vibrate: [200, 100, 200],
      tag: "calc-notif",
      renotify: true,
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

/* ═══ NOTIFICATION CLOSE ═══ */
self.addEventListener("notificationclose", (e) => {
  console.log("🔕 Notification dismissed");
});

/* ═══ MESSAGE — from page to SW ═══ */
self.addEventListener("message", (e) => {
  console.log("💬 Message:", e.data);
  if (e.data === "skipWaiting") self.skipWaiting();
  if (e.data && e.data.type === "SHOW_NOTIF") {
    self.registration.showNotification(e.data.title || "Calc Pro", {
      body: e.data.body || "",
      icon: "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'><text y='.9em' font-size='90'>🧮</text></svg>"
    });
  }
});
