import { test, expect } from "@playwright/test";

test.skip(process.env.RABBIT_E2E_FIREBASE === "1", "Isolated local backend");

for (const width of [390, 1440]) {
  test(`copy agent setup and review a draft at ${width}px`, async ({
    context,
    page,
    request,
  }, info) => {
    const title = `Agent reading notes at ${width}px`;
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "Agent access", exact: true })
      .click();
    const copy = page.getByRole("button", { name: "Copy setup prompt" });
    await expect(copy).toBeHidden();
    await page.getByRole("button", { name: /^(Create|Replace) key$/ }).click();
    const key = await page
      .getByLabel("Agent key", { exact: true })
      .textContent();
    await copy.click({ timeout: 5000 });
    await expect(page.getByText("Setup prompt copied.")).toBeVisible();
    const prompt = await page.evaluate(() => navigator.clipboard.readText());
    expect(prompt).toContain(`URL: ${new URL("/api/mcp", page.url()).href}`);
    expect(prompt).toContain("Streamable HTTP");
    expect(prompt).toContain(`Authorization: Bearer ${key}`);
    expect(prompt).toContain("tools/list");
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("agent-setup.png"),
    });
    const response = await request.post("http://localhost:3002/api/mcp", {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/json, text/event-stream",
      },
      data: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "create_post_draft",
          arguments: {
            title,
            body: "A short draft to review.",
          },
        },
      },
    });
    expect((await response.json()).result.isError).toBeUndefined();
    await page.getByRole("button", { name: "Refresh proposals" }).click();
    await expect(page.getByText(title)).toBeVisible();
    await page.getByRole("button", { name: "Hide key" }).click();
    await expect(copy).toBeHidden();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("agent-review.png"),
    });
    await page.getByRole("button", { name: "Approve private post" }).click();
    await expect(page.getByText("No proposals to review.")).toBeVisible();
    await page.getByRole("button", { name: "Revoke key" }).click();
    await expect(page.getByText("Agent key revoked.")).toBeVisible();
    await page.getByRole("button", { name: "Close dialog" }).click();
    await expect(page.getByText(title)).toBeVisible();
  });
}

for (const width of [390, 1440]) {
  test(`WebFetch drafts require signed-in approval at ${width}px`, async ({
    browser,
    context,
    page,
    request,
  }, info) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    const session = await request.post("/api/auth/demo");
    const headers = { Authorization: `Bearer ${(await session.json()).token}` };
    const title = `Learn Bengali at ${width}px`;
    const task = `Find a tutor at ${width}px`;
    const created = await request.post("/api/goals", {
      headers,
      data: { title },
    });
    const { id: goalId } = await created.json();
    const homepage = await request.get("/");
    const html = await homepage.text();
    expect(html).toContain("/api/agent/goal-suggestions");

    const docs = await browser.newPage({
      javaScriptEnabled: false,
      viewport: { width, height: 844 },
    });
    await docs.goto(new URL(homepage.url()).origin);
    await expect(
      docs.getByRole("heading", { name: "Use Rabbit Goals with WebFetch" }),
    ).toBeVisible();
    await docs.screenshot({ path: info.outputPath("goal-webfetch-guide.png") });
    await docs.close();

    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await page.getByRole("button", { name: "Goals", exact: true }).click();
    await page.getByRole("button", { name: `Open goal ${title}` }).click();
    await page.getByRole("button", { name: "Goal options" }).click();
    await page.getByRole("button", { name: "Share with WebFetch" }).click();
    await page.getByRole("button", { name: "Create WebFetch token" }).click();
    const token = await page
      .getByLabel("WebFetch token", { exact: true })
      .textContent();
    await page.screenshot({
      animations: "disabled",
      path: info.outputPath("goal-webfetch-token.png"),
      mask: [page.getByLabel("WebFetch token", { exact: true })],
      maskColor: "#dce4d8",
    });
    await page.getByRole("button", { name: "Copy WebFetch access" }).click();
    await expect(page.getByText("WebFetch access copied.")).toBeVisible();
    const access = await page.evaluate(() => navigator.clipboard.readText());
    expect(access).toContain(new URL(homepage.url()).origin);
    expect(access).toContain(`Goal ID: ${goalId}`);
    expect(access).toContain(`WebFetch token: ${token}`);
    const params = new URLSearchParams({
      goalId,
      token: token!,
      description: task,
    });
    const suggestion = await request.get(
      `/api/agent/goal-suggestions?${params}`,
    );
    expect(suggestion.ok()).toBe(true);
    const { reviewPath } = await suggestion.json();
    await page.goto(reviewPath);
    const review = page.getByRole("dialog", { name: "Review suggested task" });
    await expect(review.getByText(task)).toBeVisible();
    await expect(review.getByText(title)).toBeVisible();
    const before = await request.get("/api/goals", { headers });
    expect(
      (await before.json()).tasks.some(
        (item: { description: string }) => item.description === task,
      ),
    ).toBe(false);
    await page.screenshot({
      path: info.outputPath("goal-webfetch-review.png"),
    });
    await review.getByRole("button", { name: "Add task to goal" }).click();
    await expect(review).toBeHidden();
    await expect(
      page.getByRole("dialog", { name: "Share with WebFetch" }),
    ).toBeHidden();
    await expect(
      page.getByRole("checkbox", { name: `Complete: ${task}` }),
    ).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
  });
}

test("a private goal suggestion waits for an account that can access it", async ({
  page,
  request,
}) => {
  const username = "goal-review-owner";
  const password = "review-test-password";
  const account = await request.post("/api/auth/register", {
    data: { name: "Review owner", email: username, password },
  });
  expect(account.ok()).toBe(true);
  const headers = { Authorization: `Bearer ${(await account.json()).token}` };
  const goal = await request.post("/api/goals", {
    headers,
    data: { title: "Plan a private trip" },
  });
  const { id: goalId } = await goal.json();
  const key = await request.post("/api/agent/goals", {
    headers,
    data: { goalId },
  });
  const description = "Check travel dates";
  const params = new URLSearchParams({
    goalId,
    token: (await key.json()).token,
    description,
  });
  const suggestion = await request.get(`/api/agent/goal-suggestions?${params}`);
  const { reviewPath } = await suggestion.json();

  await page.goto(reviewPath);
  const review = page.getByRole("dialog", { name: "Review suggested task" });
  await expect(
    review.getByText("This goal isn’t available to your account."),
  ).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Add task to goal" }),
  ).toHaveCount(0);
  await review.getByRole("button", { name: "Dismiss" }).click();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.goto(reviewPath);
  await expect(review).toBeHidden();
  await page.getByRole("textbox", { name: "Username or email" }).fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(review.getByText(description)).toBeVisible();
  await expect(
    review.getByRole("button", { name: "Add task to goal" }),
  ).toBeEnabled();
  await review.getByRole("button", { name: "Dismiss" }).click();
  expect(
    (await (await request.get("/api/goals", { headers })).json()).tasks,
  ).toEqual([]);
});
