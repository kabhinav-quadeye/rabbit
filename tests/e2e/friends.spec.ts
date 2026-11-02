import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";

test.skip(
  process.env.RABBIT_E2E_FIREBASE === "1",
  "Isolated local account suite.",
);
for (const width of [390, 1440]) {
  test(`discover by username, accept friendship, then invite at ${width}px`, async ({
    page,
    request,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: width === 390 ? 844 : 1050 });
    async function capture(name: string) {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() =>
        document.getAnimations().every((a) => a.playState !== "running"),
      );
      await page.screenshot({
        path: `.impeccable/review/${name}-${width}.png`,
        fullPage: true,
        animations: "disabled",
      });
    }
    const suffix = `${width}${Date.now()}`;
    const username = `reader${suffix}`;
    const other = `friend${suffix}`;
    const password = "test-password-123";
    const bob = await (
      await request.post("/api/auth/register", {
        data: { name: "Robin Longname Reader", email: other, password },
      })
    ).json();
    await page.goto("/");
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await page
      .getByRole("button", { name: "New here? Create an account" })
      .click();
    await page.getByRole("textbox", { name: "Your name" }).fill("A New Reader");
    await page
      .getByRole("textbox", { name: "Username", exact: true })
      .fill(username);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page
      .getByRole("button", { name: "Create account", exact: true })
      .click();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Friends", exact: true }).click();
    await expect(
      page.getByText("No friends yet.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Find people by username" })
      .fill(`@${other.toUpperCase()}`);
    await page
      .getByRole("button", { name: "Add Robin Longname Reader as a friend" })
      .click();
    await expect(page.getByText("Request sent", { exact: true })).toBeVisible();
    await page.reload();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Friends", exact: true }).click();
    await expect(
      page.getByText("Sent requests", { exact: true }),
    ).toBeVisible();
    const alice = await (
      await request.post("/api/auth/login", {
        data: { email: username, password },
      })
    ).json();
    await page.evaluate(
      (token) => localStorage.setItem("rabbit.session", token),
      bob.token,
    );
    await page.reload();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Friends", exact: true }).click();
    await expect(
      page.getByText("Incoming requests", { exact: true }),
    ).toBeVisible();
    mkdirSync(".impeccable/review", { recursive: true });
    await capture("friends-incoming");
    await page
      .getByRole("button", { name: "Accept friend request from A New Reader" })
      .click();
    await expect(
      page.getByText("Incoming requests", { exact: true }),
    ).toHaveCount(0);
    await page.evaluate(
      (token) => localStorage.setItem("rabbit.session", token),
      alice.token,
    );
    await page.reload();
    await page.getByRole("button", { name: "Profile", exact: true }).click();
    await page.getByRole("button", { name: "Friends", exact: true }).click();
    await expect(
      page.getByText("Robin Longname Reader", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Find people by username" })
      .fill("no-such-username-123");
    await expect(
      page.getByText("No users match that username.", { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("textbox", { name: "Find people by username" })
      .fill("");
    await capture("friends");
    await page
      .getByRole("button", { name: "Recent posts", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Create a circle", exact: true })
      .first()
      .click();
    await page
      .getByRole("textbox", { name: "Circle name" })
      .fill(`Friends ${suffix}`);
    await expect(
      page.getByRole("button", { name: "Select Maya Patel" }),
    ).toHaveCount(0);
    await page
      .getByRole("button", { name: "Select Robin Longname Reader" })
      .click();
    await capture("friends-group");
    await page
      .getByRole("button", { name: "Create circle", exact: true })
      .click();
    await expect(
      page.getByText("2 members", { exact: true }).first(),
    ).toBeVisible();
    expect(errors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
  });
}
