import { test } from "../test-support/fixture.js";
import { expect, type Page } from "@playwright/test";

async function picture(page: Page, color: string) {
  const data = await page.evaluate((fill) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.fillStyle = fill;
    context.fillRect(0, 0, 320, 180);
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, color);
  return { name: "picture.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}

test("picture retries and cancellation preserve the crop, and replacement survives reload", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const { page } = desktop;
  for (const kind of ["avatar", "organization-logo"] as const) {
    const isAvatar = kind === "avatar";
    const name = isAvatar ? "Profile picture" : "Organization logo";
    await desktop.openPath(isAvatar ? "/settings/user" : "/settings/organization");
    const control = page.getByRole("region", { name, exact: true });
    await control.locator('input[type="file"]').setInputFiles(await picture(page, "#2563eb"));
    const crop = page.getByRole("dialog", { name: `Edit ${name.toLowerCase()}`, exact: true });
    if (isAvatar) await crop.getByRole("slider", { name: "Zoom", exact: true }).press("End");
    const failure = await page.evaluateHandle(() => {
      const original = window.fetch;
      let attempt = 0;
      let held = false;
      let release: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      window.fetch = Object.assign(async (...args: Parameters<typeof fetch>) => {
        const input = args[0];
        const url = new URL(input instanceof Request ? input.url : String(input), location.href);
        if (url.pathname === "/api/v1/files/uploads") {
          attempt++;
          if (attempt === 1)
            return Response.json(
              {
                success: false,
                error: { code: "FORBIDDEN", message: "Picture updates are not allowed." },
              },
              { status: 403 },
            );
          if (attempt === 2) {
            held = true;
            await gate;
          }
        }
        return original(...args);
      }, original);
      return {
        held: () => held,
        release: () => release(),
        restore: () => {
          release();
          window.fetch = original;
        },
      };
    });
    try {
      await crop.getByRole("button", { name: "Save picture", exact: true }).click();
      await expect(crop.getByRole("alert")).toContainText("Your crop is still here");
      if (isAvatar)
        await expect(crop.getByRole("slider", { name: "Zoom", exact: true })).toHaveAttribute(
          "aria-valuenow",
          "3",
        );
      await crop.getByRole("button", { name: "Save picture", exact: true }).click();
      await expect.poll(() => failure.evaluate((control) => control.held())).toBe(true);
      await crop.getByRole("button", { name: "Cancel upload", exact: true }).click();
      await failure.evaluate((control) => control.release());
      await expect(crop.getByRole("alert")).toContainText(
        "Upload cancelled. Your crop is still here.",
      );
      if (isAvatar)
        await expect(crop.getByRole("slider", { name: "Zoom", exact: true })).toHaveAttribute(
          "aria-valuenow",
          "3",
        );
    } finally {
      await failure.evaluate((control) => control.restore());
      await failure.dispose();
    }
    await crop.getByRole("button", { name: "Save picture", exact: true }).click();
    await expect(crop).toBeHidden();
    const image = control.getByRole("img", { name, exact: true });
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth === 512 && element.naturalHeight === 512,
        ),
      )
      .toBe(true);
    const original = await image.getAttribute("src");
    await control.locator('input[type="file"]').setInputFiles(await picture(page, "#dc2626"));
    await crop.getByRole("button", { name: "Save picture", exact: true }).click();
    await expect(crop).toBeHidden();
    await expect(image).not.toHaveAttribute("src", original!);
    const replacement = await image.getAttribute("src");
    await page.reload();
    await expect(image).toHaveAttribute("src", replacement!);
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) => element.complete && element.naturalWidth === 512,
        ),
      )
      .toBe(true);
  }
});
