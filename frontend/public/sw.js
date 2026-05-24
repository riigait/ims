self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(clients.claim()));
self.addEventListener("fetch", (e) => {
  // Skip service worker for manifest and external API requests
  if (e.request.url.includes("manifest.webmanifest") ||
      e.request.url.includes("visualstudio.com") ||
      e.request.url.includes("tunnels.api")) {
    return;
  }

  e.respondWith(
    fetch(e.request).catch(() => {
      // Return offline response if fetch fails
      return new Response("Service unavailable", { status: 503 });
    })
  );
});

