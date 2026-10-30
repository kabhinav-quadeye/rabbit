import { test, expect } from "@playwright/test";
const unique = () => `Note ${Date.now()}`;
test("post to self, find it through search, and keep it after reload", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("What’s worth sharing?")).toBeVisible();
  const title = unique();
  await page.getByRole("textbox", { name: "Post title" }).fill(title);
  await page
    .getByRole("textbox", { name: "Post content" })
    .fill("A useful thought worth remembering.");
  await page.getByRole("button", { name: "Publish post" }).click();
  await expect(
    page.getByText("Your post is in the right place."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search your space" }).click();
  await page.getByRole("textbox", { name: "Search posts" }).fill(title);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Search your space" }).click();
  await page.getByRole("textbox", { name: "Search posts" }).fill(title);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});
test("create a group with an existing user and post to it", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Create a group" }).first().click();
  const name = `Reading ${Date.now()}`;
  await page.getByRole("textbox", { name: "Group name" }).fill(name);
  await page.getByRole("button", { name: "Select Maya Patel" }).click();
  await page.getByRole("button", { name: "Create group", exact: true }).click();
  await expect(page.getByText(name).first()).toBeVisible();
  await page.getByRole("button", { name: "Post to this group" }).click();
  await page.getByRole("textbox", { name: "Post title" }).fill(`For ${name}`);
  await page
    .getByRole("textbox", { name: "Post content" })
    .fill("An essay for our reading circle.");
  await page.getByRole("button", { name: "Publish post" }).click();
  await expect(
    page.getByText("Your post is in the right place."),
  ).toBeVisible();
});
test("saved items, comments and profile editing work", async ({ page }) => {
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
  const comment = `A thoughtful reminder ${Date.now()}.`;
  await page.getByRole("textbox", { name: "Write a comment" }).fill(comment);
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(
    page.getByRole("textbox", { name: "Write a comment" }),
  ).toHaveValue("");
  await expect(page.getByText(comment, { exact: true })).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Save post", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "Unsave post", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close post" }).click();
  await page
    .getByRole("button", { name: "Profile", exact: true })
    .first()
    .click();
  await page.getByRole("button", { name: "Edit profile" }).click();
  await page
    .getByRole("textbox", { name: "Your bio" })
    .fill("Collecting ideas worth keeping.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Collecting ideas worth keeping.")).toBeVisible();
});
test("mobile layout keeps all three tabs usable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Your space", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Recent posts", exact: true }).click();
  await expect(
    page.getByText("A little closer to your circles."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Edit profile" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("composer renders without runtime errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page.getByRole("textbox", { name: "Post title" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a group member can invite an existing user", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Go to The builders club", exact: true })
    .click();
  await page.getByRole("button", { name: "Invite people to group" }).click();
  await page.getByRole("button", { name: "Select Omar Hassan" }).click();
  await page.getByRole("button", { name: "Add members", exact: true }).click();
  await expect(page.getByText("4 members", { exact: true })).toBeVisible();
});

test("direct sharing shows the recipient and remains searchable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Choose audience, Just me" }).click();
  await page.getByRole("button", { name: "Share with Maya Patel" }).click();
  await expect(
    page.getByText("Only you and Maya", { exact: true }),
  ).toBeVisible();
  const title = `For Maya ${Date.now()}`;
  await page.getByRole("textbox", { name: "Post title" }).fill(title);
  await page
    .getByRole("textbox", { name: "Post content" })
    .fill("A little inspiration for your next project.");
  await page.getByRole("button", { name: "Publish post" }).click();
  await expect(
    page.getByText("Your post is in the right place."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Search your space" }).click();
  await page.getByRole("textbox", { name: "Search posts" }).fill(title);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
});

test("a real account can register, sign out and sign in with private data", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "New here? Create an account" })
    .click();
  const email = `reader${Date.now()}@example.com`;
  await page.getByRole("textbox", { name: "Your name" }).fill("A New Reader");
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("my-test-password");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(page.getByText("What’s worth sharing?")).toBeVisible();
  await expect(page.getByText("A good place to begin.")).toBeVisible();
  const title = `Private thought ${Date.now()}`;
  await page.getByRole("textbox", { name: "Post title" }).fill(title);
  await page
    .getByRole("textbox", { name: "Post content" })
    .fill("This belongs to this account only.");
  await page.getByRole("button", { name: "Publish post" }).click();
  await expect(
    page.getByText("Your post is in the right place."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("textbox", { name: "Email address" }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("my-test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Recent posts", exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Profile", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  await page.getByRole("button", { name: "Search your space" }).click();
  await page.getByRole("textbox", { name: "Search posts" }).fill(title);
  await expect(page.getByText("No threads found. Yet.")).toBeVisible();
});

test("audience choice coordinates the icon, recipient tone and privacy explanation", async ({
  page,
}) => {
  await page.goto("/");
  const self = page.getByRole("button", { name: "Choose audience, Just me" });
  const selfTone = await self.evaluate(
    (el) => getComputedStyle(el).backgroundColor,
  );
  const selfIcon = await self.locator("svg").first().innerHTML();
  await self.click();
  await page.getByRole("button", { name: "Share with Maya Patel" }).click();
  const person = page.getByRole("button", {
    name: "Choose audience, Maya Patel",
  });
  await expect(
    page.getByText("Only you and Maya", { exact: true }),
  ).toBeVisible();
  expect(
    await person.evaluate((el) => getComputedStyle(el).backgroundColor),
  ).not.toBe(selfTone);
  expect(await person.locator("svg").first().innerHTML()).not.toBe(selfIcon);
  await person.click();
  await page.getByRole("button", { name: "Share with Design circle" }).click();
  const group = page.getByRole("button", {
    name: "Choose audience, Design circle",
  });
  await expect(
    page.getByText("Visible to 4 group members", { exact: true }),
  ).toBeVisible();
  expect(await group.locator("svg").first().innerHTML()).not.toBe(selfIcon);
});

test("composer placeholders meet readable text contrast on their white surface", async ({
  page,
}) => {
  await page.goto("/");
  for (const name of ["Post title", "Post content"]) {
    const color = await page
      .getByRole("textbox", { name })
      .evaluate((el) => getComputedStyle(el, "::placeholder").color);
    const rgb = color
      .match(/[\d.]+/g)!
      .slice(0, 3)
      .map(Number);
    const linear = rgb.map((v) => {
      const n = v / 255;
      return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
    });
    const luminance =
      linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
    expect(
      1.05 / (luminance + 0.05),
      `${name} placeholder contrast`,
    ).toBeGreaterThanOrEqual(4.5);
  }
});
