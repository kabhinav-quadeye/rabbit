import { expect, test, type Page } from "@playwright/test";

test.skip(process.env.RABBIT_E2E_FIREBASE === "1", "Uses the local demo.");

async function openProfile(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .first()
    .click();
}

test("serves a standalone manifest with usable install icons", async ({
  page,
}) => {
  await page.goto("/");
  const manifestURL = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href", {
      timeout: 4000,
    });
  const response = await page.request.get(manifestURL!);
  expect(response.ok()).toBe(true);
  const manifest = await response.json();
  expect(manifest).toMatchObject({
    name: "Rabbit",
    display: "standalone",
    start_url: "/",
  });
  for (const size of [192, 512]) {
    const icon = manifest.icons.find(
      (item: { sizes: string }) => item.sizes === `${size}x${size}`,
    );
    const dimensions = await page.evaluate(async (src) => {
      const image = new Image();
      image.src = src;
      await image.decode();
      return [image.naturalWidth, image.naturalHeight];
    }, icon.src);
    expect(dimensions).toEqual([size, size]);
  }
});

test("Profile opens the browser install prompt and hides the action after installation", async ({
  page,
}) => {
  // The browser's install prompt is one-shot OS UI. Simulate its event at the window boundary.
  await page.addInitScript(() => {
    window.addEventListener("DOMContentLoaded", () => {
      const event = Object.assign(
        new Event("beforeinstallprompt", { cancelable: true }),
        {
          prompt: async () => {
            window.dispatchEvent(new Event("appinstalled"));
            return { outcome: "accepted", platform: "web" };
          },
        },
      );
      window.dispatchEvent(event);
    });
  });
  await openProfile(page);
  const install = page.getByRole("button", {
    name: "Install Rabbit",
    exact: true,
  });
  await expect(install).toBeVisible({ timeout: 4000 });
  await page.screenshot({
    path: test.info().outputPath("profile-desktop.png"),
  });
  await install.click();
  await expect(install).toHaveCount(0);
});

test.describe("iPhone browser", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  });

  test("Profile shows home-screen installation guidance without a browser prompt", async ({
    page,
  }) => {
    await openProfile(page);
    await page
      .getByRole("button", { name: "Install Rabbit", exact: true })
      .click({ timeout: 4000 });
    await expect(page.getByText(/Add to Home Screen/)).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("profile-phone.png"),
    });
  });
});

test("shows a reconnect page for an offline launch", async ({
  page,
  context,
}) => {
  await page.goto("/");
  const scope = await page.evaluate(async () => {
    const registration =
      await navigator.serviceWorker.register("/service-worker.js");
    await navigator.serviceWorker.ready;
    return registration.scope;
  });
  expect(scope).toBe(new URL("/", page.url()).href);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "You’re offline" }),
  ).toBeVisible();
});
