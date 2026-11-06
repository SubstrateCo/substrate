import { expect, test } from "@playwright/test";

const story = (name: string) =>
  `/iframe.html?id=messaging-scenes-reference-composer--${name}&viewMode=story`;

test("bare @ suggests multiple types without a separate search field", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await draft.fill("Please review @");
  await expect(page.getByRole("dialog", { name: "Insert workspace reference" })).toBeVisible();
  await expect(page.getByRole("option", { name: /Alex Morgan/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Review the onboarding flow/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /Workspace launch Project/ })).toBeVisible();
  await expect(page.getByRole("textbox")).toHaveCount(1);
  await expect(draft).toBeFocused();
});

test("prefixes and filter controls share the composer query", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await draft.fill("Ask @user:alex");
  await expect(page.getByRole("button", { name: "Users", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("option")).toHaveCount(1);
  await page.getByRole("button", { name: "Tasks", exact: true }).click();
  await expect(draft).toHaveText("Ask @task:alex");
  await expect(draft).toBeFocused();
  await expect(page.getByRole("status")).toContainText("No matching references");
  await draft.fill("Ask @project:launch");
  await expect(page.getByRole("option")).toHaveCount(1);
  await expect(page.getByRole("option")).toContainText("Workspace launch");
});

test("Left and Right cycle reference types and preserve the search", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await draft.fill("Review @launch");
  await draft.press("ArrowRight");
  await expect(draft).toHaveText("Review @user:launch");
  await expect(page.getByRole("button", { name: "Users", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await draft.press("ArrowRight");
  await expect(draft).toHaveText("Review @task:launch");
  await draft.press("ArrowRight");
  await expect(draft).toHaveText("Review @project:launch");
  await draft.press("ArrowRight");
  await expect(draft).toHaveText("Review @launch");
  await draft.press("ArrowLeft");
  await expect(draft).toHaveText("Review @project:launch");
  await expect(draft).toBeFocused();
  await expect(page.getByRole("option")).toContainText("Workspace launch");
  await draft.press("Enter");
  await expect(draft).toContainText("Workspace launch");
});

test("type arrows work from the filter controls but do not override editing when closed", async ({
  page,
}) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await draft.fill("Ask @");
  const users = page.getByRole("button", { name: "Users", exact: true });
  await users.click();
  await users.focus();
  await users.press("ArrowRight");
  await expect(draft).toHaveText("Ask @task:");
  await draft.press("Escape");
  await draft.press("ArrowLeft");
  await expect(draft).toHaveText("Ask @task:");
});

test("keyboard selection inserts without sending and restores focus", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await draft.fill("Review @");
  await draft.press("ArrowDown");
  await expect(page.getByRole("option", { selected: true })).toContainText(
    "Review the onboarding flow",
  );
  const selectedId = await page.getByRole("option", { selected: true }).getAttribute("id");
  await expect(draft).toHaveAttribute("aria-activedescendant", selectedId!);
  await draft.press("Enter");
  await expect(draft).toContainText("Review the onboarding flow");
  await expect(draft).not.toContainText("@[task:");
  await expect(draft).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Sent message" })).toHaveCount(0);
  await draft.press("Enter");
  await expect(
    page
      .getByRole("article", { name: "Sent message" })
      .getByRole("link", { name: "Review the onboarding flow" }),
  ).toBeVisible();
});

test("insertion at the caret preserves the rest of the message", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await draft.fill("Ask @user:alex before launch");
  await expect(draft).toHaveText("Ask @user:alex before launch");
  await draft.evaluate((element) => {
    const text = element.firstElementChild?.firstChild;
    if (!text) throw new Error("Expected draft text");
    window.getSelection()?.setPosition(text, 14);
  });
  await expect(page.getByRole("option", { name: /Alex Morgan/ })).toBeVisible();
  await page.getByRole("option", { name: /Alex Morgan/ }).click();
  await expect(draft).toContainText("Alex Morgan");
  await expect(draft).toContainText("before launch");
  await expect(draft).toBeFocused();
});

test("Escape and outside clicks dismiss without losing the draft", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await draft.fill("Keep this @task:review");
  await draft.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(draft).toHaveText("Keep this @task:review");
  await expect(draft).toBeFocused();
  await page.getByRole("button", { name: "Insert reference", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("main").click({ position: { x: 8, y: 8 } });
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(draft).toHaveText("Keep this @task:review");
});

test("retry preserves the typed prefix and search", async ({ page }) => {
  await page.goto(story("search-error"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await expect(page.getByRole("alert")).toContainText("Couldn’t search references");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByRole("option")).toContainText("Review the onboarding flow");
  await expect(draft).toHaveText("Keep this @task:onboarding");
  await expect(draft).toBeFocused();
});

test("refresh errors keep usable results; loading does not allow insertion", async ({ page }) => {
  await page.goto(story("refresh-error"));
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByRole("option", { name: /Alex Morgan/ }).click();
  await expect(page.getByRole("textbox")).toContainText("Alex Morgan");
  await page.goto(story("loading"));
  await expect(page.getByRole("status", { name: "Searching references" })).toBeVisible();
  const draft = page.getByRole("textbox");
  await draft.focus();
  await draft.press("Enter");
  await expect(draft).toHaveText("Can you take a look at @");
  await expect(page.getByRole("article", { name: "Sent message" })).toHaveCount(0);
});

test("composition does not select or send a reference", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox");
  await draft.fill("Ask @user:alex");
  await draft.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await expect(draft).toHaveText("Ask @user:alex");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("article", { name: "Sent message" })).toHaveCount(0);
});

