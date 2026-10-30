import { chromium, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
mkdirSync(".impeccable/review", { recursive: true });
const browser = await chromium.launch({ channel: "chrome" });
const errors = [],
  metrics = [];
const url = process.env.CAPTURE_URL ?? "http://localhost:4173";
async function open(width, height) {
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  await page.goto(url);
  await page.getByRole("textbox", { name: "Post title" }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return page;
}
async function settle(page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== "running"),
  );
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
}
async function capture(page, name) {
  await settle(page);
  await page.screenshot({
    path: `.impeccable/review/${name}.png`,
    fullPage: true,
    animations: "disabled",
  });
  metrics.push({
    name,
    ...(await page.evaluate(() => ({
      width: innerWidth,
      height: innerHeight,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }))),
  });
}
// Fresh viewports avoid Chrome compositor corruption after repeated full-page resizes.
for (const [width, height, name] of [
  [1440, 1080, "desktop"],
  [390, 844, "mobile"],
  [360, 800, "mobile-360"],
  [640, 1000, "tablet-640"],
  [1024, 900, "tablet-1024"],
]) {
  const page = await open(width, height);
  await capture(page, name);
  await page.close();
}
const desktop = await open(1440, 1080);
await desktop
  .getByRole("button", { name: "Search your space", exact: true })
  .click();
await desktop.getByRole("textbox", { name: "Search posts" }).fill("design");
await desktop
  .getByRole("button", {
    name: "Open post: The best design decision is sometimes subtraction.",
  })
  .waitFor();
await desktop.getByRole("textbox", { name: "Search posts" }).blur();
await capture(desktop, "desktop-search");
await desktop.getByRole("button", { name: "Profile", exact: true }).click();
await capture(desktop, "desktop-profile");
await desktop.close();
const page = await open(390, 844);
await page.getByRole("button", { name: "Choose audience, Just me" }).click();
await page.getByRole("dialog", { name: "Who is this for?" }).waitFor();
await capture(page, "mobile-audience");
await page.getByRole("button", { name: "Share with Maya Patel" }).click();
await capture(page, "mobile-recipient-person");
await page.getByRole("button", { name: "Choose audience, Maya Patel" }).click();
await page.getByRole("button", { name: "Share with Design circle" }).click();
await capture(page, "mobile-recipient-group");
await page
  .getByRole("button", { name: "Choose audience, Design circle" })
  .click();
await page.getByRole("button", { name: "Share with Just me" }).click();
await page
  .getByRole("button", { name: "Search your space", exact: true })
  .click();
await page.getByRole("textbox", { name: "Search posts" }).fill("design");
await page
  .getByRole("button", {
    name: "Open post: The best design decision is sometimes subtraction.",
  })
  .waitFor();
await page.getByRole("textbox", { name: "Search posts" }).blur();
await capture(page, "mobile-search");
await page
  .getByRole("textbox", { name: "Search posts" })
  .fill("no-matching-thing-12345");
await expect(page.getByText("No threads found. Yet.")).toBeVisible();
await page.getByRole("textbox", { name: "Search posts" }).blur();
await capture(page, "mobile-empty-search");
await page.getByRole("button", { name: "Recent posts", exact: true }).click();
await capture(page, "mobile-recent");
await page
  .getByRole("button", { name: "Open group Design circle", exact: true })
  .click();
await capture(page, "mobile-group");
await page.getByRole("button", { name: "Invite people to group" }).click();
await page.getByRole("dialog", { name: "Invite your people" }).waitFor();
await page.getByRole("button", { name: "Select Omar Hassan" }).click();
await capture(page, "mobile-invite");
await page.getByRole("button", { name: "Close dialog", exact: true }).click();
await page.getByRole("button", { name: "Profile", exact: true }).click();
await capture(page, "mobile-profile");
writeFileSync(
  ".impeccable/review/runtime-errors.json",
  JSON.stringify(errors, null, 2),
);
writeFileSync(
  ".impeccable/review/viewport-checks.json",
  JSON.stringify(metrics, null, 2),
);
console.log(JSON.stringify({ errors, metrics }));
await browser.close();
