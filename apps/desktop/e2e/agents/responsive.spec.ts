import { test } from "../test-support/fixture.js";
import { expect, type Locator } from "@playwright/test";

async function expectNoHorizontalOverflow(locator: Locator) {
  await expect
    .poll(() => locator.evaluate((element) => element.scrollWidth - element.clientWidth))
    .toBeLessThanOrEqual(1);
  await expect
    .poll(() =>
      locator.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return Math.max(-bounds.left, bounds.right - innerWidth);
      }),
    )
    .toBeLessThanOrEqual(1);
}

async function expectDialogFits(dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect
    .poll(() =>
      dialog.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return (
          bounds.top >= 0 &&
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          bounds.bottom <= innerHeight
        );
      }),
    )
    .toBe(true);
  await expectNoHorizontalOverflow(dialog);
}

for (const size of [
  { width: 1024, height: 768 },
  { width: 375, height: 812 },
  { width: 320, height: 812 },
  { width: 320, height: 568 },
]) {
  test(`agent settings and native skill actions fit ${size.width}x${size.height} in Electron`, async ({
    desktop,
  }) => {
    test.setTimeout(120_000);
    await desktop.provision();
    await desktop.app.evaluate(({ BrowserWindow }, dimensions) => {
      const window = BrowserWindow.getAllWindows()[0]!;
      window.setMinimumSize(320, 200);
      window.setContentSize(dimensions.width, dimensions.height);
    }, size);
    const page = desktop.page;
    await expect
      .poll(() => page.evaluate(() => ({ width: innerWidth, height: innerHeight })))
      .toEqual(size);
    await page.goto(new URL("/settings/user/agents", desktop.rendererOrigin).href);
    const settings = page.getByRole("region", { name: "Agents", exact: true });
    await expectNoHorizontalOverflow(settings);

    const configuration = page.getByRole("combobox", {
      name: "Configuration harness",
      exact: true,
    });
    await configuration.click();
    await expect(page.getByRole("option", { name: "Claude Code", exact: true })).toBeVisible();
    await page.getByRole("option", { name: "Claude Code", exact: true }).click();
    await expect(configuration).toHaveText("Claude Code");
    await configuration.click();
    await page.getByRole("option", { name: "OpenCode", exact: true }).click();
    await page.getByRole("button", { name: "Scan local configuration", exact: true }).click();
    await expect(page.getByRole("button", { name: "Create skill", exact: true })).toBeEnabled();

    const skillName = "responsive-skill-" + "x".repeat(47);
    const skillContent = "Check the available source context before making a recommendation.\n"
      .repeat(25)
      .trim();
    await page.getByRole("button", { name: "Create skill", exact: true }).click();
    const skill = page.getByRole("dialog", { name: "Create skill", exact: true });
    await expectDialogFits(skill);
    await skill.getByLabel("Skill name", { exact: true }).fill(skillName);
    await skill
      .getByLabel("Description", { exact: true })
      .fill("Long skill description " + "x".repeat(200));
    await skill.getByLabel("Skill content", { exact: true }).fill(skillContent);
    await expectDialogFits(skill);
    await skill.getByLabel("Skill name", { exact: true }).scrollIntoViewIfNeeded();
    const skillScroll = await skill.evaluate((element) => element.scrollTop);
    await skill.hover({ position: { x: 10, y: 200 } });
    await page.mouse.wheel(0, 300);
    await expect
      .poll(() => skill.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(skillScroll);
    await skill.getByRole("button", { name: "Save skill", exact: true }).scrollIntoViewIfNeeded();
    await expect.poll(() => skill.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
    await skill.getByRole("button", { name: "Save skill", exact: true }).click();
    await expect(skill).toBeHidden();
    await expectNoHorizontalOverflow(page.getByRole("region", { name: "Skills", exact: true }));
    await page.getByRole("button", { name: `Edit ${skillName}`, exact: true }).click();
    const editedSkill = page.getByRole("dialog", { name: "Edit skill", exact: true });
    await expectDialogFits(editedSkill);
    await expect(editedSkill.getByLabel("Skill content", { exact: true })).toHaveValue(
      skillContent,
    );
    await editedSkill.getByLabel("Description", { exact: true }).fill("Updated native skill.");
    await editedSkill.getByRole("button", { name: "Save skill", exact: true }).click();
    await expect(editedSkill).toBeHidden();
    await expect(page.getByRole("region", { name: "Skills", exact: true })).toContainText(
      "Updated native skill.",
    );
    await page
      .getByRole("button", { name: `Edit ${skillName}`, exact: true })
      .scrollIntoViewIfNeeded();

    const agentName = "Responsive" + "x".repeat(170);
    await page.getByRole("button", { name: "Create agent", exact: true }).click();
    const agent = page.getByRole("dialog", { name: "Create agent", exact: true });
    await expectDialogFits(agent);
    await agent.getByLabel("Agent name", { exact: true }).fill(agentName);
    await agent.getByRole("button", { name: /^Harness & model:/ }).click();
    await page.getByRole("button", { name: "Claude Code", exact: true }).click();
    await page.getByPlaceholder("Search models…", { exact: true }).fill("claude-sonnet");
    await page.getByRole("option", { name: /Use .*claude-sonnet/ }).click();
    const instructions = "Review customer context.\n".repeat(30).trim();
    await agent.getByRole("textbox", { name: "Instructions", exact: true }).fill(instructions);
    await expectDialogFits(agent);
    await agent.getByRole("switch", { name: "Enabled", exact: true }).click();
    await agent.getByLabel("Agent name", { exact: true }).scrollIntoViewIfNeeded();
    await expect(agent.getByLabel("Agent name", { exact: true })).toBeInViewport();
    await agent.getByRole("switch", { name: "Enabled", exact: true }).scrollIntoViewIfNeeded();
    await expect(agent.getByRole("switch", { name: "Enabled", exact: true })).toBeInViewport();
    await agent.getByRole("button", { name: "Save agent", exact: true }).scrollIntoViewIfNeeded();
    await expect(agent.getByRole("button", { name: "Save agent", exact: true })).toBeInViewport();
    await agent.getByRole("button", { name: "Save agent", exact: true }).click();
    await expect(agent).toBeHidden();
    const agents = page.getByRole("region", { name: "Agent actors", exact: true });
    await expectNoHorizontalOverflow(agents);
    await expect(agents).toContainText("Claude Code · Disabled");
    await page
      .getByRole("button", { name: `Edit ${agentName}`, exact: true })
      .scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: `Edit ${agentName}`, exact: true }).click();
    const editedAgent = page.getByRole("dialog", { name: "Edit agent", exact: true });
    await expectDialogFits(editedAgent);
    await expect(editedAgent.getByRole("button", { name: /^Harness & model:/ })).toContainText(
      "claude-sonnet",
    );
    await expect(
      editedAgent.getByRole("textbox", { name: "Instructions", exact: true }),
    ).toHaveValue(instructions);
    await expect(
      editedAgent.getByRole("switch", { name: "Enabled", exact: true }),
    ).not.toBeChecked();
    await editedAgent.getByLabel("Agent name", { exact: true }).fill("Unsaved name");
    await editedAgent.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(editedAgent).toBeHidden();
    await expect(page.getByRole("button", { name: "Edit Unsaved name", exact: true })).toHaveCount(
      0,
    );

    for (const name of [agentName, skillName]) {
      const actions = page.getByRole("group", { name: `Actions for ${name}`, exact: true });
      await expect(actions.getByRole("button")).toHaveCount(2);
      await expect(
        actions.getByRole("button", { name: `Edit ${name}`, exact: true }).locator("svg"),
      ).toHaveCount(1);
      const deleteTrigger = actions.getByRole("button", { name: `Delete ${name}`, exact: true });
      await expect(deleteTrigger.locator("svg")).toHaveCount(1);
      await expect(deleteTrigger).toHaveAttribute("data-variant", "destructive");
      await page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
      const confirmation = page.getByRole("dialog", { name: `Delete ${name}?`, exact: true });
      await expect(confirmation).toBeVisible();
      await expectDialogFits(confirmation);
      await confirmation.getByRole("button", { name: "Cancel", exact: true }).click();
      await expect(confirmation).toBeHidden();
      await expect(page.getByRole("button", { name: `Edit ${name}`, exact: true })).toBeVisible();
      await page.getByRole("button", { name: `Delete ${name}`, exact: true }).click();
      await confirmation.getByRole("button", { name: "Delete", exact: true }).click();
      await expect(confirmation).toBeHidden();
      await expect(page.getByRole("button", { name: `Edit ${name}`, exact: true })).toHaveCount(0);
    }
    await expectNoHorizontalOverflow(settings);
  });
}
