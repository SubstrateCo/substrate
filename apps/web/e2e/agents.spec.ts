import { test, visit } from "./test-support/fixtures";
import { expect } from "@playwright/test";

test("agent definitions can be created, edited, persisted and deleted without running a provider", async ({
  actors,
  client,
}) => {
  const user = await client(actors.sender);
  await visit(user, undefined, "/settings/user/agents");
  const name = `Release helper ${crypto.randomUUID()}`;
  // The header action stays available; the empty state repeats it as a call to action.
  await user.page.getByLabel("Create agent", { exact: true }).click();
  await user.page.getByLabel("Agent name", { exact: true }).fill(name);
  await user.page
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Review release tasks. Do not contact external services.");
  await user.page.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(user.page.getByRole("button", { name: `Edit ${name}`, exact: true })).toBeVisible();
  await user.page.reload();
  await user.page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await expect(user.page.getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue(
    "Review release tasks. Do not contact external services.",
  );
  await user.page
    .getByRole("textbox", { name: "Instructions", exact: true })
    .fill("Summarize release risks only.");
  await user.page.getByRole("button", { name: "Save agent", exact: true }).click();
  await expect(user.page.getByRole("dialog")).toHaveCount(0);
  await user.page.reload();
  await user.page.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
  await expect(user.page.getByRole("textbox", { name: "Instructions", exact: true })).toHaveValue(
    "Summarize release risks only.",
  );
  await user.page.getByRole("button", { name: "Cancel", exact: true }).click();
  await user.page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
  await user.page.getByRole("dialog").getByRole("button", { name: "Delete", exact: true }).click();
  await expect(user.page.getByRole("button", { name: `Edit ${name}`, exact: true })).toHaveCount(0);
  await user.page.reload();
  await expect(
    user.page.getByRole("heading", { name: "No agents yet", exact: true }),
  ).toBeVisible();
  await expect(user.page.getByRole("button", { name: `Edit ${name}`, exact: true })).toHaveCount(0);
});
