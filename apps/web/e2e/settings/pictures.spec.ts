import { provisionVerifiedAccount } from "../test-support/auth";
import { Mailpit } from "../test-support/mailpit";
import { provisionWorkspace } from "../test-support/organizations";
import { expect, test, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";

async function picture(page: Page, color: string) {
  const data = await page.evaluate((fill) => {
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const context = canvas.getContext("2d")!;
    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1]!;
  }, color);
  return { name: "picture.png", mimeType: "image/png", buffer: Buffer.from(data, "base64") };
}

test("cropped profile pictures and logos support retry, replacement, persistence, and removal", async ({
  page,
  request,
}) => {
  const suffix = randomUUID();
  await provisionVerifiedAccount(page, new Mailpit(request), {
    name: `Pictures ${suffix}`,
    email: `pictures-${suffix}@example.test`,
    password: `Password-${randomUUID()}!`,
  });
  await provisionWorkspace(page, `Pictures ${suffix}`, `pictures-${suffix}`);

  for (const kind of ["avatar", "organization-logo"] as const) {
    const isAvatar = kind === "avatar";
    const name = isAvatar ? "Profile picture" : "Organization logo";
    const title = isAvatar ? "Edit profile picture" : "Edit organization logo";
    await page.goto(isAvatar ? "/settings/user" : "/settings/organization");
    const control = page.getByRole("region", { name, exact: true });
    await control
      .getByLabel("Choose picture", { exact: true })
      .setInputFiles(await picture(page, "#2563eb"));
    const crop = page.getByRole("dialog", { name: title });
    await expect(crop).toBeVisible();
    if (isAvatar) {
      await crop.getByRole("slider", { name: "Zoom", exact: true }).fill("1.5");
    } else {
      await expect(
        crop.getByRole("button", { name: "Fit whole logo", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
    }
    await page.route(
      "**/api/v1/files/uploads",
      (route) =>
        route.fulfill({
          status: 403,
          json: {
            success: false,
            error: { code: "FORBIDDEN", message: "Picture updates are not allowed." },
          },
        }),
      { times: 1 },
    );
    await crop.getByRole("button", { name: "Save picture", exact: true }).click();
    await expect(crop.getByRole("alert")).toContainText("Your crop is still here");
    if (isAvatar)
      await expect(crop.getByRole("slider", { name: "Zoom", exact: true })).toHaveValue("1.5");
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    await page.route(
      "**/api/v1/files/uploads",
      async (route) => {
        started.resolve();
        await release.promise;
        await route.abort();
      },
      { times: 1 },
    );
    await crop.getByRole("button", { name: "Save picture", exact: true }).click();
    await started.promise;
    await crop.getByRole("button", { name: "Cancel upload", exact: true }).click();
    release.resolve();
    await expect(crop.getByRole("alert")).toContainText(
      "Upload cancelled. Your crop is still here.",
    );
    if (isAvatar)
      await expect(crop.getByRole("slider", { name: "Zoom", exact: true })).toHaveValue("1.5");
    const initialized = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === "/api/v1/files/uploads" &&
        response.request().method() === "POST",
    );
    const contentLoaded = Promise.race([
      page.waitForResponse(
        (response) => {
          let source = response.request();
          while (source.redirectedFrom()) source = source.redirectedFrom()!;
          return (
            /\/api\/v1\/files\/[^/]+\/content$/.test(new URL(source.url()).pathname) &&
            (response.status() < 300 || response.status() >= 400)
          );
        },
        { timeout: 15_000 },
      ),
      page
        .waitForEvent("requestfailed", {
          predicate: (request) => request.resourceType() === "image",
          timeout: 15_000,
        })
        .then((request) => {
          throw new Error(
            `Picture request failed (${new URL(request.url()).origin}): ${request.failure()?.errorText}`,
          );
        }),
    ]).catch((error: Error) => error);
    await crop.getByRole("button", { name: "Save picture", exact: true }).click();
    const initialization = await initialized;
    if (!initialization.ok()) {
      throw new Error(
        `Upload initialization failed (${initialization.status()}): ${await initialization.text()}`,
      );
    }
    await expect(crop).toBeHidden();
    const content = await contentLoaded;
    if (content instanceof Error) throw content;
    if (!content.ok()) {
      throw new Error(`Picture content failed (${content.status()}): ${await content.text()}`);
    }
    const image = control.getByRole("img", { name, exact: true });
    await expect(image).toHaveAttribute("src", /^\/api\/v1\/files\/[^/]+\/content$/);
    const original = await image.getAttribute("src");
    await expect(image).toBeVisible();
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth === 512 && element.naturalHeight === 512,
        ),
      )
      .toBe(true);

    await control
      .getByLabel("Replace picture", { exact: true })
      .setInputFiles(await picture(page, "#dc2626"));
    await crop.getByRole("button", { name: "Save picture", exact: true }).click();
    await expect(crop).toBeHidden();
    await expect(image).not.toHaveAttribute("src", original!);
    const replacement = await image.getAttribute("src");
    await page.reload();
    await expect(image).toHaveAttribute("src", replacement!);
    await control.getByRole("button", { name: "Remove picture", exact: true }).click();
    await expect(image).toHaveCount(0);
    await page.reload();
    await expect(
      control.getByRole("button", { name: "Choose picture", exact: true }),
    ).toBeVisible();
    await expect(image).toHaveCount(0);
  }
});
