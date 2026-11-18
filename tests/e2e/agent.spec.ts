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
