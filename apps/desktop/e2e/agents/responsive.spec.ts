import type {} from "@startup-os/contracts/harness/desktop";

import { test } from "../test-support/fixture.js";
import { fitsWindow, resize } from "../test-support/layout.js";
import { expect } from "@playwright/test";

for (const size of [
  { width: 1024, height: 768 },
  { width: 320, height: 568 },
]) {
  test(
    `skill editors and confirmations fit ${size.width}x${size.height}`,
    { tag: "@layout" },
    async ({ desktop }) => {
      await desktop.provision();
      const { page } = desktop;
      await page.evaluate(async () => {
        const bridge = window.startupOSHarness!;
        await bridge.synchronize();
        await bridge.saveSkill({
          harness: "opencode",
          name: "layout-skill-" + "x".repeat(47),
          description: "Long description " + "x".repeat(200),
          content: "Review source context.\n".repeat(25),
        });
      });
      await desktop.openPath("/settings/user/agents");
      await resize(desktop, size.width, size.height);
      await page.getByRole("button", { name: "Create agent", exact: true }).click();
      const configuration = page.getByRole("dialog", { name: "Create agent", exact: true });
      await configuration.getByRole("tab", { name: "Skills", exact: true }).click();
      await configuration.getByRole("button", { name: "Create skill", exact: true }).click();
      const skill = page.getByRole("dialog", { name: "Create skill", exact: true });
      await fitsWindow(skill);
      await skill
        .getByLabel("Skill content", { exact: true })
        .fill("Review source context.\n".repeat(25));
      for (const name of ["Save skill", "Cancel"])
        await fitsWindow(skill.getByRole("button", { name, exact: true }));
      await skill.getByRole("button", { name: "Cancel", exact: true }).click();
      const name = "layout-skill-" + "x".repeat(47);
      await configuration.getByRole("button", { name: `Edit ${name}`, exact: true }).click();
      const editing = page.getByRole("dialog", { name: "Edit skill", exact: true });
      await fitsWindow(editing);
      await editing.getByLabel("Skill name", { exact: true }).scrollIntoViewIfNeeded();
      const before = await editing.evaluate((element) => element.scrollTop);
      await editing.hover({ position: { x: 10, y: 200 } });
      await page.mouse.wheel(0, 300);
      await expect
        .poll(() => editing.evaluate((element) => element.scrollTop))
        .toBeGreaterThan(before);
      await fitsWindow(editing.getByRole("button", { name: "Save skill", exact: true }));
      await editing.getByRole("button", { name: "Cancel", exact: true }).click();
      await configuration.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
      const confirmation = page.getByRole("dialog", { name: `Delete ${name}?`, exact: true });
      await fitsWindow(confirmation);
      for (const name of ["Cancel", "Delete"])
        await fitsWindow(confirmation.getByRole("button", { name, exact: true }));
      await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
    },
  );
}
