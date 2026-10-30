import { chromium } from "@playwright/test";
import { writeFileSync } from "node:fs";
const mark =
  '<path d="M10.8 18.6C5 10.8 6.8 3 10.2 3c3.2 0 5.7 7.4 6.2 13.7C17.6 7.9 21.6 2.5 24.3 4c3 1.6 1.7 9.3-3.2 15.2 5.9.9 9.1 4.5 8.3 8.5-.8 4-5.2 5.9-12.1 5.3C9 32.3 5.8 29.4 6.8 25c.6-2.7 2-4.9 4-6.4Z" fill="COLOR"/><circle cx="22.6" cy="24.7" r="1.4" fill="EYE"/>';
const svg = (size, adaptive = false) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 64 64">${adaptive ? "" : '<rect width="64" height="64" rx="14" fill="#f1f3eb"/>'}<g transform="translate(14 13)">${mark.replace("COLOR", adaptive ? "#ffffff" : "#2f5843").replace("EYE", adaptive ? "#2f5843" : "#f1f3eb")}</g></svg>`;
writeFileSync("assets/icon.svg", svg(64));
const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage();
for (const [name, size, adaptive] of [
  ["icon.png", 1024, false],
  ["favicon.png", 64, false],
  ["android-icon-foreground.png", 432, true],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">${svg(size, adaptive)}</body></html>`,
  );
  await page.screenshot({ path: `assets/${name}`, omitBackground: true });
}
await browser.close();
