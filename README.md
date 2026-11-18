# Rabbit App

A private space for friends and small communities to share useful information. Built with **Expo SDK 58**, **React Native 0.88**, **React 19.3**, and **gluestack UI 5 + UniWind**. The same app exports to web, iOS, and Android.

## Run locally

Requires Node **22.18+** and npm.

```sh
npm install
cp .env.example .env.local  # already configured in the current checkout
npm start
```

Open http://localhost:8081. With Firebase configured, the app connects directly to Firebase Auth and Cloud Firestore; there is no local API dependency. Firebase maintains the session across reloads, and native password sessions use AsyncStorage.

## Connected Firebase project

- Project: **rabbit-quadeye-2026** ([Firebase console](https://console.firebase.google.com/project/rabbit-quadeye-2026/overview)).
- Firestore: the default database in **asia-south1 (Mumbai)**.
- Sign-in providers: **email/password** and **Google** are enabled.
- `.firebaserc` links this repository to the project; `.env.local` supplies the public Firebase web app configuration. `.env.example` contains the same public configuration for a fresh checkout. These are client identifiers, not admin credentials.
- Authorized Google sign-in domains include `localhost`, `127.0.0.1`, and the project's `firebaseapp.com` / `web.app` domains. Add your domain in Firebase Authentication settings before using Google sign-in there.
- `firebase.json`, `firestore.rules`, and `firestore.indexes.json` define the providers, access rules, query indexes, and optional static hosting configuration. Hosting has not been deployed.

### Seeded accounts and content

Sign in with **username `alex` and password `alex`**. The equivalent Firebase email is `alex@rabbit.test`.

Alex, Maya, James, Sarah, Omar, and Nina are actual users in Firebase Authentication. The six matching public profiles, three circles, and six original sample posts live in Firestore, including personal notes, direct shares, links, questions, tags, votes, saved items, and comments. Alex belongs to all three sample circles and can explore every existing app feature.

All usernames use the same mapping to `<username>@rabbit.test`; real email addresses also work. There is no special Alex login endpoint, custom token, password substitution, or automatic demo login in Firebase mode. Alex's requested short password is imported as a bcrypt hash using Firebase's user import API. New accounts follow Firebase's minimum of six password characters. The other seeded users receive random passwords.

The sample content is shared test data. New accounts begin with empty feeds and no circles and cannot see Alex's private content.

To seed again, authenticate the globally installed Firebase CLI (`firebase login`) and run:

```sh
npm run firebase:seed
```

Seeding only creates missing users and documents. It preserves existing passwords, profile changes, posts, and interactions. Administrative scripts use the CLI's existing authentication in memory and do not create a service-account key.

### Google sign-in

On the web, choose **Continue with Google**. Firebase opens Google's OAuth flow and creates the same type of Rabbit profile as password registration. Password sign-in works on web, iOS, and Android. Native Google sign-in is not configured: it requires platform-specific OAuth credentials and a native sign-in integration; use the web app for Google sign-in for now. No Google credentials or provider secrets are bundled in the app.

## What works with Firebase

- **Your space:** create a note, link, or question for Just me, another person, or a circle. Add tags; device drafts remain per-account.
- **Search:** match accessible titles, text, tags, links, authors, and circles; filter by circles, personal notes, direct shares, or saved posts.
- **Recent posts:** newest or most useful first, audience filters, and private circle feeds.
- **Circles:** create a circle and select existing people. Members can add existing users, giving them access to the circle's old and new posts.
  Circles are called `group` in code, API routes and Firestore (`groups` collection, `audienceType: "group"`); only user-facing wording says circle.
- **Conversation:** mark useful, save/unsave, and add comments. Atomic array updates preserve other users' simultaneous changes.
- **Goals:** a private tab for breaking big goals into a tree of tasks (up to four levels). Home shows each goal's next three actionable tasks (leaf tasks ranked by priority, then due date, then age) and what you completed in the last seven days. Completing a task keeps it in place with Undo until you tap Refresh. Tasks have a priority, due date, sub-tasks and notes. Completed tasks are hidden by default. Goals are private until you share them: while creating a goal, or later from its page, pick accepted friends to share with. Everyone in a goal sees all of its tasks, done and open, and can add, edit and complete tasks; completed tasks show who finished them. Members can invite their own friends, as in circles, and can leave; only the owner edits the goal's settings, removes people or deletes it. See [docs/goals.md](docs/goals.md).
- **Profile:** edit name and bio, browse your posts and saved items, and sign out.
- **Accounts:** register with a username or email and password, or use Google on web. Firebase owns credential checking and session refresh.

Goals and tasks (`goals`, `goalTasks`) are readable and writable only by the goal's members (the owner, plus anyone in the goal's `memberIds`; goals created before sharing have no list and belong to their owner alone). Only the owner changes a goal's settings or deletes it; members may add only their own accepted friends, and a membership change can only add people, remove yourself, or (for the owner) remove others. A task's `completedBy` can name only the person completing it. Rules also check that a sub-task's parent belongs to the same goal and that ownership, goal and parent never change. Firestore rules enforce the same privacy model independently of the UI: only authors, direct recipients, and circle members can read posts. A person can change only their own useful/save markers and append comments under their own identity. Public profile documents omit email addresses and credentials. Only circle members can add members; membership changes cannot remove existing members or change the owner.

Search operates over the current account's accessible Firestore posts. Screens refresh after actions and when reloading the app; live multi-device subscriptions and server-side full-text indexing are not implemented.

## Checks

```sh
npm test                      # shared domain and legacy HTTP tests
npm run test:firebase          # live Firebase auth, persistence, concurrency, access rules
npm run test:e2e:firebase      # real Alex browser login, seeded views, persistence, Google OAuth entry
npm run test:e2e               # isolated legacy SQLite browser regression suite
npm run typecheck
npm run build:web
npx expo export --platform ios --platform android --output-dir dist-native
```

The live Firebase integration test creates temporary accounts and content and cleans them up. Browser tests sign in as Alex without changing the seeded data. Google OAuth testing verifies the popup reaches Google's account flow; completing sign-in requires a person to choose their Google account. Browser tests use installed Google Chrome.

Deploy changed providers, rules, and indexes with:

```sh
npm run firebase:deploy
```

To publish the web app later, build it and explicitly deploy Firebase Hosting (`firebase deploy --only hosting`).

## Legacy local backend

The SQLite backend remains available for offline development and regression tests. Set `EXPO_PUBLIC_BACKEND=local` (or remove the Firebase environment variables from `.env.local`) to select it. `npm start` then runs both Expo at port 8081 and the local API at port 3001. It automatically opens the labeled local Demo space unless `DEMO_MODE=0` is set.

```sh
DEMO_MODE=0 DB_PATH=data/private.sqlite npm start
```

For an exported local web preview:

```sh
npm run preview:web
```

SQLite is used by one local API process; its data is separate from Firebase. Native apps talking to the legacy API can set `EXPO_PUBLIC_API_URL` before bundling. Web uses `/api` on its own origin.

## Structure

- `App.tsx`, `src/`: responsive React Native screens and shared UI.
- `src/firebase.ts`, `src/firebase-service.ts`, `src/firebase-platform*`: Firebase initialization, persistence, sign-in, and application data operations.
- `src/identity.ts`: shared username/email normalization.
- `src/domain.ts`: validation and app behavior shared by Firebase and SQLite; `server/domain.ts` re-exports it.
- `scripts/firebase-admin.mjs`, `scripts/seed-firebase.mjs`: CLI-authenticated administrative seeding.
- `server/api.ts`, `server/seed.ts`: optional local API and shared illustrative seed content.
- `tests/`: domain, HTTP, live Firebase, and browser tests.
- `components/ui/`: generated gluestack components.
- `PRODUCT.md`, `DESIGN.md`, `.impeccable/`: product and design records.

Local credentials/configuration, databases, generated exports, and test evidence are gitignored. Email verification, password reset, account deletion UI, and moderation remain future work.

## Connect an agent

In Rabbit, open **Profile → Agent access** and select **Create key**. The key is shown once and expires after 30 days. Replacing or revoking it disables the existing key. Use a client that accepts Streamable HTTP and custom headers. Set the server URL shown in Rabbit and the header `Authorization: Bearer <agent key>`. Keep the key in your client's secret storage. Use HTTPS outside local development.

Rabbit exposes four MCP tools.

| Tool | What it does |
| --- | --- |
| `search_posts` | Searches posts the account can already see, with ten results per page. Pass `nextOffset` as `offset` to retrieve more. |
| `list_goals` | Lists the account's own and shared goals and their tasks. |
| `create_post_draft` | Queues a text note for review. |
| `suggest_goal` | Queues a goal and an optional reason for review. |

In **Profile → Agent access**, select **Refresh proposals** to load new items. Approve a proposal to create a private post or goal, or dismiss it to remove it from the queue.

### Hosting

- **Vercel with Firebase:** Deploy the Expo web build and the repository's `api/` Functions from the same project. Keep `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_API_KEY` configured. Set `EXPO_PUBLIC_AGENT_URL` to the production web origin and set `RABBIT_FIREBASE_ADMIN_JSON` to the Firebase service account JSON in a sensitive server environment variable. The service account needs Firebase Auth user lookup and Firestore document access. Deploy `firestore.rules` before enabling agent access. Firestore stores both proposals and key hashes, so the gateway can run across multiple instances.
- **SQLite:** Run the existing Rabbit server. The MCP endpoint is `/api/mcp` on the same server. Keep the SQLite file on persistent storage so keys and proposals survive a restart.
- **Firebase:** Run the Rabbit Node server as a gateway with `RABBIT_FIREBASE_AGENT=1`, the same `EXPO_PUBLIC_FIREBASE_PROJECT_ID` and `EXPO_PUBLIC_FIREBASE_API_KEY` as the app, and Firebase Admin Application Default Credentials. The gateway identity needs permission to look up Auth users, verify revocation, and sign custom tokens (for a service account using IAM signing, grant it `iam.serviceAccounts.signBlob` on the signing account). Deploy the repository's Firestore rules to the same project through your normal release process. Set `EXPO_PUBLIC_AGENT_URL` to the gateway origin when building the app. Firestore stores key hashes and proposals, and enforces the scoped agent identity’s permissions.
