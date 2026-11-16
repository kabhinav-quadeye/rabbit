import { test } from "node:test";
import assert from "node:assert/strict";
import { reindexSearch } from "../scripts/reindex-search.mjs";

test("backfill is dry by default, paginates, only updates tokens and guards concurrent changes", async () => {
  const docs = [0, 1].map((i) => ({
    name: `https://example.test/posts/p${i}`,
    updateTime: "2026-11-01T00:00:00Z",
    fields: {
      title: { stringValue: "Café guide" },
      body: { stringValue: "Orchid garden" },
      tags: { arrayValue: { values: [{ stringValue: "plants" }] } },
      votes: { arrayValue: { values: [{ stringValue: "reader" }] } },
    },
  }));
  const original = structuredClone(docs);
  let writes = 0;
  const request = async (url: string, method = "GET", body?: any) => {
    const u = new URL(url);
    if (method === "PATCH") {
      assert.equal(u.searchParams.get("updateMask.fieldPaths"), "searchTokens");
      assert.equal(
        u.searchParams.get("currentDocument.updateTime"),
        "2026-11-01T00:00:00Z",
      );
      const d = docs.find((d) => d.name === u.origin + u.pathname)!;
      Object.assign(d.fields, body.fields);
      writes++;
      return d;
    }
    return u.searchParams.get("pageToken")
      ? { documents: [docs[1]] }
      : { documents: [docs[0]], nextPageToken: "next" };
  };
  assert.deepEqual(await reindexSearch(request, "https://example.test"), {
    scanned: 2,
    changed: 2,
    applied: 0,
  });
  assert.deepEqual(docs, original);
  assert.equal(writes, 0);
  assert.deepEqual(await reindexSearch(request, "https://example.test", true), {
    scanned: 2,
    changed: 2,
    applied: 2,
  });
  assert.deepEqual(docs[0].fields, {
    ...original[0].fields,
    searchTokens: {
      arrayValue: {
        values: ["café", "guide", "orchid", "garden", "plants"].map(
          (stringValue) => ({ stringValue }),
        ),
      },
    },
  });
  assert.deepEqual(await reindexSearch(request, "https://example.test", true), {
    scanned: 2,
    changed: 0,
    applied: 0,
  });
});
