import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const viewport of [
    { width: 800, height: 420 },
    { width: 390, height: 700 },
  ]) {
    const suffix = `${viewport.width}x${viewport.height} in ${theme}`;
    test(`workspace action notice leaves header controls pointer-reachable at ${suffix}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.goto(
        `/iframe.html?id=scenes-workspace-selection--populated&viewMode=story&globals=theme:${theme}`,
      );
      const signOut = page.getByRole("button", { name: "Sign out", exact: true });
      await expect(signOut).toBeVisible();
      const readySignOut = await signOut.boundingBox();
      const heading = page.getByRole("heading", { name: "Your workspaces", exact: true });
      const readyHeading = await heading.boundingBox();
      await page.getByRole("button", { name: "Partner Workspace", exact: true }).click();
      const alert = page.getByRole("alert");
      await expect(alert).toBeVisible();
      await signOut.click({ trial: true, timeout: 1500 });
      expect(await signOut.boundingBox()).toEqual(readySignOut);
      expect(await heading.boundingBox()).toEqual(readyHeading);
      const notice = await alert.boundingBox();
      expect(notice!.y).toBeGreaterThanOrEqual(
        Math.max(readyHeading!.y + readyHeading!.height, readySignOut!.y + readySignOut!.height),
      );
      await expect(alert).toBeInViewport({ ratio: 1 });
      expect(notice!.width).toBeGreaterThanOrEqual(240);
      expect(notice!.height).toBeLessThanOrEqual(150);
      expect(
        await heading.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          const hit = document.elementFromPoint(
            bounds.x + bounds.width / 2,
            bounds.y + bounds.height / 2,
          );
          return hit === element || element.contains(hit);
        }),
      ).toBe(true);
    });

    test(`workspace notice Escape and dismiss return focus to its source at ${suffix}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      for (const method of ["Escape", "click"]) {
        await page.goto(
          `/iframe.html?id=scenes-workspace-selection--populated&viewMode=story&globals=theme:${theme}`,
        );
        const source = page.getByRole("button", { name: "Partner Workspace", exact: true });
        await source.click();
        const dismiss = page.getByRole("button", { name: "Dismiss notification", exact: true });
        await dismiss.focus();
        if (method === "Escape") await dismiss.press("Escape");
        else await dismiss.click();
        await expect(page.getByRole("alert")).toHaveCount(0);
        await expect(source).toBeFocused();
        await expect(source).toBeInViewport({ ratio: 1 });
        await page.keyboard.press("Tab");
        await expect(
          page.getByRole("textbox", { name: "Workspace name", exact: true }),
        ).toBeFocused();
      }
    });
  }
}
