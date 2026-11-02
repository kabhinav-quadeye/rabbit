# Post freshness feedback

Anyone who can read a post can mark it outdated and undo their own mark. Each reader has one mark; removing it preserves other readers’ feedback. A notice appears above flagged content in feeds, search results and post detail. It signals that information may need checking, without hiding the post or changing useful votes, saves or comments.

`POST /posts/:id/outdated` toggles the authenticated reader’s mark. The local HTTP API adds the `/api` prefix; Firebase uses the same service route. Request bodies cannot supply another reader’s identity. Local state persists in SQLite, and Firebase updates the latest document in a transaction. Firestore rules permit only the current reader’s addition/removal and reject changes to unrelated fields.

The optional `outdatedBy` list defaults to empty for existing posts. New posts start with an empty list, regardless of client input. No backfill is needed.

For a Firebase release, deploy the updated rules before or together with the client. Previous rules reject the new field. This change does not deploy rules or modify hosted data.

Verification covers domain permissions, legacy posts, independent reader marks, SQLite restart persistence, responsive web mark/undo and error retry, and direct Firebase writes against the isolated `demo-rabbit-friends` Auth/Firestore emulators. Responsive web evidence does not establish native device appearance or behavior.
