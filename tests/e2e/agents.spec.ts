import { test, expect } from "@playwright/test";
test.skip(
  process.env.RABBIT_E2E_FIREBASE === "1",
  "Isolated local agent suite",
);
for (const width of [360, 1440]) {
  test(`agent connection and draft review at ${width}px`, async ({
    page,
    context,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const guide = await page.request.get("/AGENTS.md");
    expect(await guide.text()).toContain("# Use Rabbit with your agent");
    await page.goto("/");
    await page
      .getByRole("button", { name: "Profile", exact: true })
      .first()
      .click();
    await page.getByRole("button", { name: "Agents", exact: true }).click();
    await expect(
      page.getByText("Connect your research assistant"),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Agent name" })
      .fill(`Research ${width}`);
    await page.screenshot({
      path: `test-results/agents-empty-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Create token", exact: true })
      .click();
    const secret = page.getByLabel("New agent token", { exact: true });
    await expect(secret).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show token", exact: true }).click();
    const token = await secret.inputValue();
    expect(token).toMatch(/^rba_/);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy token", exact: true }).click();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe(token);
    await page.getByRole("button", { name: "Hide token", exact: true }).click();
    const title = `Agent finding ${width}-${Date.now()}`;
    const draft = await page.request.post("/api/agent/drafts", {
      headers: { Authorization: `Bearer ${token}` },
      data: { title, body: "Evidence to review before publishing." },
    });
    expect(draft.status()).toBe(201);
    await page
      .getByRole("button", { name: "Refresh agent activity", exact: true })
      .click();
    await page
      .getByRole("button", { name: `Review ${title}`, exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Draft title" })
      .fill(title + " reviewed");
    await page.screenshot({
      path: `test-results/agents-review-${width}.png`,
      fullPage: true,
    });
    await page.route(
      "**/api/agents/drafts/*/publish",
      (route) =>
        route.fulfill({
          status: 503,
          json: { error: "Could not publish. Your draft is safe. Try again." },
        }),
      { times: 1 },
    );
    await page
      .getByRole("button", { name: "Publish privately", exact: true })
      .click();
    await expect(
      page.getByText("Could not publish. Your draft is safe. Try again."),
    ).toBeInViewport();
    await expect(
      page.getByRole("textbox", { name: "Draft title" }),
    ).toHaveValue(title + " reviewed");
    await page
      .getByRole("button", { name: "Publish privately", exact: true })
      .click();
    await expect(
      page.getByText("Draft published. Only you can see it."),
    ).toBeVisible();
    const heading = page.getByRole("heading", {
      name: "Your agents",
      exact: true,
    });
    const bounds = await heading.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(18);
    await page.screenshot({
      path: `test-results/agents-${width}.png`,
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole("button", {
        name: `Delete token for Research ${width}`,
        exact: true,
      })
      .click();
    await page
      .getByRole("button", { name: "Delete token", exact: true })
      .click();
    expect(
      (
        await page.request.get("/api/agent/search", {
          headers: { Authorization: `Bearer ${token}` },
        })
      ).status(),
    ).toBe(401);
    await page.reload();
    await expect(
      page.getByLabel("New agent token", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Recent posts", exact: true })
      .first()
      .click();
    await expect(
      page.getByText(title + " reviewed", { exact: true }),
    ).toBeVisible();
  });
}
