import { test, expect, type Page } from "@playwright/test";

test.skip(
  process.env.RABBIT_E2E_FIREBASE === "1",
  "Isolated local backend suite.",
);

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

for (const width of [390, 1440]) {
  test(`goals: break down, rank, complete and refresh at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Goals", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "What are you working toward?" }),
    ).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("home-start.png") });

    // Create a goal
    const title = `Run a half marathon ${width}`;
    await page
      .getByRole("button", { name: /^(New goal|Create a goal)$/ })
      .first()
      .click();
    await page.getByRole("textbox", { name: "Goal title" }).fill(title);
    await page
      .getByRole("textbox", { name: "Why it matters" })
      .fill("Prove I can train for months.");
    await page.getByRole("button", { name: "Create goal" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    // Quick add keeps focus for rapid breakdown
    const add = page.getByRole("textbox", { name: "Add a task to this goal" });
    for (const step of [
      "Book a gait analysis",
      "Pick a training plan",
      "Buy socks",
    ]) {
      await add.fill(step);
      await add.press("Enter");
      await expect(
        page.getByRole("button", { name: `Open task ${step}` }).first(),
      ).toBeVisible();
      await expect(add).toHaveValue("");
      await expect(add).toBeFocused();
    }

    // Task detail: priority and a sub-task
    await page
      .getByRole("button", { name: "Open task Buy socks" })
      .first()
      .click();
    await page.getByRole("button", { name: "High", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Open task Buy socks" }).first(),
    ).toContainText("High");
    await page.getByRole("button", { name: "Close task" }).click();
    await page
      .getByRole("button", { name: "Open task Book a gait analysis" })
      .first()
      .click();
    await page.getByRole("button", { name: "Add a sub-task" }).click();
    const sub = page.getByRole("textbox", { name: "Add a sub-task" });
    await sub.fill("Call the store");
    await sub.press("Enter");
    await expect(
      page.getByRole("button", { name: "Open sub-task Call the store" }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Task notes" })
      .fill("Stride Lab, Saturday morning.");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("task-detail.png") });
    await page.getByRole("button", { name: "Close task" }).click();
    await page.screenshot({ path: testInfo.outputPath("goal-page.png") });

    // Home ranks leaves: priority first, then creation order
    await page.getByRole("button", { name: "All goals" }).click();
    const card = page
      .getByRole("button", { name: `Open goal ${title}` })
      .locator("..");
    const rows = card.getByRole("button", { name: /^Open task / });
    await expect(rows).toHaveText([
      /Buy socks/,
      /Pick a training plan/,
      /Call the store.*in Book a gait analysis/,
    ]);

    // Completing on Home keeps the row in place until Refresh
    await card
      .getByRole("checkbox", { name: "Complete: Buy socks, High priority" })
      .click();
    await expect(
      card.getByRole("button", { name: "Undo completing Buy socks" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Refresh, 1 change" }),
    ).toBeVisible();
    await expect(rows.first()).toHaveText(/Buy socks/);
    await page.screenshot({ path: testInfo.outputPath("home-pending.png") });
    await card
      .getByRole("button", { name: "Undo completing Buy socks" })
      .click();
    await expect(
      page.getByRole("button", { name: "Refresh", exact: true }),
    ).toBeVisible();
    await card
      .getByRole("checkbox", { name: "Complete: Buy socks, High priority" })
      .click();
    await page.getByRole("button", { name: "Refresh, 1 change" }).click();
    await expect(rows).toHaveText([/Pick a training plan/, /Call the store/]);
    await expect(
      page.getByText(
        /^You completed \d+ tasks? across \d+ goals? in the last 7 days\.$/,
      ),
    ).toBeVisible();
    expect(await noOverflow(page)).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath("home-refreshed.png"),
      fullPage: true,
    });

    // Completing a parent with open sub-tasks asks first, then completes the branch
    await page.getByRole("button", { name: `Open goal ${title}` }).click();
    await page
      .getByRole("checkbox", { name: "Complete: Book a gait analysis" })
      .click();
    await expect(
      page.getByRole("dialog", { name: "Complete the whole branch?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Complete all 2" }).click();
    // Completed tasks are hidden by default
    await expect(
      page.getByRole("button", { name: "Open task Book a gait analysis" }),
    ).toHaveCount(0);
    await page.getByRole("button", { name: "Show done · 3" }).click();
    await expect(
      page.getByRole("button", { name: "Open task Book a gait analysis" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open task Call the store" }),
    ).toBeVisible();
    expect(await noOverflow(page)).toBe(true);

    // Persistence
    await page.reload();
    await page
      .getByRole("button", { name: "Goals", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("button", { name: `Open goal ${title}` }),
    ).toBeVisible();
    await expect(card.getByText("3 of 4 done", { exact: false })).toBeVisible();
  });
}

test("goals: a failed completion reverts with a retry message", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Goals", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^(New goal|Create a goal)$/ })
    .first()
    .click();
  const title = `Learn Spanish ${Date.now()}`;
  await page.getByRole("textbox", { name: "Goal title" }).fill(title);
  await page.getByRole("button", { name: "Create goal" }).click();
  const add = page.getByRole("textbox", { name: "Add a task to this goal" });
  await add.fill("Find a tutor");
  await add.press("Enter");
  await page.getByRole("button", { name: "All goals" }).click();
  await page.route("**/api/tasks/*/complete", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Rabbit is reconnecting."}',
    }),
  );
  const card = page
    .getByRole("button", { name: `Open goal ${title}` })
    .locator("..");
  await card.getByRole("checkbox", { name: "Complete: Find a tutor" }).click();
  await expect(
    card.getByText("Couldn’t save. Rabbit is reconnecting."),
  ).toBeVisible();
  await expect(
    card.getByRole("checkbox", { name: "Complete: Find a tutor" }),
  ).not.toBeChecked();
  await page.unroute("**/api/tasks/*/complete");
  await card.getByRole("checkbox", { name: "Complete: Find a tutor" }).click();
  await expect(
    card.getByText("Couldn’t save. Rabbit is reconnecting."),
  ).toHaveCount(0);
  await expect(
    card.getByRole("button", { name: "Undo completing Find a tutor" }),
  ).toBeVisible();
});

test("goals: notes typed just before closing the task are kept", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Goals", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: /^(New goal|Create a goal)$/ })
    .first()
    .click();
  const title = `Notes ${Date.now()}`;
  await page.getByRole("textbox", { name: "Goal title" }).fill(title);
  await page.getByRole("button", { name: "Create goal" }).click();
  const add = page.getByRole("textbox", { name: "Add a task to this goal" });
  await add.fill("Plan route");
  await add.press("Enter");
  await page.getByRole("button", { name: "Open task Plan route" }).click();
  // react-native-web enables Escape once the slide-in finishes and its modal
  // wrapper takes the dialog role alongside the sheet's own.
  await expect(page.locator('[role="dialog"]')).toHaveCount(2);
  await page
    .getByRole("textbox", { name: "Task notes" })
    .pressSequentially("Loop via the park");
  // Close with Escape (no blur), inside the autosave delay.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: "Task notes" })).toHaveCount(
    0,
  );
  await expect(
    page.getByRole("button", { name: "Open task Plan route" }),
  ).toContainText("Has notes");
  await page.reload();
  await page
    .getByRole("button", { name: "Goals", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: `Open goal ${title}` }).click();
  await page.getByRole("button", { name: "Open task Plan route" }).click();
  await expect(page.getByRole("textbox", { name: "Task notes" })).toHaveValue(
    "Loop via the park",
  );
});
