import { test, expect, type Page } from "@playwright/test";

test.skip(
  process.env.RABBIT_E2E_FIREBASE === "1",
  "Uses isolated local posts.",
);

// The speech service is external. Keep Rabbit, the library's web adapter,
// draft storage and publishing real; drive only browser recognition events.
async function speech(page: Page, available = true) {
  await page.addInitScript(
    ({ available }) => {
      if (!available) {
        Object.defineProperty(window, "SpeechRecognition", {
          value: undefined,
        });
        Object.defineProperty(window, "webkitSpeechRecognition", {
          value: undefined,
        });
        return;
      }
      class Recognition extends EventTarget {
        start() {
          (window as any).recognition = this;
          this.dispatchEvent(new Event("start"));
        }
        stop() {
          (window as any).stopRequested = true;
        }
        abort() {
          this.dispatchEvent(new Event("end"));
        }
      }
      (window as any).webkitSpeechRecognition = Recognition;
      (window as any).emitSpeech = (
        type: string,
        transcript = "",
        final = true,
      ) => {
        const event = new Event(type);
        Object.assign(
          event,
          type === "result"
            ? {
                resultIndex: 0,
                results: [
                  Object.assign([{ transcript, confidence: 0.9 }], {
                    isFinal: final,
                  }),
                ],
              }
            : type === "error"
              ? { error: transcript, message: transcript }
              : {},
        );
        (window as any).recognition.dispatchEvent(event);
      };
    },
    { available },
  );
}
async function emit(page: Page, type: string, text = "", final = true) {
  await page.evaluate(
    ({ type, text, final }) => (window as any).emitSpeech(type, text, final),
    { type, text, final },
  );
}

for (const width of [360, 1440]) {
  test(`dictation appends reviewed text and publishes only on request at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await speech(page);
    await page.goto("/");
    const body = page.getByRole("textbox", {
      name: "Post content",
      exact: true,
    });
    await expect(body).toBeVisible();
    await page.screenshot({
      path: `.impeccable/review/before-${width}.png`,
      fullPage: true,
    });
    await body.fill("Typed first.");
    await page
      .getByRole("textbox", { name: "Post title", exact: true })
      .fill(`Voice note ${width}`);
    await page
      .getByRole("button", { name: "Dictate post content", exact: true })
      .click();
    await expect(page.getByText("Listening…", { exact: true })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Publish post", exact: true }),
    ).toBeDisabled();
    await emit(page, "result", "A useful", false);
    await expect(body).toHaveValue("Typed first.");
    await expect(page.getByText("A useful", { exact: true })).toBeVisible();
    await emit(page, "result", "A useful thought.");
    await expect(body).toHaveValue("Typed first. A useful thought.");
    await emit(page, "result", "Another", false);
    await page.screenshot({
      path: `.impeccable/review/listening-${width}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Stop dictation", exact: true })
      .click();
    await expect(
      page.getByText("Finishing dictation…", { exact: true }),
    ).toBeVisible();
    await emit(page, "result", "Another sentence.");
    await emit(page, "end");
    await expect(body).toHaveValue(
      "Typed first. A useful thought. Another sentence.",
    );
    await body.fill(
      `Typed first. A useful thought. Corrected sentence ${width}.`,
    );
    await page.waitForTimeout(500); // Existing draft persistence debounce.
    await page.reload();
    await expect(body).toHaveValue(
      `Typed first. A useful thought. Corrected sentence ${width}.`,
    );
    await page.screenshot({
      path: `.impeccable/review/${width === 360 ? "mobile" : "desktop"}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Publish post", exact: true })
      .click();
    await expect(body).toHaveValue("");
    await page
      .getByRole("button", { name: "Recent posts", exact: true })
      .first()
      .click();
    await expect(
      page.getByText(`Voice note ${width}`, { exact: true }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByText(
        `Typed first. A useful thought. Corrected sentence ${width}.`,
        {
          exact: true,
        },
      ),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test("recognition errors preserve the draft and allow keyboard retry", async ({
  page,
}) => {
  await speech(page);
  await page.goto("/");
  const body = page.getByRole("textbox", { name: "Post content", exact: true });
  await body.fill("Keep my draft.");
  const start = page.getByRole("button", {
    name: "Dictate post content",
    exact: true,
  });
  await start.focus();
  await page.keyboard.press("Enter");
  await emit(page, "error", "not-allowed");
  await emit(page, "end");
  await expect(page.getByRole("alert")).toContainText(
    "Allow microphone and speech recognition",
  );
  await expect(body).toHaveValue("Keep my draft.");
  await start.click();
  await emit(page, "result", "Recovered.");
  await emit(page, "end");
  await expect(body).toHaveValue("Keep my draft. Recovered.");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("unsupported recognition keeps typing and publishing available", async ({
  page,
}) => {
  await speech(page, false);
  await page.goto("/");
  await expect(
    page.getByText(
      "Dictation isn’t available here. You can still type your post.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Dictate post content", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Post title", exact: true })
    .fill("Typed instead");
  await expect(
    page.getByRole("button", { name: "Publish post", exact: true }),
  ).toBeEnabled();
});

test("no speech and network errors recover without retaining interim text", async ({
  page,
}) => {
  await speech(page);
  await page.goto("/");
  const start = page.getByRole("button", {
    name: "Dictate post content",
    exact: true,
  });
  await start.click();
  await emit(page, "end");
  await expect(page.getByRole("alert")).toContainText("No speech was captured");
  await start.click();
  await emit(page, "result", "Unconfirmed words", false);
  await emit(page, "error", "network");
  await emit(page, "end");
  await expect(page.getByRole("alert")).toContainText("Check your connection");
  await expect(
    page.getByText("Unconfirmed words", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Post content", exact: true }),
  ).toHaveValue("");
});

test("leaving the composer aborts recognition and rejects late results", async ({
  page,
}) => {
  await speech(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Dictate post content", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Recent posts", exact: true })
    .first()
    .click();
  await emit(page, "result", "Late words.");
  await page
    .getByRole("button", { name: "Your space", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Post content", exact: true }),
  ).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Dictate post content", exact: true }),
  ).toBeEnabled();
});
