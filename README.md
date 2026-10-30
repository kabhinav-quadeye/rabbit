# Rabbit

A private space for friends and small communities to share useful information. Built with **Expo SDK 58**, **React Native 0.88**, **React 19.3**, and **gluestack UI 5 + UniWind**. The same app exports to web, iOS, and Android.

## Run locally

Requires Node **22.18+** and npm.

```sh
npm install
npm start
```

- Expo web: http://localhost:8081
- API: http://localhost:3001
- `npm start` runs both processes. Press Ctrl+C to stop them.
- Use the Expo CLI commands or Expo Go for a native development session. `npm run ios` / `npm run android` start Expo directly; also run `npm run api` in a separate terminal.

For a preview of the exported web app, including its API:

```sh
npm run preview:web
```

Open http://localhost:4173. This serves the actual Expo export, with a separate persistent preview database at `data/preview.sqlite`.

## What works

- **Your space:** write a note, link, or question. Choose Just me, another person, or a group. Add tags. Draft text persists per account on the device.
- **Search:** full text matching across accessible post titles, body text, tags, links, authors, and group names. Filter by groups, personal notes, direct shares, or saved posts.
- **Recent posts:** newest or most useful first, audience filters, and shortcuts into private groups.
- **Groups:** create a circle and choose existing users. Any member can add existing users, granting immediate access to that group's existing and future posts.
- **Conversation:** mark posts useful, save them, and add comments.
- **Profile:** edit your name and bio, browse your posts and saved items, and sign out.
- **Accounts:** register and sign in with email/password. Server-side access checks protect feeds, search, votes, saves, and comments.

## Demo and real accounts

Local development automatically opens **Alex Morgan's clearly labeled Demo space**. All seeded people, groups, and posts are demonstration data. The demo account is intentionally shared across browsers. Do not put private information in it.

To create your own account: **Profile → Sign out → Create an account**. New accounts start empty, have their own private notes, and can share with existing users. Passwords are salted and hashed with scrypt. Session tokens are random, stored hashed on the server, persist across restarts, expire after 30 days, and are revoked on sign-out. Native tokens use Expo SecureStore; web tokens use browser localStorage.

To run with demo access and sample seeding disabled, use a fresh database:

```sh
DEMO_MODE=0 DB_PATH=data/private.sqlite npm start
```

For a single-server web deployment after exporting:

```sh
npm run build:web
NODE_ENV=production DB_PATH=data/private.sqlite PORT=3001 npm run serve
```

Production mode disables the demo endpoint and sample seeding by default. An existing database is preserved, so use a fresh path to start without earlier demo data. Put the server behind HTTPS and keep its database on persistent storage. No hosted deployment or identity provider is provisioned by this project. Email verification, password reset, account deletion, and moderation are future work.

For a native build talking to a hosted API, set `EXPO_PUBLIC_API_URL` before bundling. On local native development, the app derives the API host from Expo's host URI. Web always uses `/api` on its own origin; Metro proxies that route to the local API during development.

## Checks

```sh
npm test                # domain, HTTP auth, access control, SQLite restart persistence
npm run test:e2e        # Playwright; starts isolated API + Expo with a temporary database
npm run typecheck
npx expo install --check
npm run build:web
npx expo export --platform ios --platform android --output-dir dist-native
```

Browser tests use installed Google Chrome. If unavailable, install Chrome or change the Playwright channel and install Chromium with `npx playwright install chromium`.

Verified: 18 backend tests and 10 browser flows; desktop and mobile captures at 360, 390, 640, 1024, and 1440px; production web runtime without console errors; successful web/iOS/Android bundle exports. Native simulator/device behavior has not been verified. `node scripts/capture.mjs` captures the running exported preview at port 4173 without changing its content.

`npm audit` currently reports eight transitive advisories in Expo tooling (Zod/deepmerge and their dependents). npm's proposed fix downgrades Expo to SDK 51, so no incompatible downgrade was applied. These are recorded rather than hidden; recheck when upgrading Expo.

## Structure

- `App.tsx`, `src/`: responsive React Native screens and shared UI.
- `components/ui/`: generated gluestack components, including the provider, Button, Input, and Textarea.
- `server/domain.ts`: authorization and application behavior.
- `server/api.ts`: Node HTTP API, account/session handling, SQLite persistence, exported web serving.
- `server/seed.ts`: illustrative local demo content.
- `tests/`: real domain and HTTP tests plus browser flows.
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/`: product and design records.

SQLite is used by one application server process. Local databases, generated exports, test evidence, and session data are gitignored. The requested Obra test-driven-development and Impeccable skills were installed and applied; they become automatically discoverable on the next Codex turn.
