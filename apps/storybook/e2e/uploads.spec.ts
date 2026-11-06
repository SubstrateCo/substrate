import { expect, test, type Page } from "@playwright/test";

async function picture(page: Page, name = "source.png") {
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 60;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "red";
    context.fillRect(0, 0, 60, 60);
    context.fillStyle = "blue";
    context.fillRect(60, 0, 60, 60);
    return Array.from(
      Uint8Array.from(atob(canvas.toDataURL("image/png").split(",")[1]!), (value) =>
        value.charCodeAt(0),
      ),
    );
  });
  await page
    .getByLabel(/Choose picture|Replace picture/, { exact: true })
    .setInputFiles({ name, mimeType: "image/png", buffer: Buffer.from(bytes) });
  await expect(page.getByRole("dialog")).toBeVisible();
}

async function savedPixels(page: Page, alt: string) {
  const image = page.getByRole("img", { name: alt, exact: true });
  await expect(image).toBeVisible();
  return image.evaluate(async (element) => {
    // SAFETY: The image role with this exact accessible name selects the saved img preview.
    const image = element as HTMLImageElement;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      corner: Array.from(context.getImageData(1, 1, 1, 1).data),
      top: Array.from(context.getImageData(256, 128, 1, 1).data),
      bottom: Array.from(context.getImageData(256, 384, 1, 1).data),
    };
  });
}

test("phone JPEG orientation is applied before transparent logo fitting", async ({ page }) => {
  await page.goto("/iframe.html?id=components-uploads--organization-logo&viewMode=story");
  const bytes = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120;
    canvas.height = 60;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "red";
    context.fillRect(0, 0, 60, 60);
    context.fillStyle = "blue";
    context.fillRect(60, 0, 60, 60);
    const jpeg = Uint8Array.from(atob(canvas.toDataURL("image/jpeg", 1).split(",")[1]!), (value) =>
      value.charCodeAt(0),
    );
    // A single little-endian EXIF orientation tag: 6 means rotate 90 degrees clockwise.
    const exif = [
      255, 225, 0, 34, 69, 120, 105, 102, 0, 0, 73, 73, 42, 0, 8, 0, 0, 0, 1, 0, 18, 1, 3, 0, 1, 0,
      0, 0, 6, 0, 0, 0, 0, 0, 0, 0,
    ];
    return [255, 216, ...exif, ...jpeg.slice(2)];
  });
  await page
    .getByLabel("Choose picture", { exact: true })
    .setInputFiles({ name: "phone.jpg", mimeType: "image/jpeg", buffer: Buffer.from(bytes) });
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("status")).toHaveText("Picture saved.");
  const output = await savedPixels(page, "Organization logo");
  expect(output.corner[3]).toBe(0);
  expect(output.top[0]).toBeGreaterThan(240);
  expect(output.top[2]).toBeLessThan(15);
  expect(output.bottom[2]).toBeGreaterThan(240);
  expect(output.bottom[0]).toBeLessThan(15);
});

