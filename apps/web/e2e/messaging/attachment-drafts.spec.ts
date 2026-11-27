import { conversation, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";

declare global {
  interface Window {
    revokedAttachmentUrls: string[];
  }
}

test("pending images show local previews, keep file fallbacks, and release previews on removal and send", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL.bind(URL);
    const revoked: string[] = [];
    Object.assign(window, { revokedAttachmentUrls: revoked });
    URL.revokeObjectURL = (url) => {
      revoked.push(url);
      revoke(url);
    };
  });
  await visit(sender, channel.id);
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#1f3b57";
    context.fillRect(0, 0, 640, 360);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const zone = page.getByRole("region", { name: "Message attachments", exact: true });
  await zone.getByLabel("Choose attachment files").setInputFiles([
    { name: "screenshot.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") },
    { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("Review notes") },
    { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("Not an image") },
  ]);
  const drafts = zone.getByRole("list", { name: "Selected attachments", exact: true });
  const preview = drafts.getByRole("img", { name: "Preview of screenshot.png", exact: true });
  await expect(preview).toBeVisible();
  await expect
    .poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBe(640);
  await expect(drafts.getByRole("img")).toHaveCount(1);
  await expect(drafts.getByText("notes.txt", { exact: true })).toBeVisible();
  await expect(drafts.getByText("broken.png", { exact: true })).toBeVisible();
  await expect(drafts.getByText("Ready to attach", { exact: true })).toHaveCount(3);
  await captureScreenshot(page, "composer-image-attachment-previews", { fullPage: false });
  const removedUrl = (await preview.getAttribute("src"))!;
  expect(removedUrl).toMatch(/^blob:/);
  await drafts.getByRole("button", { name: "Remove screenshot.png", exact: true }).click();
  await expect(preview).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.revokedAttachmentUrls)).toContain(removedUrl);

  await zone.getByLabel("Choose attachment files").setInputFiles({
    name: "send.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  const sentPreview = drafts.getByRole("img", { name: "Preview of send.png", exact: true });
  await expect(sentPreview).toBeVisible();
  const sentUrl = (await sentPreview.getAttribute("src"))!;
  await expect(drafts.getByText("Ready to attach", { exact: true })).toHaveCount(3);
  await zone.getByRole("button", { name: "Send", exact: true }).click();
  await expect(drafts).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.revokedAttachmentUrls)).toContain(sentUrl);
  await expect(page.getByRole("button", { name: "Preview send.png", exact: true })).toBeVisible();
});

test("an image preview remains available when its upload fails and is retried", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  await page.route("**/api/v1/files/uploads/*/complete", (route) => route.abort());
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 40;
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const zone = page.getByRole("region", { name: "Message attachments", exact: true });
  await zone.getByLabel("Choose attachment files").setInputFiles({
    name: "retry.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
  const preview = zone.getByRole("img", { name: "Preview of retry.png", exact: true });
  await expect(preview).toBeVisible();
  const url = await preview.getAttribute("src");
  await expect(zone.getByText("Upload failed. Try again.", { exact: true })).toBeVisible();
  await expect(zone.getByRole("button", { name: "Send", exact: true })).toBeDisabled();
  await page.unroute("**/api/v1/files/uploads/*/complete");
  await zone.getByRole("button", { name: "Retry retry.png", exact: true }).click();
  await expect(zone.getByText("Ready to attach", { exact: true })).toBeVisible();
  await expect(preview).toHaveAttribute("src", url!);
  await zone.getByRole("button", { name: "Remove retry.png", exact: true }).click();
  await expect(zone.getByRole("list", { name: "Selected attachments", exact: true })).toHaveCount(
    0,
  );
});
