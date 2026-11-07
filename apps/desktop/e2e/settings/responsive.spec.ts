import { test } from "../test-support/fixture.js";
import { fitsWindow, resize } from "../test-support/layout.js";
import { expect } from "@playwright/test";

for (const size of [
  { width: 1024, height: 768 },
  { width: 700, height: 768 },
  { width: 320, height: 568 },
]) {
  test(
    `invitation rows, pagination and picture dialogs fit ${size.width}x${size.height}`,
    { tag: "@layout" },
    async ({ desktop }) => {
      await desktop.provision();
      const { page } = desktop;
      const organizationResponse = await desktop.browser.request.get(
        "/api/auth/organization/get-full-organization",
      );
      expect(organizationResponse.ok()).toBe(true);
      const organization: { id: string } = await organizationResponse.json();
      for (let index = 0; index < 11; index++) {
        const response = await desktop.browser.request.post(
          "/api/auth/organization/invite-member",
          {
            headers: { origin: desktop.rendererOrigin },
            data: {
              organizationId: organization.id,
              email: `layout-${index}-${desktop.suffix}@example.test`,
              role: "member",
            },
          },
        );
        expect(response.ok(), "Seed enough invitations to display pagination").toBe(true);
      }
      await desktop.openPath("/settings/organization");
      await resize(desktop, size.width, size.height);
      await page.getByRole("tab", { name: "Invitations", exact: true }).click();
      await fitsWindow(page.getByRole("button", { name: "Send invitation", exact: true }));
      await page.getByRole("combobox", { name: "Role", exact: true }).click();
      await fitsWindow(page.getByRole("option", { name: "Admin", exact: true }));
      await page.keyboard.press("Escape");
      const invitations = page
        .getByRole("list", { name: "Invitations", exact: true })
        .or(page.getByRole("table", { name: "Invitations", exact: true }));
      await expect(invitations).toBeVisible();
      await expect(
        page.getByRole(size.width === 1024 ? "table" : "list", {
          name: "Invitations",
          exact: true,
        }),
      ).toBeVisible();
      if (size.width === 700) {
        const container = page.locator('[class~="@container"]').filter({ has: invitations });
        const threshold = await page.evaluate(
          () => 40 * parseFloat(getComputedStyle(document.documentElement).fontSize),
        );
        for (const target of [threshold, threshold - 1, threshold]) {
          const width = await page.evaluate(() => innerWidth);
          const bounds = (await container.boundingBox())!;
          await resize(desktop, Math.round(width + target - bounds.width), size.height);
          await expect(
            page.getByRole(target < threshold ? "list" : "table", {
              name: "Invitations",
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            invitations.getByRole("button", { name: "Resend", exact: true }),
          ).toHaveCount(10);
        }
        await resize(desktop, size.width, size.height);
      }
      await expect
        .poll(() =>
          invitations.evaluate((element) => element.scrollWidth <= element.clientWidth + 1),
        )
        .toBe(true);
      const actions = invitations
        .getByRole("group", { name: "Invitation actions", exact: true })
        .first();
      for (const name of ["Resend", "Cancel"])
        await fitsWindow(actions.getByRole("button", { name, exact: true }));
      const edges = await actions.getByRole("button").evaluateAll((buttons) =>
        buttons.map((button) => {
          const bounds = button.getBoundingClientRect();
          const style = getComputedStyle(button);
          return {
            width: bounds.width,
            height: bounds.height,
            top: bounds.top,
            border: style.borderTop,
          };
        }),
      );
      expect(edges[1], "Real grouped actions retain matching bounds and borders").toEqual(edges[0]);
      const pagination = page.getByRole("navigation", {
        name: "Invitations pagination",
        exact: true,
      });
      for (const name of ["Go to previous page", "Go to next page"])
        await fitsWindow(pagination.getByRole("button", { name, exact: true }));
      const image = await page.evaluate(() => {
        const canvas = document.createElement("canvas");
        canvas.width = 320;
        canvas.height = 180;
        canvas.getContext("2d")!.fillRect(0, 0, 320, 180);
        return canvas.toDataURL("image/png").split(",")[1]!;
      });
      for (const kind of ["organization", "user"] as const) {
        await desktop.openPath(`/settings/${kind}`);
        const name = kind === "user" ? "Profile picture" : "Organization logo";
        const region = page.getByRole("region", { name, exact: true });
        await fitsWindow(region.getByRole("button", { name: "Choose picture", exact: true }));
        await region.locator('input[type="file"]').setInputFiles({
          name: "layout.png",
          mimeType: "image/png",
          buffer: Buffer.from(image, "base64"),
        });
        const crop = page.getByRole("dialog", { name: `Edit ${name.toLowerCase()}`, exact: true });
        await fitsWindow(crop);
        await fitsWindow(crop.getByRole("group", { name: "Image crop preview", exact: true }));
        for (const name of ["Rotate 90°", "Save picture", "Cancel"])
          await fitsWindow(crop.getByRole("button", { name, exact: true }));
        await crop.getByRole("button", { name: "Cancel", exact: true }).click();
        await expect(
          region.getByRole("button", { name: "Choose picture", exact: true }),
        ).toBeFocused();
      }
      const navigation = page.getByRole("tablist", { name: "User settings", exact: true });
      for (const tab of await navigation.getByRole("tab").all()) await fitsWindow(tab);
    },
  );
}
