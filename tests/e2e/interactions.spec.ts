import { test, expect } from "@playwright/test";

test.skip(
  process.env.RABBIT_E2E_FIREBASE === "1",
  "Isolated local backend suite.",
);

for (const width of [360, 1440]) {
  test(`saved posts, useful votes and comments survive reload without a follow-up bootstrap at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const title = `Interaction ${width} ${Date.now()}`;
    await page.getByRole("textbox", { name: "Post title" }).fill(title);
    await page
      .getByRole("textbox", { name: "Post content" })
      .fill("A resource worth keeping and discussing.");
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
    await page
      .getByRole("button", { name: `Open post: ${title}`, exact: true })
      .click();
    const dialog = page.getByRole("dialog", {
      name: "A closer look",
      exact: true,
    });
    // A committed mutation must not be reported as failed because a later read fails.
    let bootstrapReads = 0;
    await page.route("**/api/bootstrap", async (route) => {
      bootstrapReads++;
      await route.fulfill({
        status: 503,
        json: { error: "Account reload unavailable." },
      });
    });
    await dialog
      .getByRole("button", { name: "Mark useful", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Remove useful vote" }),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Remove useful vote" }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByText("1 useful", { exact: true })).toBeVisible();
    await dialog
      .getByRole("button", { name: "Save post", exact: true })
      .click();
    await expect(
      dialog.getByRole("button", { name: "Unsave post" }),
    ).toHaveAttribute("aria-pressed", "true");
    const comment = "Thanks — this is useful!";
    await dialog
      .getByRole("textbox", { name: "Write a comment" })
      .fill(comment);
    await dialog.getByRole("button", { name: "Send comment" }).click();
    await expect(
      dialog.getByRole("textbox", { name: "Write a comment" }),
    ).toHaveValue("");
    await expect(dialog.getByText(comment, { exact: true })).toHaveCount(1);
    expect(bootstrapReads).toBe(0);
    await page.unroute("**/api/bootstrap");
    await page.reload();
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Saved", exact: true }).click();
    await page
      .getByRole("button", { name: `Open post: ${title}`, exact: true })
      .click();
    await expect(dialog.getByText(comment, { exact: true })).toHaveCount(1);
    await expect(dialog.getByText("1 useful", { exact: true })).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Unsave post" }),
    ).toHaveAttribute("aria-pressed", "true");
    // React Native Web fades the modal ancestor, outside the dialog itself.
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
    await dialog.screenshot({
      path: testInfo.outputPath("saved-conversation.png"),
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dialog.getByRole("button", { name: "Remove useful vote" }).click();
    await expect(
      dialog.getByRole("button", { name: "Mark useful", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await dialog.getByRole("button", { name: "Unsave post" }).click();
    await expect(
      dialog.getByRole("button", { name: "Save post", exact: true }),
    ).toHaveAttribute("aria-pressed", "false");
    await page.getByRole("button", { name: "Close post" }).click();
    await expect(
      page.getByRole("button", { name: `Open post: ${title}`, exact: true }),
    ).toHaveCount(0);
  });
}

for (const action of ["vote", "save", "comments"]) {
  test(`${action} shows pending state, preserves input on failure and permits keyboard retry`, async ({
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
    const dialog = page.getByRole("dialog", {
      name: "A closer look",
      exact: true,
    });
    const input = dialog.getByRole("textbox", { name: "Write a comment" });
    const label =
      action === "vote"
        ? "Mark useful"
        : action === "save"
          ? "Save post"
          : "Send comment";
    if (action !== "comments") {
      const undo = dialog.getByRole("button", {
        name: action === "vote" ? "Remove useful vote" : "Unsave post",
        exact: true,
      });
      if (await undo.count()) {
        await undo.click();
        await expect(
          dialog.getByRole("button", { name: label, exact: true }),
        ).toBeVisible();
      }
    }
    const button = dialog.getByRole("button", { name: label, exact: true });
    let release!: () => void;
    const pending = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(
      `**/api/posts/*/${action}`,
      async (route) => {
        await pending;
        await route.fulfill({
          status: 503,
          json: { error: "Couldn’t save your change. Please try again." },
        });
      },
      { times: 1 },
    );
    if (action === "comments") await input.fill("Keep my reply for retry.");
    await button.click();
    await expect(button).toBeDisabled();
    if (action === "comments") await expect(input).not.toBeEditable();
    else await expect(button).toHaveAttribute("aria-busy", "true");
    release();
    await expect(dialog.getByRole("alert")).toContainText(
      "Couldn’t save your change. Please try again.",
    );
    await expect(button).toBeEnabled();
    if (action === "comments")
      await expect(input).toHaveValue("Keep my reply for retry.");
    await button.focus();
    await page.keyboard.press("Enter");
    if (action === "comments") {
      await expect(input).toHaveValue("");
      await expect(
        dialog.getByText("Keep my reply for retry.", { exact: true }),
      ).toHaveCount(1);
    } else {
      await expect(
        dialog.getByRole("button", {
          name: action === "vote" ? "Remove useful vote" : "Unsave post",
          exact: true,
        }),
      ).toHaveAttribute("aria-pressed", "true");
    }
  });
}

test("a delayed useful-vote response does not hide a newer comment", async ({
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
  const dialog = page.getByRole("dialog", {
    name: "A closer look",
    exact: true,
  });
  const remove = dialog.getByRole("button", { name: "Remove useful vote" });
  if (await remove.count()) {
    await remove.click();
    await expect(
      dialog.getByRole("button", { name: "Mark useful", exact: true }),
    ).toBeVisible();
  }
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let committed!: () => void;
  const written = new Promise<void>((resolve) => {
    committed = resolve;
  });
  await page.route(
    "**/api/posts/*/vote",
    async (route) => {
      const response = await route.fetch();
      committed();
      await pending;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await dialog
    .getByRole("button", { name: "Mark useful", exact: true })
    .click();
  await written;
  const reply = `A newer reply ${Date.now()}`;
  await dialog.getByRole("textbox", { name: "Write a comment" }).fill(reply);
  await dialog.getByRole("button", { name: "Send comment" }).click();
  await expect(dialog.getByText(reply, { exact: true })).toBeVisible();
  release();
  await expect(
    dialog.getByRole("button", { name: "Remove useful vote" }),
  ).toBeEnabled();
  await expect(dialog.getByText(reply, { exact: true })).toBeVisible();
});
