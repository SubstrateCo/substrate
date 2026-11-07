import { provisionVerifiedAccount } from "../../../web/e2e/test-support/auth.js";
import { Mailpit } from "../../../web/e2e/test-support/mailpit.js";
import { applicationURL } from "../../src/shell/navigation.js";
import { authorizationCallback, requestBrowserSignIn } from "../test-support/auth.js";
import { _electron as electron, expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

test("source desktop saves rotated avatars and logos, reloads them, and removes them", async ({
  browser,
  request,
}) => {
  test.skip(
    Boolean(process.env.DESKTOP_EXECUTABLE_PATH),
    "This test launches the source app without a build.",
  );
  test.setTimeout(120_000);
  const context = await browser.newContext({ baseURL: applicationURL });
  const authorization = await context.newPage();
  const suffix = randomUUID();
  await provisionVerifiedAccount(authorization, new Mailpit(request), {
    name: "Desktop Pictures",
    email: `desktop-pictures-${suffix}@example.test`,
    password: `Password-${randomUUID()}!`,
  });
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key !== "ELECTRON_RUN_AS_NODE" && value !== undefined) env[key] = value;
  }
  env.STARTUP_OS_TEST_ID = suffix;
  env.STARTUP_OS_STORAGE_ORIGINS =
    process.env.STARTUP_OS_STORAGE_ORIGINS ?? "http://localhost:4566";
  const source = fileURLToPath(new URL("../../src/main.js", import.meta.url));
  const desktop = await electron.launch({ args: [source, "--desktop-smoke-test"], env });
  try {
    const page = await desktop.firstWindow();
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
    await requestBrowserSignIn(desktop, page, authorization);
    const callback = await authorizationCallback(authorization, () =>
      authorization.getByRole("button", { name: "Continue to Startup OS", exact: true }).click(),
    );
    const executable = await desktop.evaluate(() => process.execPath);
    try {
      await promisify(execFile)(executable, [source, "--desktop-smoke-test", callback], {
        env,
        timeout: 15_000,
      });
    } catch {
      // Child-process errors contain argv. Do not expose the credential-bearing callback.
      throw new Error("The desktop authorization callback failed.");
    }
    await expect(page.getByRole("heading", { name: "Your workspaces", exact: true })).toBeVisible();
    await page.getByLabel("Workspace name", { exact: true }).fill(`Pictures ${suffix}`);
    await page.getByLabel("Workspace slug", { exact: true }).fill(`pictures-${suffix}`);
    await page.getByRole("button", { name: "Create workspace", exact: true }).click();
    await expect(page.getByRole("button", { name: /^Signed in as / })).toBeVisible();
    for (const kind of ["avatar", "organization-logo"] as const) {
      const isAvatar = kind === "avatar";
      const name = isAvatar ? "Profile picture" : "Organization logo";
      const title = isAvatar ? "Edit profile picture" : "Edit organization logo";
      await page.goto(`${applicationURL}/settings/${isAvatar ? "user" : "organization"}`);
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
      await control.getByLabel("Choose picture", { exact: true }).setInputFiles({
        name: `desktop-${kind}.png`,
        mimeType: "image/png",
        buffer: Buffer.from(data, "base64"),
      });
      const crop = page.getByRole("dialog", { name: title, exact: true });
      await expect(crop).toBeVisible();
      if (isAvatar) {
        await crop.getByRole("slider", { name: "Zoom", exact: true }).fill("1.5");
      } else {
        await expect(
          crop.getByRole("button", { name: "Fit whole logo", exact: true }),
        ).toHaveAttribute("aria-pressed", "true");
        await expect(crop.getByRole("slider", { name: "Zoom", exact: true })).toBeDisabled();
      }
      await crop.getByRole("button", { name: "Rotate 90°", exact: true }).click();
      const put = page.waitForResponse(
        (response) =>
          response.request().method() === "PUT" &&
          new URL(response.url()).origin !== applicationURL,
      );
      await crop.getByRole("button", { name: "Save picture", exact: true }).click();
      // Observe upload failures immediately so a failed UI assertion cannot leave
      // a pending event waiter to reject after the test has finished.
      const stored = put.then(
        async (response) => {
          const headers = await response.request().allHeaders();
          return {
            ok: response.ok(),
            cookie: Boolean(headers.cookie),
            authorization: Boolean(headers.authorization),
          };
        },
        () => undefined,
      );
      await expect(crop)
        .toBeHidden()
        .catch(async () => {
          throw new Error(
            `Picture save did not complete: ${await crop.innerText()}\n${uploadDiagnostics.join("\n")}`,
          );
        });
      expect(
        await stored,
        "The renderer uploads directly to signed storage without cookies or auth headers",
      ).toEqual({ ok: true, cookie: false, authorization: false });
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
      await control.getByRole("button", { name: "Remove picture", exact: true }).click();
      await expect(image).toHaveCount(0);
      await page.reload();
      await expect(
        control.getByRole("button", { name: "Choose picture", exact: true }),
      ).toBeVisible();
      await expect(image).toHaveCount(0);
    }
  } finally {
    await desktop.close();
    await context.close();
  }
});
