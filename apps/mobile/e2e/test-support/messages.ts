import { expect, type Page } from "@playwright/test";

export const sourceBody = "The mobile launch checklist is ready for review.";

export async function openMessageActions(page: Page, messageId: string, body = sourceBody) {
  const message = page.getByTestId(`message-${messageId}`);
  await message.getByText(body, { exact: true }).click({ delay: 400 });
  const edit = page.getByRole("button", { name: "Edit message", exact: true });
  if (!(await edit.isVisible())) {
    await message.hover();
    await message.getByRole("button", { name: /^More actions for message from / }).click();
  }
  await expect(edit).toBeVisible();
}
