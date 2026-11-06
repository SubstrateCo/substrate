import { expect, test } from "@playwright/test";

test("typing @ opens the picker; people, tasks, and projects render after sending", async ({
  page,
}) => {
  await page.goto(
    "/iframe.html?id=messaging-scenes-workspace--references-in-channel&viewMode=story",
  );
  const draft = page.getByRole("textbox", { name: "Message #general", exact: true });
  await draft.fill("Please review @");
  const picker = page.getByRole("region", { name: "Insert workspace reference" });
  await expect(picker).toBeVisible();
  await picker.getByRole("button", { name: "People", exact: true }).click();
  const search = picker.getByRole("combobox", { name: "Search references" });
  await search.fill("Alex");
  await search.press("Enter");
  await expect(draft).toHaveValue("Please review @[person:44444444-4444-4444-8444-444444444444] ");
  await page.getByRole("button", { name: "Insert reference", exact: true }).click();
  await picker.getByRole("option", { name: "Review the onboarding flow", exact: true }).click();
  await page.getByRole("button", { name: "Insert reference", exact: true }).click();
  await picker.getByRole("button", { name: "Projects", exact: true }).click();
  await picker.getByRole("option", { name: "Workspace launch", exact: true }).click();
  await page.getByRole("button", { name: "Send", exact: true }).click();
  const sent = page.getByRole("article").last();
  await expect(sent.getByText("Alex Morgan", { exact: true })).toBeVisible();
  await expect(
    sent.getByRole("link", { name: "Review the onboarding flow", exact: true }),
  ).toBeVisible();
  await expect(sent.getByRole("link", { name: "Workspace launch", exact: true })).toBeVisible();
  await expect(draft).toHaveValue("");
});

test("references preserve formatting and code stays literal", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=messaging-components-references-inline-reference--formatting&viewMode=story",
  );
  await expect(
    page.getByRole("link", { name: "Review the onboarding flow", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveText("Ask Alex Morgan");
  await expect(
    page.getByText("@[task:11111111-1111-4111-8111-111111111111]", { exact: true }),
  ).toBeVisible();
});

test("missing targets expose no labels or navigation", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=messaging-components-references-inline-reference--missing-target&viewMode=story",
  );
  await expect(page.getByText("Unavailable reference", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("link")).toHaveCount(0);
  await expect(page.getByText("Alex Morgan", { exact: true })).toHaveCount(0);
});

test("Escape closes references and preserves the draft in a thread", async ({ page }) => {
  await page.goto(
    "/iframe.html?id=messaging-scenes-workspace--references-in-thread&viewMode=story",
  );
  const draft = page.getByRole("textbox", { name: "Reply in thread…", exact: true });
  await draft.fill("Keep this @");
  const search = page.getByRole("combobox", { name: "Search references" });
  await search.fill("Nobody");
  await expect(page.getByText("No accessible references found.")).toBeVisible();
  await search.press("Escape");
  await expect(page.getByRole("region", { name: "Insert workspace reference" })).toHaveCount(0);
  await expect(draft).toHaveValue("Keep this @");
  await expect(draft).toBeFocused();
});
