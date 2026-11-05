# Agent connections

Profile → Agents lets a signed-in reader create a named connection. Copy the server URL and one-time token into an MCP client with Streamable HTTP and custom Bearer authorization header support. “Copy MCP settings” supplies a configuration for clients using an `mcpServers` JSON object; other clients may need their own configuration format or a bridge. This is a generic MCP integration, not a published ChatGPT, Claude or Gemini app, and does not provide OAuth discovery or consent.

An agent receives only three tools:

- `search_posts`: required query (1–200 characters), optional scope (`all`, `circles`, `personal`, `people`, `saved`), limit (1–20, default 10), and offset. Results include excerpts, source title, author, `rabbit://posts/<id>` citation URI, feedback counts, and a `nextOffset` when more results exist.
- `read_post`: a post ID returned by search; returns full post text and the same source metadata. Rabbit URIs are citation identifiers, not public web pages.
- `set_feedback`: post ID, `kind` (`useful` or `outdated`), and boolean `active`. Repeating the same value preserves the current mark and its original attribution. Use `false` to remove the mark. Agents are instructed to ask before changing feedback; the integrating client must enforce its own tool approval policy.

Tools always act as the connected reader. They cannot publish, comment, save posts, discover people, or manage circles. Normal user-session endpoints reject agent tokens. Existing audience and circle membership checks apply to every read and mutation. An agent does have access to the reader's private notes, so connect only trusted clients. Post text is untrusted reference material; MCP instructions tell the client to cite sources, disclose outdated flags, and disregard instructions embedded in posts.

Useful/outdated marks remain per reader. Current agent marks include the connection ID, name, and timestamp in `usefulVia` / `outdatedVia`. Feeds and post details disclose who marked a post through an agent. Human removal clears that reader's attribution for that mark. Revocation stops future access and preserves existing feedback and attribution. These fields describe current marks, not an immutable historical audit log.

## Credentials and storage

Tokens contain 256 bits of randomness. Only a SHA-256 hash is persisted; the reusable token is returned once and held only in component memory. Reopening Profile cannot reveal it. A lost token requires a new connection; revoke the old one. Connections expire after 30 days and an account can have up to 10 active connections. The gateway limits tool use per connection to 60 requests per minute. Search results are bounded and paginated; Firebase search uses the same accessible-post scan model as the existing app, so a dedicated search index is a future scaling step.

SQLite stores credentials separately from app state. Firebase stores them in server-only `agentCredentials` documents, plus an `agentOwners` guard document to serialize connection creation. Direct client reads and writes to those collections are denied. The gateway verifies Firebase ID tokens for connection management. Agent operations recheck the credential, current membership and post in a Firestore transaction, preventing feedback from racing revocation or another reader's vote. Direct client writes cannot add or forge provenance; readers can clear only their own attribution while removing the corresponding mark.

## Running and rollout

Local mode works through the existing Node API and SQLite database:

```sh
EXPO_PUBLIC_BACKEND=local npm start
```

For Firebase, the native/web client continues to read and write app content through the Firebase client SDK and rules. Only connection management and remote MCP tools use the Node gateway:

1. Run the gateway in a trusted server environment with Node 22.18+ and Firebase Application Default Credentials. Set `FIREBASE_PROJECT_ID` to the same project as `EXPO_PUBLIC_FIREBASE_PROJECT_ID`. Use a service account or workload identity with Firebase Auth token-verification and Firestore access. Keep credentials server-side; never set them in an `EXPO_PUBLIC_*` variable or ship them in an app bundle.
2. Route `/api/agent-connections` and `/api/agent/mcp` to the gateway, or set the client's `EXPO_PUBLIC_API_URL` to its public HTTPS origin and rebuild. `npm start` runs the gateway and Metro proxy locally; a static Expo export alone cannot host these server endpoints. Localhost URLs work only for clients on the same machine. Remote agents need a reachable HTTPS endpoint.
3. Release the updated Firestore rules before or together with the new client/gateway. Older clients that modify attributed posts need updating so they clear their own provenance correctly when undoing feedback. No data migration is required; legacy posts omit the optional maps.
4. Build new native binaries to include `expo-clipboard`. The UI also exposes selectable text when clipboard access is unavailable. Secure-context browser requirements apply to clipboard operations.

The MCP endpoint accepts stateless POST requests with `Authorization: Bearer <agent token>`, `Content-Type: application/json`, and `Accept: application/json, text/event-stream`. Browser-originated calls are rejected; remote clients should call it server-side. Tokens belong in authorization headers, never in URLs. Request bodies are capped at 64 KiB, and responses are not cached. Apply normal TLS, upstream request limits and log redaction when hosting the gateway.

No hosted deployment, rules deployment, migration, or live sample-data changes are part of this PR.

## Verification

`npm test` covers the shared domain, credential scoping, hashed storage, pagination, expiry, persistence and revocation over HTTP. `npm run test:e2e` covers setup, failure/retry, one-time display, visible attribution, and revocation at phone and desktop web sizes. `npm run test:rules` uses Java 21+ and the isolated `demo-rabbit-friends` emulators for Firebase transaction and direct-write coverage. Native exports and responsive web checks are separate from physical-device verification.

Implementation references: [MCP TypeScript SDK server documentation](https://ts.sdk.modelcontextprotocol.io/server), [Firebase Admin setup](https://firebase.google.com/docs/admin/setup), and [Firebase ID token verification](https://firebase.google.com/docs/auth/admin/verify-id-tokens).
