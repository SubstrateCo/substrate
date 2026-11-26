import { conversation, test, visit } from "../test-support/fixtures";
import { captureScreenshot } from "../test-support/screenshots";
import { expect } from "@playwright/test";

test("expanded images fit the desktop, rotate, zoom, fade controls, and keep keyboard access", async ({
  actors,
  client,
}) => {
  const channel = await conversation(actors.sender);
  const sender = await client(actors.sender);
  const { page } = sender;
  await visit(sender, channel.id);
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1600;
    canvas.height = 900;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 1600, 900);
    gradient.addColorStop(0, "#254963");
    gradient.addColorStop(1, "#967f64");
    context.fillStyle = gradient;
    context.fillRect(0, 0, 1600, 900);
    context.fillStyle = "#ffffff";
    context.font = "64px sans-serif";
    context.fillText("Image viewer review", 100, 150);
    return canvas.toDataURL("image/png").split(",")[1]!;
  });
  const zone = page.getByRole("region", { name: "Message attachments", exact: true });
  await zone.getByLabel("Choose attachment files").setInputFiles([
    { name: "landscape.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") },
    { name: "second.png", mimeType: "image/png", buffer: Buffer.from(encoded, "base64") },
  ]);
  await expect(zone.getByText("Ready to attach", { exact: true })).toHaveCount(2);
  await zone.getByRole("button", { name: "Send", exact: true }).click();
  const launcher = page.getByRole("button", { name: "Preview landscape.png", exact: true });
  await launcher.click();
  const viewer = page.getByRole("dialog", { name: "landscape.png", exact: true });
  const image = viewer.getByRole("img", { name: "landscape.png", exact: true });
  await expect(image).toBeVisible();
  await expect(viewer.getByText("Image 1 of 2", { exact: false })).toBeVisible();
  await expect(viewer.locator("time")).toHaveCount(1);
  const viewport = page.viewportSize()!;
  await expect
    .poll(async () => {
      const bounds = await viewer.boundingBox();
      return (
        bounds && {
          left: bounds.x,
          top: bounds.y,
          right: bounds.x + bounds.width,
          bottom: bounds.y + bounds.height,
        }
      );
    })
    .toEqual({ left: 0, top: 0, right: viewport.width, bottom: viewport.height });
  const bounds = (await viewer.boundingBox())!;
  const imageBounds = (await image.boundingBox())!;
  expect(imageBounds.width).toBeGreaterThan(500);
  const originalDark = await page.evaluate(() =>
    document.documentElement.classList.contains("dark"),
  );
  try {
    for (const theme of ["light", "dark"]) {
      await page.evaluate((theme) => {
        document.documentElement.classList.toggle("dark", theme === "dark");
      }, theme);
      await expect(viewer).toHaveCSS("color-scheme", "dark");
      await expect(viewer).toHaveCSS("border-top-width", "0px");
      await expect(viewer).toHaveCSS("border-radius", "0px");
      await expect
        .poll(() =>
          viewer.evaluate((element) =>
            getComputedStyle(element).getPropertyValue("--tw-shadow").trim(),
          ),
        )
        .toBe("0 0 #0000");
      await expect(viewer.locator("header")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      await expect(viewer.locator("footer")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
      const backdrop = viewer.locator("[data-slot=image-viewer-backdrop]");
      await expect(backdrop).toHaveCSS("filter", "blur(64px)");
      await expect(backdrop).toHaveCSS("opacity", "0.6");
      await expect(backdrop.locator("img")).toHaveAttribute(
        "src",
        (await image.getAttribute("src"))!,
      );
      await expect(image).toBeVisible();
      await captureScreenshot(page, `expanded-message-image-viewer-${theme}`, { fullPage: false });
    }
  } finally {
    await page.evaluate(
      (dark) => document.documentElement.classList.toggle("dark", dark),
      originalDark,
    );
  }
  await viewer.getByRole("button", { name: "Rotate image", exact: true }).click();
  await expect(image).toHaveCSS("rotate", "90deg");
  await viewer.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "Reset zoom", exact: true })).toHaveText("150%");
  await viewer.getByRole("button", { name: "Zoom out", exact: true }).click();
  await expect(viewer.getByRole("button", { name: "Reset zoom", exact: true })).toHaveText("100%");
  await image.click();
  await image.hover();
  const header = viewer.locator("header");
  await expect(header).toHaveCSS("opacity", "0", { timeout: 6000 });
  await page.keyboard.press("Tab");
  await expect(header).toHaveCSS("opacity", "1");
  await expect(
    viewer.getByRole("button", { name: "Close image viewer", exact: true }),
  ).toBeFocused();
  await image.click();
  await image.hover();
  await expect(header).toHaveCSS("opacity", "0", { timeout: 6000 });
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + 30);
  await expect(header).toHaveCSS("opacity", "1");
  const download = page.waitForEvent("download");
  await viewer.getByRole("button", { name: "Download image", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("landscape.png");
  await viewer.getByRole("button", { name: "Next image", exact: true }).click();
  const next = page.getByRole("dialog", { name: "second.png", exact: true });
  await expect(next.getByRole("button", { name: "Reset zoom", exact: true })).toHaveText("100%");
  await page.keyboard.press("Escape");
  await expect(next).toHaveCount(0);
  await expect(launcher).toBeFocused();
});
