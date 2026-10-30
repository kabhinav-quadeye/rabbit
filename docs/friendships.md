# Friends and group membership

In Profile → Friends, search a username (case insensitive, with or without `@`), send a request, and accept or decline incoming requests. Accepted friendships are mutual. The refresh control retrieves new incoming requests. Existing group membership and post visibility stay intact; only new additions require friendship with the person adding them. Direct post sharing retains its existing audience behavior.

New accounts choose a unique, lowercase username of 3–40 letters, numbers, dots, underscores or hyphens. Password accounts created with a username continue to use `<username>@rabbit.test` internally; existing real-email accounts sign in with their original email. Google accounts receive a unique `reader-…` username, visible in Profile. Usernames are immutable in this release.

The local API stores friend requests with the rest of the SQLite state. Legacy states without requests start with no friends. The local demonstration seed explicitly gives Alex four simulated accepted friendships; it does not infer friendships from group membership. The Firebase seeder excludes those simulated relationships, so live users must accept their own requests.

Firebase stores private participant-readable `friendRequests`, immutable `usernames` claims, and per-user `friendLists` indexes. Acceptance updates the request and both indexes atomically. Firestore rules check those indexes for every group creation and membership addition, including direct SDK writes. Pending or declined requests grant no membership permission.

## Rollout

This PR does not change the live Firebase project. Before enabling the new client and rules:

1. Pause new registrations during migration so legacy usernames cannot be claimed between the scan and rollout.
2. With Firebase CLI authentication, run `node scripts/migrate-usernames.mjs` for a read-only plan. It validates all profiles and existing claims before writing, and stops on duplicate or invalid legacy handles. Resolve any reported collisions in the administrative data before proceeding; the script never renames profiles.
3. Run `node scripts/migrate-usernames.mjs --apply` to reserve legacy handles. Creation preconditions prevent overwriting claims; rerunning is safe. Existing groups and relationships are untouched.
4. Deploy `firestore.rules` and the new client together, then reopen registration. Older clients cannot add arbitrary users under the new rules.

Do not run the original live Firebase integration suite until rollout. `npm run test:rules` exercises the actual Firebase service and rules against isolated Auth/Firestore emulators without touching production (Firebase CLI and Java 21+ required). `npm test`, `npm run typecheck`, and `npm run test:e2e` cover the domain, HTTP persistence and responsive web flow.
