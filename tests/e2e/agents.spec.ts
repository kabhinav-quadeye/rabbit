import { test, expect } from "@playwright/test";

test.skip(
  process.env.RABBIT_E2E_FIREBASE === "1",
  "Isolated local account suite.",
);
for (const width of [360, 1440]) {
  test(`agent setup, attributed feedback and revocation at ${width}px`, async ({
    page,
    request,
    context,
  }) => {
    await page.setViewportSize({ width, height: width === 360 ? 900 : 1050 });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const account = await (
      await request.post("/api/auth/register", {
        data: {
          name: "Agent Reader",
          email: `agent-${width}-${Date.now()}`,
          password: "rabbit-test-password",
        },
      })
    ).json();
    await request.post("/api/posts", {
      headers: { Authorization: `Bearer ${account.token}` },
      data: {
        title: "Useful garden design",
        body: "Leave room for new ideas.",
        audienceType: "self",
      },
    });
    await page.addInitScript(
      (token) => localStorage.setItem("rabbit.session", token),
      account.token,
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Agents", exact: true }).click();
    for (const label of ["Your posts", "Saved", "Friends", "Agents"]) {
      const box = await page
        .getByRole("button", { name: label, exact: true })
        .boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(18);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width - 18);
    }
    await expect(page.getByText("No agents connected yet.")).toBeVisible();
    // A failed create retains the name and offers an explicit retry.
    await page
      .getByRole("textbox", { name: "Agent name" })
      .fill("Research helper");
    await page.route("**/api/agent-connections", async (route) => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 503,
          json: { error: "Connection interrupted. Try again." },
        });
      else await route.continue();
    });
    await page.getByRole("button", { name: "Create agent connection" }).click();
    await expect(page.getByRole("alert")).toHaveText(
      "Connection interrupted. Try again.",
    );
    await expect(page.getByRole("textbox", { name: "Agent name" })).toHaveValue(
      "Research helper",
    );
    await page.screenshot({
      path: `.impeccable/review/agents-error-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.unroute("**/api/agent-connections");
    await page.getByRole("button", { name: "Create agent connection" }).click();
    const token = await page
      .getByRole("textbox", { name: "Agent token" })
      .inputValue();
    expect(token).toMatch(/^rabbit_agent_/);
    await expect(
      page.getByText("Copy this token now. It is shown only once."),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "MCP server URL" }),
    ).toHaveValue(/\/api\/agent\/mcp$/);
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copy token", exact: true }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      token,
    );
    await page.screenshot({
      path: `.impeccable/review/agents-token-${width}.png`,
      fullPage: true,
      animations: "disabled",
      mask: [page.getByRole("textbox", { name: "Agent token" })],
      maskColor: "#E8EEE1",
    });
    const rpc = async (name: string, args: unknown) => {
      const response = await request.post("/api/agent/mcp", {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name, arguments: args },
        },
      });
      expect(response.ok()).toBeTruthy();
      return (await response.json()).result.structuredContent;
    };
    const found = await rpc("search_posts", { query: "design" });
    const post = found.posts[0];
    expect(post).toBeTruthy();
    await rpc("set_feedback", {
      postId: post.id,
      kind: "useful",
      active: true,
    });
    await rpc("set_feedback", {
      postId: post.id,
      kind: "outdated",
      active: true,
    });
    await page.getByRole("button", { name: "Done with token" }).click();
    await expect(
      page.getByRole("textbox", { name: "Agent token" }),
    ).toHaveCount(0);
    await page.reload();
    await page.getByRole("button", { name: "Search your space" }).click();
    await page.getByRole("textbox", { name: "Search posts" }).fill(post.title);
    await expect(
      page.getByText("Marked useful by Research helper on your behalf."),
    ).toBeVisible();
    await expect(
      page.getByText("Marked outdated by Research helper on your behalf."),
    ).toBeVisible();
    await page
      .getByText("Marked outdated by Research helper on your behalf.")
      .scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.impeccable/review/agents-feedback-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Agents", exact: true }).click();
    await expect(
      page.getByRole("textbox", { name: "Agent token" }),
    ).toHaveCount(0);
    await expect(page.getByRole("textbox", { name: "Agent name" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: `.impeccable/review/agents-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    const row = page
      .getByTestId("agent-connection")
      .filter({ hasText: "Research helper" })
      .first();
    await row.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: `.impeccable/review/agents-list-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await row.getByRole("button", { name: "Revoke Research helper" }).click();
    await expect(row.getByText("Revoked", { exact: true })).toBeVisible();
    const denied = await request.post("/api/agent/mcp", {
      headers: { Authorization: `Bearer ${token}` },
      data: {},
    });
    expect(denied.status()).toBe(401);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBeTruthy();
    expect(errors).toEqual([]);
  });
}
