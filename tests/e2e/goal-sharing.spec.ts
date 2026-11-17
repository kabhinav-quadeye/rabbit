import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

test.skip(
  process.env.RABBIT_E2E_FIREBASE === "1",
  "Isolated local backend suite.",
);

const noOverflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

async function account(
  request: APIRequestContext,
  name: string,
  email: string,
) {
  const { token } = await (
    await request.post("/api/auth/register", {
      data: { name, email, password: "test-password-123" },
    })
  ).json();
  const headers = { Authorization: `Bearer ${token}` };
  const me = await (await request.get("/api/bootstrap", { headers })).json();
  return { token, headers, id: me.currentUser.id as string };
}
async function signInAs(page: Page, token: string) {
  // Let any session the app is starting finish first, so it can't win the race.
  await expect(
    page.getByRole("button", { name: "Goals", exact: true }).first(),
  ).toBeVisible();
  await page.evaluate((t) => localStorage.setItem("rabbit.session", t), token);
  await page.reload();
  await page
    .getByRole("button", { name: "Goals", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "What are you working toward?" }),
  ).toBeVisible();
}

for (const width of [390, 1440]) {
  test(`goals: share with a friend, collaborate and leave at ${width}px`, async ({
    page,
    request,
  }, testInfo) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    const suffix = `${width}${Date.now()}`;
    const alice = await account(request, "Alice Planner", `alice${suffix}`);
    const bob = await account(request, "Bob Traveller", `bob${suffix}`);
    const friend = await (
      await request.post("/api/friends/requests", {
        headers: alice.headers,
        data: { recipientId: bob.id },
      })
    ).json();
    await request.patch(`/api/friends/requests/${friend.id}`, {
      headers: bob.headers,
      data: { status: "accepted" },
    });
    // An older private goal with finished work, shared later from its page.
    const garden = await (
      await request.post("/api/goals", {
        headers: alice.headers,
        data: { title: `Grow tomatoes ${width}` },
      })
    ).json();
    const [seed] = await (
      await request.post(`/api/goals/${garden.id}/tasks`, {
        headers: alice.headers,
        data: { description: "Buy seeds" },
      })
    ).json();
    await request.post(`/api/tasks/${seed.id}/complete`, {
      headers: alice.headers,
      data: { cascade: false },
    });

    await page.goto("/");
    await signInAs(page, alice.token);

    // Share while creating
    const title = `Plan the coast trip ${width}`;
    await page
      .getByRole("button", { name: /^(New goal|Create a goal)$/ })
      .first()
      .click();
    await page.getByRole("textbox", { name: "Goal title" }).fill(title);
    await expect(
      page.getByText("Only you can see this goal. You can share it later too."),
    ).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Share with Bob Traveller" })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Share with Bob Traveller" }),
    ).toBeChecked();
    expect(await noOverflow(page)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("form-share.png") });
    await page.getByRole("button", { name: "Create goal" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Shared with Bob. Manage people" }),
    ).toBeVisible();
    const add = page.getByRole("textbox", { name: "Add a task to this goal" });
    await add.fill("Book the cabin");
    await add.press("Enter");
    await expect(
      page.getByRole("button", { name: "Open task Book the cabin" }).first(),
    ).toBeVisible();

    // Share an existing goal, history included
    await page.getByRole("button", { name: "All goals" }).click();
    await page
      .getByRole("button", { name: `Open goal Grow tomatoes ${width}` })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Only you can see this goal. Manage people",
      }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Share goal", exact: true }).click();
    await expect(
      page.getByText(/Everyone here sees every task in/),
    ).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Share with Bob Traveller" })
      .click();
    expect(await noOverflow(page)).toBe(true);
    await page.waitForTimeout(500); // let the sheet finish fading in
    await page.screenshot({ path: testInfo.outputPath("people-sheet.png") });
    await page
      .getByRole("button", { name: "Share with selected friends" })
      .click();
    await expect(
      page.getByText("Bob Traveller", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close" }).first().click();
    await expect(
      page.getByRole("button", { name: "Shared with Bob. Manage people" }),
    ).toBeVisible();

    // Bob sees both goals, all their tasks, and works on them
    await signInAs(page, bob.token);
    await expect(page.getByText(`${title}`)).toBeVisible();
    await expect(page.getByText(/Alice Planner’s goal/).first()).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Complete: Book the cabin" })
      .click();
    await expect(
      page.getByRole("checkbox", { name: "Reopen: Book the cabin" }),
    ).toBeChecked();
    expect(await noOverflow(page)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("bob-home.png") });
    await page
      .getByRole("button", { name: `Open goal Grow tomatoes ${width}` })
      .click();
    await page.getByRole("button", { name: /^Show done/ }).click();
    await expect(
      page.getByRole("button", { name: "Open task Buy seeds" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Goal options" }).click();
    await expect(page.getByRole("button", { name: "Edit goal" })).toHaveCount(
      0,
    );
    await expect(page.getByRole("button", { name: "Delete goal" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Leave goal" }).click();
    await page.getByRole("button", { name: "Leave goal" }).click();
    await expect(
      page.getByText(`You left Grow tomatoes ${width}.`),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Open goal Grow tomatoes ${width}` }),
    ).toHaveCount(0);

    // Alice sees Bob's work
    await signInAs(page, alice.token);
    await page.getByRole("button", { name: `Open goal ${title}` }).click();
    await page.getByRole("button", { name: /^Show done/ }).click();
    await expect(
      page.getByRole("button", { name: "Open task Book the cabin" }),
    ).toContainText("Done by Bob Traveller");
    expect(await noOverflow(page)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("alice-goal.png") });
    expect(errors).toEqual([]);
  });
}