test("empty results do not submit, and Shift+Enter still adds a new line", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox");
  await draft.fill("Ask @user:nobody");
  await expect(page.getByRole("status")).toContainText("No matching references");
  await draft.press("Enter");
  await expect(draft).toHaveText("Ask @user:nobody");
  await expect(page.getByRole("article", { name: "Sent message" })).toHaveCount(0);
  await draft.press("Shift+Enter");
  await draft.press("X");
  await expect(draft).toHaveText("Ask @user:nobody X", { useInnerText: true });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("project filtering and insertion work in dark theme", async ({ page }) => {
  await page.goto(`${story("dark")}&globals=theme:dark`);
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Projects", exact: true }).click();
  await expect(page.getByRole("option")).toContainText("Workspace launch");
  await page.getByRole("textbox").press("Enter");
  await expect(page.getByRole("textbox")).toContainText("Workspace launch");
});

test("popover fits a narrow viewport with long names", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(story("constrained"));
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(320);
  await expect(page.getByRole("button", { name: "Projects", exact: true })).toBeInViewport();
  await expect(page.getByRole("option").first()).toBeInViewport();
});

test("draft references show named chips and keep their links when sent", async ({ page }) => {
  await page.goto(story("inserted-references"));
  const draft = page.getByRole("textbox", { name: "Message #general" });
  await expect(draft).toContainText("Alex Morgan");
  await expect(draft).toContainText("Review the onboarding flow");
  await expect(draft).toContainText("Workspace launch");
  await expect(draft).not.toContainText("44444444-");
  await expect(draft).not.toContainText("@[");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const sent = page.getByRole("article", { name: "Sent message" });
  await expect(sent).toContainText("Alex Morgan");
  await expect(sent.getByRole("link", { name: "Review the onboarding flow" })).toBeVisible();
  await expect(sent.getByRole("link", { name: "Workspace launch" })).toBeVisible();
  await expect(draft).toBeEmpty();
});

test("typing after a chip can insert another reference and backspace removes the whole chip", async ({
  page,
}) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox");
  await draft.fill("Ask @user:alex");
  await draft.press("Enter");
  await draft.pressSequentially("about @task:onboarding");
  await expect(page.getByRole("option")).toContainText("Review the onboarding flow");
  await draft.press("Enter");
  await expect(draft).toContainText("Alex Morgan");
  await expect(draft).toContainText("Review the onboarding flow");
  await draft.press("Backspace");
  await draft.press("Backspace");
  await expect(draft).not.toContainText("Review the onboarding flow");
  await expect(draft).toContainText("Alex Morgan");
  await expect(draft).not.toContainText("@[");
});

test("unavailable draft references hide identifiers and keep surrounding text", async ({
  page,
}) => {
  await page.goto(story("unavailable-reference"));
  const draft = page.getByRole("textbox");
  await expect(draft).toContainText("Unavailable reference");
  await expect(draft).toContainText("before launch.");
  await expect(draft).not.toContainText("99999999-");
  await expect(draft.getByRole("link")).toHaveCount(0);
});

test("reference insertion preserves line breaks and text after the chip", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox");
  await draft.fill("First line");
  await draft.press("Shift+Enter");
  await draft.pressSequentially("Ask @user:alex");
  await draft.press("Enter");
  await draft.pressSequentially("before launch");
  await expect(draft).toHaveText("First line Ask Alex Morgan before launch", {
    useInnerText: true,
  });
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const sent = page.getByRole("article", { name: "Sent message" });
  await expect(sent).toContainText("First line");
  await expect(sent).toContainText("Alex Morgan");
  await expect(sent).toContainText("before launch");
});

test("pasted reference tokens become chips and pasted markup stays plain text", async ({
  page,
}) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox");
  await draft.focus();
  await draft.evaluate((element) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData(
      "text/plain",
      "Ask @[person:44444444-4444-4444-8444-444444444444] <b>before launch</b>",
    );
    element.dispatchEvent(
      new ClipboardEvent("paste", { bubbles: true, cancelable: true, clipboardData }),
    );
  });
  await expect(draft).toContainText("Alex Morgan");
  await expect(draft).toContainText("<b>before launch</b>");
  await expect(draft).not.toContainText("@[");
});

test("chip insertion supports undo and redo", async ({ page }) => {
  await page.goto(story("start-typing"));
  const draft = page.getByRole("textbox");
  await draft.fill("Ask @user:alex");
  await draft.press("Enter");
  await expect(draft).toContainText("Alex Morgan");
  await draft.press("Control+z");
  await expect(draft).toHaveText("Ask @user:alex");
  await draft.press("Control+Shift+z");
  await expect(draft).toContainText("Alex Morgan");
  await expect(draft).not.toContainText("@[");
});

test("long reference chips wrap inside a narrow composer", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(story("long-inserted-references"));
  const draft = page.getByRole("textbox");
  await expect(draft).toContainText("Alex Morgan — workspace launch readiness");
  await expect(draft).not.toContainText("@[");
  const width = await draft.evaluate((element) => ({
    content: element.scrollWidth,
    available: element.clientWidth,
  }));
  expect(width.content).toBeLessThanOrEqual(width.available);
  await expect(page.getByRole("button", { name: "Send", exact: true })).toBeInViewport();
});
