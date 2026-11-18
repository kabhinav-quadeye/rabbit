import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const url = new URL(process.argv[2] ?? "http://localhost:4173/").href;
const screenshots = process.argv[3];
const username = process.env.RABBIT_BENCH_USERNAME;
const password = process.env.RABBIT_BENCH_PASSWORD;
const profileName = process.env.RABBIT_BENCH_PROFILE ?? "Alex Morgan";
const postTitle =
  process.env.RABBIT_BENCH_POST ??
  "The best design decision is sometimes subtraction.";

if (Boolean(username) !== Boolean(password)) {
  throw new Error(
    "Set both RABBIT_BENCH_USERNAME and RABBIT_BENCH_PASSWORD for a signed-in benchmark.",
  );
}

const profile = await mkdtemp(join(tmpdir(), "rabbit-pwa-"));
try {
  const context = await chromium.launchPersistentContext(profile, {
    channel: "chrome",
    headless: false,
    viewport: { width: 1440, height: 960 },
  });
  const browser = await context.browser().newBrowserCDPSession();
  let installed = false;
  try {
    await context.addInitScript(
      ({ profileName, postTitle }) => {
        const timing = {};
        window.rabbitBenchmark = timing;

        function observe() {
          const observer = new MutationObserver(findContent);
          observer.observe(document.body, { childList: true, subtree: true });
          findContent();

          function findContent() {
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_TEXT,
            );
            for (let node; (node = walker.nextNode());) {
              const label = node.data.trim();
              const key =
                label === profileName
                  ? "profile"
                  : label === postTitle
                    ? "post"
                    : null;
              if (!key || key in timing) continue;
              const rect = node.parentElement.getBoundingClientRect();
              if (!rect.width || !rect.height) continue;
              if (
                key === "profile" &&
                (rect.bottom <= 0 || rect.top >= innerHeight)
              )
                continue;
              timing[key] = null;
              requestAnimationFrame(() =>
                requestAnimationFrame(() => {
                  timing[key] = performance.now();
                }),
              );
              if ("profile" in timing && "post" in timing) {
                observer.disconnect();
                break;
              }
            }
          }
        }

        if (document.body) observe();
        else
          document.addEventListener("DOMContentLoaded", observe, {
            once: true,
          });
      },
      { profileName, postTitle },
    );

    const [tab] = context.pages();
    await tab.goto(url);
    if (username && password) {
      await tab
        .getByRole("textbox", { name: "Username or email" })
        .fill(username);
      await tab.getByLabel("Password", { exact: true }).fill(password);
      await tab.getByRole("button", { name: "Sign in", exact: true }).click();
    }
    await tab.getByText(postTitle, { exact: true }).waitFor();
    await tab.waitForFunction(() => navigator.serviceWorker.controller);
    await browser.send("PWA.install", {
      manifestId: url,
      installUrlOrBundleUrl: url,
    });
    installed = true;
    await browser.send("PWA.changeAppUserSettings", {
      manifestId: url,
      displayMode: "standalone",
    });
    await tab.goto("about:blank");

    async function launch() {
      const opened = context.waitForEvent("page");
      await browser.send("PWA.launch", { manifestId: url });
      const page = await opened;
      await page.waitForURL(url);
      await page.waitForFunction(
        () => matchMedia("(display-mode: standalone)").matches,
      );
      return page;
    }

    async function measure(page) {
      await page.waitForFunction(
        () =>
          ["profile", "post"].every(
            (key) => typeof window.rabbitBenchmark?.[key] === "number",
          ),
        undefined,
        { timeout: 90_000 },
      );
      return page.evaluate(() => {
        const js = performance
          .getEntriesByType("resource")
          .filter((r) =>
            new URL(r.name).pathname.startsWith("/_expo/static/js/web/"),
          );
        return {
          profileMs: Math.round(window.rabbitBenchmark.profile),
          postMs: Math.round(window.rabbitBenchmark.post),
          jsTransferBytes: js.reduce(
            (sum, resource) => sum + resource.transferSize,
            0,
          ),
          jsDecodedBytes: js.reduce(
            (sum, resource) => sum + resource.decodedBodySize,
            0,
          ),
        };
      });
    }

    function report(label, timings) {
      const median = (key) =>
        timings.map((entry) => entry[key]).sort((a, b) => a - b)[3];
      console.log(
        JSON.stringify({
          scenario: label,
          medianProfileMs: median("profileMs"),
          medianPostMs: median("postMs"),
          samples: timings,
        }),
      );
    }

    const desktop = [];
    for (let trial = 0; trial < 7; trial++) {
      const page = await launch();
      desktop.push(await measure(page));
      if (screenshots && trial === 6) {
        await mkdir(screenshots, { recursive: true });
        await page.screenshot({ path: join(screenshots, "desktop.png") });
      }
      await page.close();
    }
    report("Installed desktop relaunch", desktop);

    const phone = await launch();
    await measure(phone);
    await phone.setViewportSize({ width: 390, height: 844 });
    const session = await context.newCDPSession(phone);
    await session.send("Network.enable");
    await session.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    await session.send("Network.emulateNetworkConditions", {
      offline: false,
      latency: 150,
      downloadThroughput: 200_000,
      uploadThroughput: 93_750,
    });
    const throttled = [];
    for (let trial = 0; trial < 7; trial++) {
      await phone.reload({ waitUntil: "domcontentloaded" });
      throttled.push(await measure(phone));
    }
    if (screenshots) {
      await phone.screenshot({ path: join(screenshots, "phone.png") });
    }
    report(
      "Installed window at 390px, 4× CPU slowdown, 1.6 Mbps down, 150ms latency",
      throttled,
    );
  } finally {
    try {
      if (installed) await browser.send("PWA.uninstall", { manifestId: url });
    } finally {
      await context.close();
    }
  }
} finally {
  await rm(profile, { recursive: true, force: true });
}
