import { conversation, test, visit } from "../test-support/fixtures";
import { expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ reducedMotion: "reduce" });

test("message images open a keyboard-accessible viewer and disappear live on deletion", async ({
  actors,
  client,
}) => {
  test.setTimeout(60_000);
  const channel = await conversation(actors.sender, [actors.member.email]);
  const sender = await client(actors.sender);
  const member = await client(actors.member);
  await member.page.emulateMedia({ colorScheme: "dark" });
  await visit(sender, channel.id);
  await visit(member, channel.id);
  await expect(member.page.locator("html")).toHaveClass(/dark/);
  const encoded = await sender.page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 800;
    canvas.height = 450;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#eef2f6";
    ctx.fillRect(0, 0, 800, 450);
    ctx.fillStyle = "#172b3a";
    ctx.fillRect(0, 0, 180, 450);
    ctx.font = "bold 22px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("Launch plan", 24, 48);
    ctx.font = "16px sans-serif";
    ["Overview", "Designs", "Tasks", "Team"].forEach((label, i) =>
      ctx.fillText(label, 24, 112 + i * 44),
    );
    ctx.fillStyle = "#172b3a";
    ctx.font = "bold 30px sans-serif";
    ctx.fillText("Project overview", 216, 64);
    ["Design review", "Build prototype", "Share with team"].forEach((label, i) => {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(216, 104 + i * 96, 544, 72);
      ctx.fillStyle = "#172b3a";
      ctx.font = "20px sans-serif";
      ctx.fillText(label, 240, 148 + i * 96);
    });
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const zone = sender.page.getByRole("region", { name: "Message attachments", exact: true });
  await zone.getByLabel("Choose attachment files").setInputFiles([
    { name: "launch-dashboard.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") },
    { name: "dashboard-detail.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") },
    {
      name: "review-notes.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Please review the dashboard layout."),
    },
    { name: "broken-image.png", mimeType: "image/png", buffer: Buffer.from("Not really an image") },
  ]);
  await expect(zone.getByText("Ready to attach", { exact: true })).toHaveCount(4);
  await zone.getByRole("textbox").fill("Here are the latest dashboard designs. What do you think?");
  await zone.getByRole("button", { name: "Send", exact: true }).click();
  const thumbnail = member.page.getByRole("button", {
    name: "Preview launch-dashboard.png",
    exact: true,
  });
  await expect(thumbnail).toBeVisible();
  await expect
    .poll(() => thumbnail.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(
    member.page.getByRole("link", { name: "Download broken-image.png", exact: true }),
  ).toBeVisible();
  await expect(
    member.page.getByRole("link", { name: "Download review-notes.txt", exact: true }),
  ).toBeVisible();
  await expect(
    member.page
      .getByRole("list", { name: "Image attachments", exact: true })
      .getByText("launch-dashboard.png", { exact: true }),
  ).toHaveCount(0);
  await thumbnail.click();
  const viewer = member.page.getByRole("dialog");
  await expect(
    viewer.getByRole("heading", { name: "launch-dashboard.png", exact: true }),
  ).toBeVisible();
  const viewedImage = viewer.getByRole("img", { name: "launch-dashboard.png", exact: true });
  await expect(viewedImage).toBeVisible();
  await expect
    .poll(() => viewedImage.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  await expect(viewer.getByRole("button", { name: "Previous image", exact: true })).toBeVisible();
  await expect(viewer.getByRole("button", { name: "Next image", exact: true })).toBeVisible();
  const downloadButton = viewer.getByRole("button", {
    name: "Download image",
    exact: true,
  });
  await expect(downloadButton).toBeVisible();
  await expect(downloadButton).toHaveText("");
  const downloadBounds = await downloadButton.boundingBox();
  const closeBounds = await viewer
    .getByRole("button", { name: "Close image viewer", exact: true })
    .boundingBox();
  expect(downloadBounds).not.toBeNull();
  expect(closeBounds).not.toBeNull();
  expect(downloadBounds!.y).toBeGreaterThan(closeBounds!.y + closeBounds!.height);
  expect(downloadBounds!.x).toBeGreaterThan(member.page.viewportSize()!.width / 2);
  expect(downloadBounds!.height).toBe(closeBounds!.height);
  const downloadEvent = member.page.waitForEvent("download");
  await downloadButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe("launch-dashboard.png");
  expect(await readFile((await download.path())!)).toEqual(Buffer.from(encoded, "base64"));
  await viewedImage.click();
  await member.page.keyboard.press("ArrowRight");
  await expect(
    viewer.getByRole("heading", { name: "dashboard-detail.png", exact: true }),
  ).toBeVisible();
  await member.page.keyboard.press("ArrowLeft");
  await expect(
    viewer.getByRole("heading", { name: "launch-dashboard.png", exact: true }),
  ).toBeVisible();
  await member.page.keyboard.press("Escape");
  await expect(thumbnail).toBeFocused();
  await thumbnail.click();
  const message = sender.page
    .getByRole("article")
    .filter({ hasText: "Here are the latest dashboard designs." });
  await message.getByRole("button", { name: "More message actions", exact: true }).click();
  await sender.page.getByRole("menuitem", { name: "Delete message", exact: true }).click();
  await sender.page
    .getByRole("dialog", { name: "Delete message?", exact: true })
    .getByRole("button", { name: "Delete message", exact: true })
    .click();
  await expect(viewer).toHaveCount(0);
  await expect(thumbnail).toHaveCount(0);
});
