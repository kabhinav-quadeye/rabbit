import { pathToFileURL } from "node:url";
import { postSearchTokens } from "../src/search.ts";

/** Reindex content only; identity names are resolved from live metadata. */
export async function reindexSearch(request, base, apply = false) {
  const counts = { scanned: 0, changed: 0, applied: 0 };
  let pageToken;
  do {
    const url = new URL(`${base}/posts`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const page = await request(url.toString());
    for (const document of page.documents ?? []) {
      counts.scanned++;
      const f = document.fields;
      const searchTokens = postSearchTokens({
        title: f.title?.stringValue ?? "",
        body: f.body?.stringValue ?? "",
        tags: (f.tags?.arrayValue?.values ?? []).map((v) => v.stringValue),
        url: f.url?.stringValue,
      });
      const previous = (f.searchTokens?.arrayValue?.values ?? []).map(
        (v) => v.stringValue,
      );
      if (
        f.searchTokens &&
        JSON.stringify(searchTokens) === JSON.stringify(previous)
      )
        continue;
      counts.changed++;
      if (!apply) continue;
      const target = new URL(
        document.name.startsWith("https://")
          ? document.name
          : `https://firestore.googleapis.com/v1/${document.name}`,
      );
      target.searchParams.set("updateMask.fieldPaths", "searchTokens");
      target.searchParams.set(
        "currentDocument.updateTime",
        document.updateTime,
      );
      // A failed precondition aborts safely: rerun to compute from fresh content.
      await request(target.toString(), "PATCH", {
        fields: {
          searchTokens: {
            arrayValue: {
              values: searchTokens.map((stringValue) => ({ stringValue })),
            },
          },
        },
      });
      counts.applied++;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return counts;
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const project = process.argv
    .find((a) => a.startsWith("--project="))
    ?.slice(10);
  if (!project || !/^[a-z][a-z0-9-]+$/.test(project))
    throw new Error(
      "Specify --project=PROJECT_ID. Default is a dry run; --apply writes searchTokens only.",
    );
  const { adminRequest } = await import("./firebase-admin.mjs");
  const apply = process.argv.includes("--apply");
  const result = await reindexSearch(
    adminRequest,
    `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents`,
    apply,
  );
  console.log(
    JSON.stringify({ project, mode: apply ? "apply" : "dry-run", ...result }),
  );
}
