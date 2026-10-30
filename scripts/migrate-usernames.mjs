import { readFileSync } from "node:fs";
import { adminRequest } from "./firebase-admin.mjs";
import { planUsernameClaims } from "../src/identity.ts";

const project = JSON.parse(
  readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"),
).projects.default;
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
const users = [];
let pageToken = "";
do {
  const page = await adminRequest(
    `${base}/users?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`,
  );
  users.push(
    ...(page.documents ?? []).map((d) => ({
      id: d.name.split("/").at(-1),
      handle: d.fields.handle?.stringValue,
    })),
  );
  pageToken = page.nextPageToken ?? "";
} while (pageToken);
const missing = [];
// Validate all legacy users and existing claims before making the first write.
for (const claim of planUsernameClaims(users)) {
  try {
    const existing = await adminRequest(
      `${base}/usernames/${encodeURIComponent(claim.handle)}`,
    );
    if (existing.fields.userId?.stringValue !== claim.userId)
      throw new Error(
        `Username ${claim.handle} is claimed by another account. No migration writes were made.`,
      );
  } catch (error) {
    if (!error.message.startsWith("404:")) throw error;
    missing.push(claim);
  }
}
if (process.argv.includes("--apply")) {
  for (let offset = 0; offset < missing.length; offset += 400) {
    await adminRequest(`${base}:commit`, "POST", {
      writes: missing.slice(offset, offset + 400).map((claim) => ({
        update: {
          name: `projects/${project}/databases/(default)/documents/usernames/${claim.handle}`,
          fields: { userId: { stringValue: claim.userId } },
        },
        currentDocument: { exists: false },
      })),
    });
  }
}
console.log(
  `${project}: ${users.length} profiles validated; ${missing.length} username claims ${process.argv.includes("--apply") ? "created" : "planned (dry run; pass --apply to write)"}. No profiles or friendships changed.`,
);
