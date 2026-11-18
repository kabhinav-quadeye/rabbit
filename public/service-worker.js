self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Only handle launches of the app shell. Leave API and asset requests alone.
  if (request.mode !== "navigate" || new URL(request.url).pathname !== "/") {
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
