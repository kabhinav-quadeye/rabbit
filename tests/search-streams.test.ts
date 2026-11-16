import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSearchStreams } from "../src/search.ts";
import type { Post } from "../src/types.ts";
const posts = (start: number, n: number) =>
  Array.from(
    { length: n },
    (_, i) => ({ id: String(start + i).padStart(3, "0") }) as Post,
  );
test("merging overlapping search streams never skips unseen records or exceeds the page size", () => {
  const page = mergeSearchStreams([posts(0, 25), posts(20, 25), posts(30, 10)]);
  assert.deepEqual(
    page.posts.map((p) => p.id),
    posts(0, 25).map((p) => p.id),
  );
  assert.equal(page.nextCursor, "024");
  const end = mergeSearchStreams([posts(25, 20), posts(30, 10)]);
  assert.equal(end.posts.length, 20);
  assert.equal(end.nextCursor, null);
  const disjoint = mergeSearchStreams([posts(0, 20), posts(30, 20)]);
  assert.equal(disjoint.posts.length, 25);
  assert.equal(disjoint.nextCursor, "034");
});
