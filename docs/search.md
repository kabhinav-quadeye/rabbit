# Indexed search

Search uses exact, case-insensitive Unicode words. Punctuation separates words,
so tags, author handles and URL components work without special syntax. All
query words must match. Prefixes, stemming and typo tolerance are not supported.
The existing circle, personal, direct-share and saved scopes still apply.

## Query and access model

`GET /api/search?q=...&scope=...&cursor=...` (or `/search` in the Firebase
adapter) returns `{ posts: Post[], nextCursor: string | null }`. Results traverse
stable document ID order. This replaces the old unbounded array response and
newest-first search order. Feed order is unchanged. A page consumes at most 25
candidates before checking remaining words and scope, so it can have fewer than
25 results, even zero, with a non-null cursor. Continue until the cursor is null.
Cursors are exclusive document IDs; use them with the same query and scope.
Concurrent inserts behind a cursor appear after restarting the search.

Local development builds an inverted word-to-post-ID index once when the domain
service opens its state, including legacy SQLite posts. New posts update it;
profile edits rebuild it. Search looks up candidate IDs rather
than scanning all visible post bodies. SQLite still stores the application's
state as one JSON snapshot; this is not a migration of the entire local storage
model to normalized tables or FTS5.

Firebase search runs before the shared bootstrap loader. It fetches users and
current joined-circle metadata, then issues separate author, incoming-direct and
joined-circle post queries. Each uses `limit(25)`, document-ID ordering and
`startAfter` on continuation. Content queries use indexed `searchTokens` with
`array-contains` on the first word. Author/circle name matches add corresponding
bounded metadata branches, so renaming an author does not leave stale tokens.
At most eight query RPCs run concurrently. The merger deduplicates overlapping
branches and advances only as far as every unfinished branch has been consumed.
It returns at most 25 candidates and filters remaining words and scope locally.

Post read cost per call is bounded by 25 times the number of visibility/metadata
branches, rather than the number of accessible posts. Accounts with many circles
or many matching author names incur more queries; metadata still scales with
users and memberships. Saved scope is checked on candidates because Firestore
cannot use two array-contains filters in one disjunction. Neither blank nor saved
search silently falls back to an unbounded post scan. Initial bootstrap/feed
loading is unchanged and still loads accessible posts; this change addresses
subsequent search requests, not feed pagination.

Every query is constrained by current visibility and enforced by Firestore
rules. The domain layer checks access again, scope and actual searchable text.
Tokens on the same post are untrusted hints: a forged token cannot grant access
or make unrelated content pass the final match. Only the author can create a
post; readers cannot rewrite its tokens or content. Legacy posts remain valid
for normal reading and feedback.

Content tokens contain title, body, tags and URL words, deduplicated. Only index
keys are shortened to 200 UTF-16 units to stay below Firestore's indexed-value
byte limit; final matching uses complete words. The allowed post text fits within
12,000 tokens without dropping tail words. The token field has two composite
array indexes and a single-field exemption to control index fanout. Names are
resolved live instead of being denormalized.

## Rollout and legacy posts

No live rules, indexes or documents are changed by the PR. A maintainer must:

1. Deploy the updated rules (accepting the optional immutable `searchTokens`
   field) and indexes in `firestore.indexes.json`, and wait until indexes are ready.
2. With an authenticated Firebase CLI account, inspect the dry run:
   `node scripts/reindex-search.mjs --project=PROJECT_ID`.
3. Explicitly apply the content index:
   `node scripts/reindex-search.mjs --project=PROJECT_ID --apply`.
4. Release the client after backfill. If older clients are still creating posts,
   run backfill again after their retirement or enforce a minimum client version.

The script lists documents in batches of 100, writes only `searchTokens` through
an update mask, and requires each document's observed update time. A concurrent
change aborts with a failed precondition; rerun to calculate from fresh content.
It is idempotent and prints counts, not post contents. Default mode performs no
writes. It never changes audience, membership, votes, saves or post text. Local
SQLite needs no script: it rebuilds its index at startup. Firebase legacy content
without tokens is absent from content-word search until backfilled; there is no
costly scan fallback. Do not release the client before completing that step.

Verification covers domain matching, API pages across SQLite restarts,
backfill dry-run/apply behavior, emulator parity and direct permission bypasses,
and responsive web pagination/retry. The emulator does not enforce production
composite-index availability; index readiness must be checked during rollout.

Query design follows Firebase’s [cursor pagination](https://firebase.google.com/docs/firestore/query-data/query-cursors) and [index fanout guidance](https://firebase.google.com/docs/firestore/best-practices).
