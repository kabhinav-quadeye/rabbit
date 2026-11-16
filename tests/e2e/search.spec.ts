import { test, expect } from "@playwright/test";
test.skip(process.env.RABBIT_E2E_FIREBASE === "1", "Local isolated backend");
for (const width of [360, 1440])
  test(`search loads bounded pages and retains results after a failed next page at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(
      page.getByRole("textbox", { name: "Post title" }),
    ).toBeVisible();
    const key = `pagination${width}${Date.now()}`;
    const session = await page.evaluate(() =>
      localStorage.getItem("rabbit.session"),
    );
    for (let i = 0; i < 27; i++) {
      const r = await page.request.post("/api/posts", {
        headers: { Authorization: `Bearer ${session}` },
        data: {
          audienceType: "self",
          title: `${key} note ${i}`,
          body: "A useful field observation.",
        },
      });
      expect(r.ok()).toBeTruthy();
    }
    await page.getByRole("button", { name: "Search your space" }).click();
    await page.getByRole("textbox", { name: "Search posts" }).fill(key);
    await expect(page.getByRole("button", { name: /Open post:/ })).toHaveCount(
      25,
    );
    const more = page.getByRole("button", {
      name: "Load more posts",
      exact: true,
    });
    await expect(more).toBeVisible();
    await page.screenshot({ path: info.outputPath(`search-${width}.png`) });
    await more.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`search-more-${width}.png`),
    });
    await page.route("**/api/search?**", async (route) => {
      if (new URL(route.request().url()).searchParams.has("cursor")) {
        await route.fulfill({
          status: 503,
          json: { error: "Search is temporarily unavailable." },
        });
      } else await route.continue();
    });
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert")).toContainText(
      "temporarily unavailable",
    );
    await expect(page.getByRole("button", { name: /Open post:/ })).toHaveCount(
      25,
    );
    await page.unroute("**/api/search?**");
    await page.getByRole("button", { name: "Try loading more again" }).click();
    await expect(page.getByRole("button", { name: /Open post:/ })).toHaveCount(
      27,
    );
    await expect(more).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
  });
