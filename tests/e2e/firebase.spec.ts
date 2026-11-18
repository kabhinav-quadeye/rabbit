import { test, expect } from "@playwright/test";

test.skip(
  process.env.RABBIT_E2E_FIREBASE !== "1",
  "Run npm run test:e2e:firebase against the configured Firebase project.",
);

test("Alex uses normal password sign-in, sees seeded components, and stays signed in", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Explore the demo" }),
  ).toHaveCount(0);
  await page.getByRole("textbox", { name: "Username or email" }).fill("alex");
  await page.getByLabel("Password", { exact: true }).fill("wrong");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("incorrect");
  await page.getByLabel("Password", { exact: true }).fill("alex");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Post title" })).toBeVisible();
  await expect(page.getByText("Demo space", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Choose audience, Just me" }).click();
  await expect(
    page.getByRole("button", { name: "Share with Maya Patel" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Share with Design circle" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Share with Just me" }).click();
  await page.getByRole("button", { name: "Recent posts", exact: true }).click();
  await expect(
    page.getByText("The best design decision is sometimes subtraction.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", {
      name: "Open post: The best design decision is sometimes subtraction.",
    })
    .click();
  await expect(
    page.getByText(
      "The simplest solutions always take the most thought. Love this.",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close post" }).click();
  await page.getByRole("button", { name: "Your space", exact: true }).click();
  await page.getByRole("button", { name: "Search your space" }).click();
  await page
    .getByRole("textbox", { name: "Search posts" })
    .fill("reading list");
  await expect(
    page.getByText("That reading list we talked about", { exact: true }),
  ).toBeVisible();
  // Returning readers with initialized profiles can open Home without a
  // transaction. Keep this endpoint unavailable during relaunch.
  const commit = /firestore\.googleapis\.com.*documents:commit/;
  await page.route(commit, (route) => route.abort());
  await page.reload();
  await expect(
    page.getByText("The best design decision is sometimes subtraction.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.unroute(commit);
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit profile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Username or email" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Username or email" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("Google sign-in opens the configured Google OAuth flow", async ({
  page,
}) => {
  await page.goto("/");
  const popupPromise = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  const popup = await popupPromise;
  try {
    await expect(popup).toHaveURL(/accounts\.google\.com/, { timeout: 20000 });
    await expect(popup.locator("body")).not.toContainText("Error 400");
    await expect(popup.locator("body")).not.toContainText("Access blocked");
  } finally {
    await popup.close();
  }
});
