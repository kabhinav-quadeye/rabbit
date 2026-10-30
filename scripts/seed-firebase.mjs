import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { adminRequest } from "./firebase-admin.mjs";
import { seedState } from "../server/seed.ts";

const project = JSON.parse(
  readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"),
).projects.default;
const state = seedState();
const authBase = `https://identitytoolkit.googleapis.com/v1/projects/${project}`;
const existing = await adminRequest(`${authBase}/accounts:lookup`, "POST", {
  localId: state.users.map((u) => u.id),
});
const existingIds = new Set((existing.users ?? []).map((u) => u.localId));
const missing = state.users.filter((u) => !existingIds.has(u.id));
if (missing.length) {
  const result = await adminRequest(
    `${authBase}/accounts:batchCreate`,
    "POST",
    {
      hashAlgorithm: "BCRYPT",
      users: await Promise.all(
        missing.map(async (user) => ({
          localId: user.id,
          email: `${user.handle}@rabbit.test`,
          displayName: user.name,
          // Alex's requested credential is imported as a real password hash. Other
          // sample people receive random passwords, not shared demo credentials.
          passwordHash: Buffer.from(
            await hash(
              user.id === "alex" ? "alex" : randomBytes(24).toString("hex"),
              12,
            ),
          ).toString("base64"),
        })),
      ),
    },
  );
  if (result.error?.length)
    throw new Error(`Auth seed failed: ${JSON.stringify(result.error)}`);
}
function encode(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") return { integerValue: String(value) };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(encode) } };
  return {
    mapValue: {
      fields: Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, encode(v)]),
      ),
    },
  };
}
const base = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`;
let created = 0;
for (const [collection, records] of Object.entries(state)) {
  for (const record of records) {
    try {
      // Creating only missing documents makes re-running safe for edited data.
      await adminRequest(
        `${base}/${collection}?documentId=${record.id}`,
        "POST",
        { fields: encode(record).mapValue.fields },
      );
      created++;
    } catch (error) {
      if (!error.message.startsWith("409:")) throw error;
    }
  }
}
console.log(
  `Firebase ${project}: ${missing.length} auth users imported; ${created} documents created. Existing users and content preserved.`,
);
