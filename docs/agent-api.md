# Rabbit agent API

All requests use the user's Rabbit host over HTTPS and Authorization: Bearer <agent token>. JSON request and response bodies. Create a separate named token from Profile → Agents. The token is shown only at creation, hidden until revealed, and expires in 30 days. There is no OAuth setup. Visit /AGENTS.md for integration guidance.

## Allowed operations

- GET /api/agent/search?q=<text>&scope=all&offset=0 — accessible posts, newest first, 20 per page. Increase offset by 20 until an empty page. Scope: all, circles, personal, people (direct shares), saved. Search uses the existing Rabbit matching semantics.
- GET /api/agent/posts/{id} — read an accessible post.
- PUT /api/agent/posts/{id}/feedback — {"kind":"useful","active":true} or {"kind":"outdated","active":false}. Sets the reader's state, so retries never toggle it off accidentally.
- POST /api/agent/drafts — {"title":"A finding","body":"Evidence and sources"}. Proposes a private note. Does not publish or select a sharing audience. Do not retry blindly: a repeated request creates another draft.

No other operations are granted. Goal/task editing is reserved for a future explicit grant. Agent tokens cannot use human session routes or token-management routes.

## Errors and limits

401: missing, revoked, expired or invalid credential. Ask the user for a new token. 403: inaccessible post or unsupported operation. 400: invalid input; fix it before retrying. 429: 60 requests per account per minute; wait one minute. 500/503: temporary failure. Feedback uses PUT and is safe to retry; draft creation is not retry-safe.

Titles: 180 characters. Draft body: 20,000 characters. Up to 10 active tokens and 20 pending drafts (400 KB combined storage). Tokens are stored as SHA-256 hashes and cannot be recovered. Create a replacement if lost. Deleting a token immediately revokes its access, while its activity remains visible.

## Human review and audit

Profile → Agents lists connections, proposed drafts and recent activity. Users can edit a draft and publish it as a private note, then use Rabbit's normal sharing flow for future posts. Reads are summarized once per account per UTC day. Each successful write records the named connection and action. Failed calls consume rate budget but do not create successful-activity entries. History is pruned on account access after 30 days; only the latest 200 events are retained. Pending drafts remain until reviewed. Reviewed bodies are removed; the latest 20 review receipts support publishing retries. Activity labels describe the action without storing tokens or request bodies.

## Hosting

The Node API must serve /api/agent/*, /api/agents/*, /AGENTS.md and /docs (or /docs/agents.md) on the app host. An Expo static export alone cannot serve authenticated agent requests. Local SQLite runs through server/index.ts. Firebase uses the same gateway with RABBIT_AGENT_BACKEND=firebase, FIREBASE_PROJECT_ID and Application Default Credentials for that same project. The browser uses EXPO_PUBLIC_API_URL if the gateway is on a separate host. Never expose service-account credentials in EXPO_PUBLIC variables.

Firebase agent credentials, drafts and audit records are server-only in agentAccounts. Firestore rules reject all direct client access. The gateway verifies Firebase user ID tokens (including revocation/disabled users) for management and verifies agent token hashes for the delegated surface. It rechecks the owner's current accessible posts and circle memberships inside the same Firestore transaction as feedback, draft and audit writes. Deploy reviewed rules with the gateway; no migration or live data edits are required. The gateway currently uses Rabbit's existing accessible-post scan for search; issue #16 owns indexed search.