test("file selection validates type and size while preserving selected files", async ({ page }) => {
  await page.goto("/iframe.html?id=components-uploads--file-selection&viewMode=story");
  const input = page.getByLabel("Choose files", { exact: true });
  await input.setInputFiles({
    name: "brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("keep me"),
  });
  await expect(page.getByRole("list", { name: "Selected files" })).toContainText("brief.txt");
  await input.setInputFiles({
    name: "unsafe.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("svg"),
  });
  await expect(page.getByRole("alert")).toHaveText("This file type is not supported.");
  await expect(page.getByRole("list", { name: "Selected files" })).toContainText("brief.txt");
  await input.setInputFiles({
    name: "large.txt",
    mimeType: "text/plain",
    buffer: Buffer.alloc(1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("1 MB");
  await input.setInputFiles({
    name: "brief.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("keep me"),
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("generic dropzone accepts dropped files and disabled controls do not select", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=components-uploads--file-selection&viewMode=story");
  const data = await page.evaluateHandle(() => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(["notes"], "notes.txt", { type: "text/plain" }));
    return transfer;
  });
  await page
    .getByText("Text or PDF files, up to 1 MB each.")
    .dispatchEvent("drop", { dataTransfer: data });
  await expect(page.getByRole("list", { name: "Selected files" })).toContainText("notes.txt");
  await page.goto("/iframe.html?id=components-uploads--disabled-files&viewMode=story");
  await expect(page.getByRole("button", { name: "Choose files" })).toBeDisabled();
});

test("avatar crop can rotate, zoom, reset, cancel, and export an opaque square", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=components-uploads--avatar&viewMode=story");
  await picture(page);
  const zoom = page.getByRole("slider", { name: "Zoom" });
  await zoom.fill("2");
  await page.getByRole("button", { name: "Rotate 90°" }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(zoom).toHaveValue("1");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Profile picture", exact: true })).toHaveCount(0);
  await picture(page);
  await page.getByRole("button", { name: "Rotate 90°" }).click();
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("status")).toHaveText("Picture saved.");
  const output = await savedPixels(page, "Profile picture");
  expect(output.width).toBe(512);
  expect(output.height).toBe(512);
  expect(output.corner[3]).toBe(255);
  expect(output.top).toEqual([255, 0, 0, 255]);
  expect(output.bottom).toEqual([0, 0, 255, 255]);
});

test("logo fit retains transparent padding; fill controls and remove stay available", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=components-uploads--organization-logo&viewMode=story");
  await picture(page);
  await expect(page.getByRole("button", { name: "Fit whole logo" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("slider", { name: "Zoom" })).toBeDisabled();
  await page.getByRole("button", { name: "Fill square" }).click();
  await expect(page.getByRole("slider", { name: "Zoom" })).toBeEnabled();
  await page.getByRole("button", { name: "Fit whole logo" }).click();
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("status")).toHaveText("Picture saved.");
  const output = await savedPixels(page, "Organization logo");
  expect(output.width).toBe(512);
  expect(output.height).toBe(512);
  expect(output.corner[3]).toBe(0);
  await page.getByRole("button", { name: "Remove picture" }).click();
  await expect(page.getByRole("img", { name: "Organization logo", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Choose picture" })).toBeEnabled();
});

test("upload failure hides internal errors and preserves crop settings for retry", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=components-uploads--upload-retry&viewMode=story");
  await picture(page);
  await page.getByRole("slider", { name: "Zoom" }).fill("1.5");
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "We couldn’t save this picture. Your crop is still here. Please try again.",
  );
  await expect(page.getByRole("slider", { name: "Zoom" })).toHaveValue("1.5");
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("status")).toHaveText("Picture saved.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("cancellation stops upload and preserves the crop for a retry", async ({ page }) => {
  await page.goto("/iframe.html?id=components-uploads--upload-cancellation&viewMode=story");
  await picture(page);
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("progressbar", { name: "Uploading picture" })).toBeVisible();
  await page.getByRole("button", { name: "Cancel upload", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Upload cancelled. Your crop is still here.");
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("status")).toHaveText("Picture saved.");
});

test("final attachment cannot be cancelled and successful attachment closes the dialog", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=components-uploads--committing-picture&viewMode=story");
  await picture(page);
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByRole("status")).toHaveText("Finishing picture…");
  await expect(page.getByRole("button", { name: "Cancel upload", exact: true })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Picture saved.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("invalid picture bytes report safe errors without opening the crop dialog", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=components-uploads--avatar&viewMode=story");
  await page.getByLabel("Choose picture", { exact: true }).setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("not an image"),
  });
  await expect(page.getByRole("alert")).toContainText("This image could not be opened.");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await picture(page);
});

test("upload items expose retry and cancellation", async ({ page }) => {
  await page.goto("/iframe.html?id=components-uploads--item-retry&viewMode=story");
  await expect(page.getByRole("alert")).toContainText("Upload failed");
  await page.getByRole("button", { name: "Retry upload of proposal.pdf" }).click();
  await expect(page.getByRole("progressbar", { name: "Uploading proposal.pdf" })).toHaveAttribute(
    "value",
    "42",
  );
  await page.getByRole("button", { name: "Cancel upload of proposal.pdf" }).click();
  await expect(page.getByRole("status")).toHaveText("Upload cancelled.");
  await expect(page.getByRole("button", { name: "Retry upload of proposal.pdf" })).toBeEnabled();
});

for (const theme of ["light", "dark"]) {
  test(`crop dialog fits a narrow desktop window in ${theme} mode`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto(
      `/iframe.html?id=components-uploads--organization-logo&viewMode=story&globals=theme:${theme}`,
    );
    await picture(page);
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
    await expect(page.getByRole("button", { name: "Save picture" })).toBeInViewport();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
}
