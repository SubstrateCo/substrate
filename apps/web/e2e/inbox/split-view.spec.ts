import { test } from "../test-support/inbox";
import { fieldNotesSubject } from "../test-support/inbox-seed";
import { captureScreenshot } from "../test-support/screenshots";
import { expect, type Locator } from "@playwright/test";

async function bounds(locator: Locator) {
  await expect(locator).toBeVisible();
  return (await locator.boundingBox())!;
}

test("resizing the open reader keeps senders, subjects and times aligned; replies have keyboard-operable disclosures", async ({
  inbox: page,
}) => {
  const list = page.getByRole("region", { name: "Messages", exact: true });
  const proof = list.getByRole("button", { name: /Atlas cover proofs/ });
  const notes = list.getByRole("button", { name: /Notes from ÉCOLE/ });
  await proof.click();
  const reader = page.getByRole("complementary", { name: "Message reader" });
  const divider = page.getByRole("separator", { name: "Resize message reader" });
  await expect(reader.getByRole("heading", { name: "Atlas cover proofs" })).toBeFocused();
  const right = (box: { x: number; width: number }) => box.x + box.width;
  for (const width of [540, 380, 320]) {
    const handle = await bounds(divider);
    const x = handle.x + handle.width / 2,
      y = handle.y + handle.height / 2;
    const current = (await bounds(list)).width;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + width - current, y, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => Math.abs((await bounds(list)).width - width)).toBeLessThan(3);
    const placements = [];
    for (const [row, title, sender] of [
      [proof, "Atlas cover proofs", "Mira Park"],
      [notes, fieldNotesSubject, "Fieldwork Exhibition Coordination"],
    ] as const) {
      const [checkbox, subject, from, time, tags] = await Promise.all([
        bounds(list.getByRole("checkbox", { name: new RegExp(`^Select conversation: ${title}`) })),
        bounds(row.getByTitle(title, { exact: true })),
        bounds(row.getByTitle(sender, { exact: true })),
        bounds(row.locator("time")),
        bounds(row.getByLabel("Labels", { exact: true })),
      ]);
      // Short and long rows start immediately beside the checkbox. A full-width subject
      // gets its own line, even when labels, thread counts and two mailbox addresses are present.
      expect(from.x - right(checkbox)).toBeGreaterThanOrEqual(0);
      expect(from.x - right(checkbox)).toBeLessThan(18);
      expect(Math.abs(from.x - subject.x)).toBeLessThan(2);
      expect(subject.width).toBeGreaterThan(width * 0.77);
      expect(subject.y).toBeGreaterThan(from.y);
      expect(tags.y).toBeGreaterThanOrEqual(subject.y + subject.height);
      expect(Math.abs(right(time) - right(subject))).toBeLessThan(2);
      placements.push({ start: from.x, end: right(time) });
    }
    expect(placements[0]).toEqual(placements[1]);
    expect(await list.evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
    await captureScreenshot(page, `inbox-split-${width}`);
  }
  const reply = reader.getByRole("button", { name: /Alex Rivera.*Sent/ });
  await expect(reply).toContainText("Show message");
  await reply.focus();
  await page.keyboard.press("Space");
  await expect(reply).toHaveAttribute("aria-expanded", "true");
  await expect(reply.getByText("Hide message")).toBeVisible();
  await expect(
    reader.getByText("I’ll compare the two proofs this afternoon.", { exact: true }).last(),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(reply).toHaveAttribute("aria-expanded", "false");
  await expect(reply.getByText("Show message")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(reader).toHaveCount(0);
  await expect(proof).toBeFocused();
  await list.getByRole("checkbox", { name: /^Select conversation: Atlas cover proofs/ }).check();
  await expect(
    page
      .getByRole("group", { name: "Conversation actions" })
      .getByRole("button", { name: "Move to Trash" }),
  ).toBeEnabled();
  await expect(reader).toHaveCount(0);
});
