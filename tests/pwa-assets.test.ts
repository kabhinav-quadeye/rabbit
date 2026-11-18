import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";

test("the PWA reuses a versioned bundle across launches and leaves API responses to the network", async () => {
  const origin = "https://rabbit.example";
  const entries = new Map<string, Response>();
  let onFetch!: (event: {
    request: Request;
    respondWith: (response: Promise<Response>) => void;
    waitUntil: (operation: Promise<void>) => void;
  }) => void;
  let networkAvailable = true;
  const cache = {
    match: async (request: Request) => entries.get(request.url)?.clone(),
    put: async (request: Request, response: Response) => {
      entries.set(request.url, response);
    },
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
  };
  runInNewContext(await readFile("public/service-worker.js", "utf8"), {
    self: {
      location: { origin },
      addEventListener: (type: string, handler: typeof onFetch) => {
        if (type === "fetch") onFetch = handler;
      },
    },
    caches: { open: async () => cache },
    fetch: async () => {
      if (!networkAvailable) throw new Error("Network unavailable");
      return new Response("Rabbit JavaScript", {
        headers: { "Content-Type": "text/javascript" },
      });
    },
    Response,
    URL,
  });
  const intercept = async (path: string) => {
    let result: Promise<Response> | undefined;
    let store: Promise<void> | undefined;
    onFetch({
      request: new Request(origin + path),
      respondWith: (response) => {
        result = response;
      },
      waitUntil: (operation) => {
        store = operation;
      },
    });
    const response = await result;
    await store;
    return response;
  };

  const bundle =
    "/_expo/static/js/web/index-5735cbe702ca140c864ce496257fa6b1.js";
  assert.equal(await (await intercept(bundle))?.text(), "Rabbit JavaScript");
  networkAvailable = false;
  assert.equal(await (await intercept(bundle))?.text(), "Rabbit JavaScript");
  assert.equal(await intercept("/api/bootstrap"), undefined);
});
