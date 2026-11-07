import { test } from "../test-support/fixture.js";
import { expect } from "@playwright/test";

test("desktop saves rotated avatars and logos without storage credentials, reloads them, and removes them", async ({
  desktop,
}) => {
  test.setTimeout(120_000);
  await desktop.provision();
  const page = desktop.page;
  const userMenu = page.getByRole("button", {
    name: `Signed in as ${desktop.owner.name}`,
    exact: true,
  });
  await expect(userMenu).toHaveText("DE");
  await userMenu.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "User settings", exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(userMenu).toBeFocused();
  const uploads = await desktop.app.evaluateHandle(({ session }) => {
    const transfers: { id: number; cookie: boolean; authorization: boolean; ok: boolean }[] = [];
    const requests = session.fromPartition("startup-os-smoke-test").webRequest;
    requests.onBeforeSendHeaders((details, callback) => {
      if (details.method === "PUT") {
        const headers = Object.keys(details.requestHeaders).map((name) => name.toLowerCase());
        transfers.push({
          id: details.id,
          cookie: headers.includes("cookie"),
          authorization: headers.includes("authorization"),
          ok: false,
        });
      }
      callback({ requestHeaders: details.requestHeaders });
    });
    requests.onCompleted((details) => {
      const transfer = transfers.find((item) => item.id === details.id);
      if (transfer) transfer.ok = details.statusCode >= 200 && details.statusCode < 300;
    });
    return transfers;
  });
  const uploadDiagnostics: string[] = [];
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.pathname.startsWith("/api/v1/files/") || response.request().method() === "PUT")
      uploadDiagnostics.push(
        `${response.request().method()} ${url.origin}${url.pathname}: ${response.status()}`,
      );
  });
  page.on("requestfailed", (request) => {
    uploadDiagnostics.push(
      `${request.method()} ${new URL(request.url()).pathname} failed: ${request.failure()?.errorText}`,
    );
  });
  for (const kind of ["avatar", "organization-logo"] as const) {
    const isAvatar = kind === "avatar";
    const name = isAvatar ? "Profile picture" : "Organization logo";
    const title = isAvatar ? "Edit profile picture" : "Edit organization logo";
    await desktop.openPath(`/settings/${isAvatar ? "user" : "organization"}`);
    const control = page.getByRole("region", { name, exact: true });
    const data = await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 180;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "#2563eb";
      context.fillRect(0, 0, 320, 180);
      context.fillStyle = "#dc2626";
      context.fillRect(0, 0, 160, 180);
      return canvas.toDataURL("image/png").split(",")[1]!;
    });
    await control.locator('input[type="file"]').setInputFiles({
      name: `desktop-${kind}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(data, "base64"),
    });
    const crop = page.getByRole("dialog", { name: title, exact: true });
    await expect(crop).toBeVisible();
    if (isAvatar) {
      await crop.getByRole("slider", { name: "Zoom", exact: true }).press("End");
    } else {
      await expect(
        crop.getByRole("button", { name: "Fit whole logo", exact: true }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(crop.getByRole("slider", { name: "Zoom", exact: true })).toBeDisabled();
    }
    await crop.getByRole("button", { name: "Rotate 90°", exact: true }).click();
    const before = (await uploads.jsonValue()).length;
    const releaseUpload = Promise.withResolvers<void>();
    await page.route(
      "**/api/v1/files/uploads",
      async (route) => {
        await releaseUpload.promise;
        await route.continue();
      },
      { times: 1 },
    );
    await crop.getByRole("button", { name: "Save picture", exact: true }).click();
    try {
      const progress = crop.getByRole("progressbar", { name: "Uploading picture", exact: true });
      await expect(progress).toBeVisible();
      await expect(progress).not.toHaveAttribute("value");
      await expect(crop.getByRole("button", { name: "Save picture", exact: true })).toBeDisabled();
      await expect(crop.getByRole("button", { name: "Cancel upload", exact: true })).toBeEnabled();
    } finally {
      releaseUpload.resolve();
    }
    await expect(crop)
      .toBeHidden()
      .catch(async () => {
        throw new Error(
          `Picture save did not complete: ${await crop.innerText()}\n${uploadDiagnostics.join("\n")}`,
        );
      });
    await expect
      .poll(
        async () => {
          const stored = (await uploads.jsonValue()).slice(before);
          return (
            stored.length > 0 &&
            stored.every((transfer) => transfer.ok && !transfer.cookie && !transfer.authorization)
          );
        },
        { message: "Storage uploads succeed without cookies or authorization headers" },
      )
      .toBe(true);
    const image = control.getByRole("img", { name, exact: true });
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) =>
            element.complete && element.naturalWidth === 512 && element.naturalHeight === 512,
        ),
      )
      .toBe(true)
      .catch(() => {
        throw new Error(`Saved image did not render.\n${uploadDiagnostics.join("\n")}`);
      });
    const saved = await image.getAttribute("src");
    expect(saved).toMatch(/^\/api\/v1\/files\/[^/]+\/content$/);
    if (isAvatar) await expect(userMenu.locator("img")).toHaveAttribute("src", saved!);
    const pixels = await page.evaluate(async (url) => {
      const blob = await (await fetch(url!)).blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 512;
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      return {
        halves: [128, 384].map((y) => [...context.getImageData(256, y, 1, 1).data]),
        cornerAlpha: context.getImageData(0, 0, 1, 1).data[3],
      };
    }, saved);
    // The input's left/right halves become top/bottom after a clockwise rotation.
    // The server normalizes pictures to WebP, so compare dominant channels,
    // not exact PNG bytes or compression-specific color values.
    expect(pixels.halves[0]![0]! - pixels.halves[0]![2]!).toBeGreaterThan(100);
    expect(pixels.halves[1]![2]! - pixels.halves[1]![0]!).toBeGreaterThan(100);
    if (!isAvatar) expect(pixels.cornerAlpha, "Fit preserves transparent logo padding").toBe(0);
    await page.reload();
    await expect(image).toHaveAttribute("src", saved!);
    await expect
      .poll(() =>
        image.evaluate(
          (element: HTMLImageElement) => element.complete && element.naturalWidth === 512,
        ),
      )
      .toBe(true);
    if (isAvatar) {
      const imageURL = `**${saved}`;
      await page.route(imageURL, (route) => route.fulfill({ status: 404, body: "" }));
      await page.reload();
      await expect(userMenu).toHaveText("DE");
      await expect(
        control.getByLabel("Profile picture unavailable", { exact: true }),
      ).toBeVisible();
      await page.unroute(imageURL);
      await page.reload();
      await expect(image).toHaveAttribute("src", saved!);
      await expect(userMenu.locator("img")).toHaveAttribute("src", saved!);
    }
    await control.getByRole("button", { name: "Remove picture", exact: true }).click();
    await expect(image).toHaveCount(0);
    if (isAvatar) await expect(userMenu).toHaveText("DE");
    await page.reload();
    await expect(
      control.getByRole("button", { name: "Choose picture", exact: true }),
    ).toBeVisible();
    await expect(image).toHaveCount(0);
  }
});
