import { test, expect } from "@playwright/test";

test.skip(
  process.env.RABBIT_E2E_FIREBASE === "1",
  "Isolated local backend suite.",
);
for (const width of [360, 1440]) {
  test(`outdated feedback persists in feeds, search and detail at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const title = `Guide ${width} ${Date.now()}`;
    await page.getByRole("textbox", { name: "Post title" }).fill(title);
    await page
      .getByRole("textbox", { name: "Post content" })
      .fill(
        "This guide describes an older version. Check the current documentation.",
      );
    await page.getByRole("button", { name: "Publish post" }).click();
    await expect(
      page.getByText("Your post is in the right place."),
    ).toBeVisible();
    await expect(
      page.getByText("Your post is in the right place."),
    ).toBeHidden();
    await page
      .getByRole("button", { name: "Recent posts", exact: true })
      .first()
      .click();
    const card = page
      .getByRole("button", { name: `Open post: ${title}`, exact: true })
      .locator("../..");
    await card.screenshot({ path: testInfo.outputPath("before.png") });
    await card
      .getByRole("button", { name: "Mark outdated", exact: true })
      .click();
    await expect(
      card.getByText("May be outdated", { exact: true }),
    ).toBeVisible();
    await expect(
      card.getByRole("button", { name: "Remove outdated mark" }),
    ).toHaveAttribute("aria-pressed", "true");
    await card.screenshot({ path: testInfo.outputPath("marked-card.png") });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: "Search your space" }).click();
    await page.getByRole("textbox", { name: "Search posts" }).fill(title);
    await expect(
      card.getByText("May be outdated", { exact: true }),
    ).toBeVisible();
    await card
      .getByRole("button", { name: `Open post: ${title}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "A closer look",
      exact: true,
    });
    await expect(
      dialog.getByText("May be outdated", { exact: true }),
    ).toBeVisible();
    // React Native Web's modal fade runs on an ancestor of the dialog.
    await dialog.evaluate(async (element) => {
      const animations: Animation[] = [];
      for (
        let node: Element | null = element;
        node;
        node = node.parentElement
      ) {
        animations.push(...node.getAnimations());
      }
      await Promise.all(animations.map((animation) => animation.finished));
    });
    await dialog.screenshot({ path: testInfo.outputPath("marked-detail.png") });
    await dialog.getByRole("button", { name: "Remove outdated mark" }).click();
    await expect(
      dialog.getByText("May be outdated", { exact: true }),
    ).toHaveCount(0);
    await expect(
      dialog.getByRole("button", { name: "Mark outdated", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Close post" }).click();
    await expect(
      card.getByText("May be outdated", { exact: true }),
    ).toHaveCount(0);
  });
}

test("failed outdated feedback preserves state and can be retried", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Recent posts", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", {
      name: "Open post: The best design decision is sometimes subtraction.",
    })
    .click();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/api/posts/*/outdated",
    async (route) => {
      await pending;
      await route.fulfill({
        status: 503,
        json: { error: "Couldn’t update feedback. Please try again." },
      });
    },
    { times: 1 },
  );
  const dialog = page.getByRole("dialog", {
    name: "A closer look",
    exact: true,
  });
  const mark = dialog.getByRole("button", {
    name: "Mark outdated",
    exact: true,
  });
  await mark.click();
  await expect(mark).toBeDisabled();
  release();
  await expect(dialog.getByRole("alert")).toContainText(
    "Couldn’t update feedback. Please try again.",
  );
  await expect(mark).toBeEnabled();
  await expect(
    dialog.getByText("May be outdated", { exact: true }),
  ).toHaveCount(0);
  await mark.focus();
  await page.keyboard.press("Enter");
  await expect(
    dialog.getByText("May be outdated", { exact: true }),
  ).toBeVisible();
});
