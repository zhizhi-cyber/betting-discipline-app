// Minimal service worker — required by Chrome to show "Install app"
// No caching strategy; just passthrough. Safe to update without breaking clients.
const VERSION = "v2-dayingjia";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-first passthrough; do not intercept responses.
  // The fetch handler's existence is what Chrome requires for installability.
  event.respondWith(fetch(event.request).catch(() => new Response("", { status: 504 })));
});
