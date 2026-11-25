import { conversation, post, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";

test("quick reactions react from the toolbar and follow the emoji chosen in preferences", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  await post(actors.sender, "messaging/messages", {
    conversationId: channel.id,
    body: "The launch checklist is ready for review.",
  });
  const viewer = await client(actors.sender);
  await visit(viewer, channel.id);
  const row = viewer.page.getByRole("article").filter({ hasText: "The launch checklist is ready" });
  await row.hover();
  const toolbar = row.getByRole("group", { name: "Message actions", exact: true });
  await toolbar.getByRole("button", { name: "React with thumbs up", exact: true }).click();
  await expect(row.getByRole("button", { name: "👍, 1 reaction", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  // Selecting a quick reaction you already added removes it, as the reaction chip does.
  await toolbar.getByRole("button", { name: "Remove thumbs up reaction", exact: true }).click();
  await expect(row.getByRole("button", { name: /^👍, / })).toHaveCount(0);

  await viewer.page.goto(`/settings/user/preferences?workspaceId=${actors.sender.organizationId}`);
  const quick = viewer.page.getByRole("group", { name: "Quick reactions", exact: true });
  await quick.getByRole("button", { name: "Replace thumbs up", exact: true }).click();
  const picker = viewer.page.getByRole("dialog", { name: "Emoji", exact: true });
  await picker.getByRole("searchbox", { name: "Search emoji", exact: true }).fill("rocket");
  await picker.getByRole("button", { name: "rocket ship launch", exact: true }).click();
  // The new emoji takes the replaced slot, and Reset appears once the choice differs.
  await expect(quick.getByRole("button").nth(1)).toHaveAccessibleName("Replace rocket ship launch");
  await expect(
    quick.getByRole("button", { name: "Reset quick reactions", exact: true }),
  ).toBeVisible();

  await visit(viewer, channel.id);
  await row.hover();
  await toolbar.getByRole("button", { name: "React with rocket ship launch", exact: true }).click();
  await expect(row.getByRole("button", { name: "🚀, 1 reaction", exact: true })).toBeVisible();
  await expect(
    toolbar.getByRole("button", { name: "React with thumbs up", exact: true }),
  ).toHaveCount(0);
});
