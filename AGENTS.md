# Working on Rabbit

- Use the **impeccable** skill for frontend and UX work. Read `PRODUCT.md` and `DESIGN.md`, preserve Rabbit's existing visual system, and inspect the rendered result at phone and desktop sizes. Report native device verification separately from responsive web verification.
- Use the **test-driven-development** skill for features and bug fixes: write a behavior test, observe its expected failure, implement the smallest change, then run the full relevant suite.
- Run `npm test` and `npm run typecheck`. For UI changes, run `npm run test:e2e`; for Firebase permissions or transactions, also run `npm run test:rules` (Firebase CLI and Java 21+ required). The rules suite uses the isolated `demo-rabbit-friends` emulator project.
- Keep local API and Firebase behavior consistent. Enforce access and group membership permissions in the domain layer and in `firestore.rules`, and test direct writes that bypass the UI.
- Keep credentials, `.env.local`, local databases, and generated test evidence out of commits. Preserve unrelated user changes. Do not deploy rules, run cloud migrations, or alter live sample content unless requested.
