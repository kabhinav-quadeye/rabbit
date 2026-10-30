// Uses the already authenticated Firebase CLI; never writes credentials to the repo.
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
const require = createRequire(import.meta.url);
const cliRoot = join(
  execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim(),
  "firebase-tools",
);
const { getGlobalDefaultAccount, getAccessToken } = require(
  join(cliRoot, "lib/auth.js"),
);
export async function adminRequest(url, method = "GET", body) {
  const account = getGlobalDefaultAccount();
  if (!account) throw new Error("Run firebase login first.");
  const token = await getAccessToken(account.tokens.refresh_token, [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/firebase",
  ]);
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      `${response.status}: ${result.error?.message ?? "Firebase administration failed"}`,
    );
  return result;
}
