self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

const assetCache = "rabbit-build-assets-v1";
const bundle =
  /^\/_expo\/static\/(?:js\/web\/.+-[a-f0-9]{32}\.js|css\/.+-[a-f0-9]{32}\.css)$/;
const font = /^\/assets\/.+\.[a-f0-9]{32}\.ttf$/;

async function storeBuildAsset(cache, request, response) {
  try {
    await cache.put(request, response);
    const keys = await cache.keys();
    await Promise.all(
      keys
        .slice(0, Math.max(0, keys.length - 40))
        .map((key) => cache.delete(key)),
    );
  } catch {
    // Browser storage can be unavailable or full.
  }
}

async function buildAsset(event) {
  const { request } = event;
  const cache = await caches.open(assetCache).catch(() => null);
  const hit = await cache?.match(request).catch(() => undefined);
  if (hit) return hit;

  const response = await fetch(request);
  // A missing asset can be rewritten to index.html by the static host.
  const contentType = response.headers.get("Content-Type") ?? "";
  if (
    cache &&
    response.ok &&
    !response.redirected &&
    /^(?:text\/(?:javascript|css)|application\/(?:javascript|octet-stream)|font\/ttf)(?:;|$)/i.test(
      contentType,
    )
  ) {
    event.waitUntil(storeBuildAsset(cache, request, response.clone()));
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || request.method !== "GET") return;
  if (!url.search && (bundle.test(url.pathname) || font.test(url.pathname))) {
    event.respondWith(buildAsset(event));
    return;
  }
  if (request.mode !== "navigate" || url.pathname !== "/") {
    return;
  }
  event.respondWith(
    fetch(request).catch(
      () =>
        new Response(
          `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#2F5843">
<title>Rabbit · Offline</title>
<style>
  body { margin: 0; background: #f8f9f4; color: #26332c; font: 1rem/1.55 system-ui, sans-serif; }
  main { max-width: 26rem; margin: 16vh auto 0; padding: 0 1.5rem; }
  h1 { line-height: 1.2; }
  a { display: inline-grid; place-items: center; min-height: 44px; padding: 0 1rem;
      border-radius: 9px; color: white; background: #2f5843; text-decoration: none; }
</style>
<main>
  <h1>You’re offline</h1>
  <p>Reconnect to the internet to open Rabbit.</p>
  <a href="/">Try again</a>
</main>`,
          {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          },
        ),
    ),
  );
});
