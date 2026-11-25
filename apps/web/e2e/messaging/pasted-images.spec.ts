import { conversation, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("a pasted screenshot sends as an image that can be copied and downloaded from its menu", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender, [actors.member.email]);
  const sender = await client(actors.sender);
  await sender.page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await visit(sender, channel.id);
  const zone = sender.page.getByRole("region", { name: "Message attachments", exact: true });
  const editor = zone.getByRole("textbox");
  await editor.click();
  const encoded = await editor.evaluate((element) => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#1f3b57";
    context.fillRect(0, 0, 640, 360);
    context.fillStyle = "#ffffff";
    context.font = "bold 36px sans-serif";
    context.fillText("Q4 roadmap", 40, 80);
    const data = canvas.toDataURL("image/png").split(",")[1]!;
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const clipboard = new DataTransfer();
    clipboard.items.add(new File([bytes], "image.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
    return data;
  });
  await expect(zone.getByText("Ready to attach", { exact: true })).toHaveCount(1);
  await expect(editor).toHaveText("");
  await editor.fill("Pasted the roadmap screenshot.");
  await editor.press("Enter");

  const thumbnail = sender.page.getByRole("button", { name: /^Preview Pasted image .+\.png$/ });
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() => thumbnail.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);

  await thumbnail.click({ button: "right" });
  const menu = sender.page.getByRole("menu");
  await expect(menu.getByRole("menuitem")).toHaveText([
    "Open image",
    "Copy image",
    "Download image",
  ]);
  await menu.getByRole("menuitem", { name: "Copy image", exact: true }).click();
  await expect(sender.page.getByText("Image copied", { exact: true })).toBeVisible();
  const copiedTypes = await sender.page.evaluate(async () =>
    (await navigator.clipboard.read()).flatMap((item) => item.types),
  );
  expect(copiedTypes).toContain("image/png");

  await thumbnail.click({ button: "right" });
  const downloadEvent = sender.page.waitForEvent("download");
  await menu.getByRole("menuitem", { name: "Download image", exact: true }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^Pasted image .+\.png$/);
  expect(await readFile((await download.path())!)).toEqual(Buffer.from(encoded, "base64"));
});

test("pasting text with an image attached by the source app pastes only the text", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  await visit(sender, channel.id);
  const zone = sender.page.getByRole("region", { name: "Message attachments", exact: true });
  const editor = zone.getByRole("textbox");
  await editor.click();
  await editor.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData("text/plain", "Revenue grew 12%");
    clipboard.items.add(new File([new Uint8Array(8)], "image.png", { type: "image/png" }));
    element.dispatchEvent(
      new ClipboardEvent("paste", { clipboardData: clipboard, bubbles: true, cancelable: true }),
    );
  });
  await expect(editor).toHaveText("Revenue grew 12%");
  await expect(zone.getByText("Ready to attach", { exact: true })).toHaveCount(0);
});
