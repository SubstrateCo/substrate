import { expect, test } from "@playwright/test";

for (const theme of ["light", "dark"]) {
  for (const width of [1440, 390]) {
    for (const action of ["switch", "sign-out"]) {
      test(`compact ${action} error is readable without changing the rail at ${width}px in ${theme}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const ready = action === "switch" ? "compact-switcher" : "compact-sign-out";
        const failed = action === "switch" ? "switch-error" : "sign-out-error";
        const name = action === "switch" ? "Launch Studio ▾" : "Sign out";
        const storyURL = (story: string) =>
          `/iframe.html?id=components-workspace-rail-controls--${story}&viewMode=story&globals=theme:${theme}`;
        await page.goto(storyURL(ready));
        const trigger = page.getByRole("button", { name, exact: true });
        await expect(trigger).toBeVisible();
        const readyTrigger = await trigger.boundingBox();
        const readyRail = await trigger.evaluate((button) => {
          const bounds = button.parentElement!.parentElement!.getBoundingClientRect();
          return { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height };
        });
        await page.goto(storyURL(failed));
        const alert = page.getByRole("alert");
        await expect(alert).toBeVisible();
        const bounds = await alert.boundingBox();
        expect(bounds!.width, "Feedback is not squeezed into the icon rail").toBeGreaterThanOrEqual(
          240,
        );
        expect(
          bounds!.height,
          "Feedback stays readable rather than wrapping one character per line",
        ).toBeLessThanOrEqual(450);
        await expect(alert).toBeInViewport({ ratio: 1 });
        expect(await trigger.boundingBox()).toEqual(readyTrigger);
        expect(
          await trigger.evaluate((button) => {
            const rect = button.parentElement!.parentElement!.getBoundingClientRect();
            return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
          }),
        ).toEqual(readyRail);
        await trigger.focus();
        if (action === "switch") {
          await trigger.press("Enter");
          await expect(page.getByRole("menu")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(page.getByRole("menu")).toHaveCount(0);
          await expect(trigger).toBeFocused();
          await expect(alert).toBeVisible();
          await trigger.press("Enter");
          const choice = page.getByRole("menuitem", { name: "Partner Workspace", exact: true });
          await expect(choice).toBeVisible();
          await choice.focus();
          await choice.press("Enter");
          await expect(page.getByRole("menu")).toHaveCount(0);
          await expect(trigger).toBeFocused();
        } else {
          await expect(trigger).toBeEnabled();
          await trigger.press("Enter");
          await expect(trigger).toBeFocused();
        }
      });

      test(`compact ${action} can retry after failure at ${width}px in ${theme}`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const story = action === "switch" ? "switch-retry" : "sign-out-retry";
        await page.goto(
          `/iframe.html?id=components-workspace-rail-controls--${story}&viewMode=story&globals=theme:${theme}`,
        );
        const trigger = page.getByRole("button", {
          name: action === "switch" ? "Launch Studio ▾" : "Sign out",
          exact: true,
        });
        await expect(trigger).toBeVisible();
        const ready = await trigger.boundingBox();
        for (let attempt = 0; attempt < 2; attempt += 1) {
          await trigger.click();
          if (action === "switch")
            await page.getByRole("menuitem", { name: "Partner Workspace", exact: true }).click();
          if (attempt === 0) {
            await expect(page.getByRole("alert")).toContainText(
              action === "switch"
                ? "Your current workspace is still open"
                : "We couldn’t sign you out",
            );
            await expect(page.getByRole("alert")).not.toContainText("Internal");
            expect(await trigger.boundingBox()).toEqual(ready);
            await expect(trigger).toBeFocused();
          }
        }
        await expect(page.getByRole("alert")).toHaveCount(0);
        if (action === "switch") {
          const switched = page.getByRole("button", { name: "Partner Workspace ▾", exact: true });
          await expect(switched).toBeFocused();
          expect(await switched.boundingBox()).toEqual(ready);
        } else await expect(page.getByRole("status")).toHaveText("Signed out.");
      });
    }
  }
}
