import { expect, test } from "@playwright/test";

test("empty workspace project creation restores the right action on cancel and completion", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--empty-workspace&viewMode=story");
  const create = page.getByRole("button", { name: "Create project", exact: true });
  await create.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
  await page.getByRole("button", { name: "Cancel", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(create).toBeFocused();
  await page.keyboard.press("Enter");
  await page.getByLabel("Project name", { exact: true }).fill("First keyboard project");
  await page.getByRole("button", { name: "Create project", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "New project", exact: true })).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "First keyboard project", exact: true }),
  ).toBeVisible();
});

for (const width of [390, 1024, 1440]) {
  test(`tabs preserve task, edit, comment, and sharing drafts at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.goto("/iframe.html?id=projects-scenes-tasks--project&viewMode=story");
    const settings = page.getByRole("tab", { name: "Project settings", exact: true });
    const tasks = page.getByRole("tab", { name: "Tasks", exact: true });
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Task title", { exact: true }).fill("Preserved new task");
    await page.getByLabel("Task description", { exact: true }).fill("Preserved description");
    await settings.click();
    await expect(page.getByRole("textbox", { name: "Task title", exact: true })).toHaveCount(0);
    await page.getByRole("combobox", { name: "Person or agent", exact: true }).click();
    await page.getByRole("option", { name: "Release assistant (agent)", exact: true }).click();
    await page.getByRole("combobox", { name: "Permission", exact: true }).click();
    await page.getByRole("option", { name: "Comment", exact: true }).click();
    await tasks.click();
    await expect(page.getByRole("combobox", { name: "Permission", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Task title", { exact: true })).toHaveValue("Preserved new task");
    await expect(page.getByLabel("Task description", { exact: true })).toHaveValue(
      "Preserved description",
    );
    await page.getByRole("button", { name: "Create task", exact: true }).click();
    const detail = page.getByRole("region", { name: "Task details", exact: true });
    await expect(
      detail.getByRole("heading", { name: "Preserved new task", exact: true }),
    ).toBeVisible();
    await expect(detail.getByText("Preserved description", { exact: true })).toBeVisible();
    await page.getByLabel("Add a comment", { exact: true }).fill("Preserved comment");
    await page.getByRole("button", { name: "Edit task", exact: true }).click();
    await page.getByLabel("Task title", { exact: true }).fill("Preserved edit");
    await settings.click();
    await expect(page.getByRole("combobox", { name: "Person or agent", exact: true })).toHaveText(
      "Release assistant (agent)",
    );
    await expect(page.getByRole("combobox", { name: "Permission", exact: true })).toHaveText(
      "Comment",
    );
    await tasks.click();
    await expect(page.getByRole("form", { name: "Edit task", exact: true })).toBeVisible();
    await expect(page.getByLabel("Task title", { exact: true })).toHaveValue("Preserved edit");
    await expect(page.getByLabel("Add a comment", { exact: true })).toHaveValue(
      "Preserved comment",
    );
    await page.getByRole("button", { name: "Save task", exact: true }).click();
    await expect(
      detail.getByRole("heading", { name: "Preserved edit", exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(detail.getByText("Preserved comment", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Add a comment", { exact: true })).toHaveValue("");
    await settings.click();
    await page.getByRole("button", { name: "Update access", exact: true }).click();
    await expect(
      page.getByText("Give Release assistant Comment access to Product launch?", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Confirm access", exact: true }).click();
    await expect(page.getByText("Comment access", { exact: true })).toBeVisible();
  });

  test(`keyboard project creation and task editing move and restore focus at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 768 });
    await page.goto("/iframe.html?id=projects-scenes-tasks--project&viewMode=story");
    const create = page.getByRole("button", { name: "New project", exact: true });
    await create.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Project name", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Project name", { exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Cancel", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(create).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByLabel("Project name", { exact: true }).fill("Keyboard project");
    await page.getByRole("button", { name: "Create project", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(create).toBeFocused();
    await page
      .getByRole("complementary", { name: "Projects", exact: true })
      .getByRole("button", { name: "Product launch", exact: true })
      .click();
    await page.getByRole("button", { name: /Ship the launch/ }).click();
    const edit = page.getByRole("button", { name: "Edit task", exact: true });
    await edit.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByLabel("Task title", { exact: true })).toBeFocused();
    await expect(page.getByLabel("Task title", { exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Cancel", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(edit).toBeFocused();
    await page.keyboard.press("Enter");
    await page.getByLabel("Task title", { exact: true }).fill("Keyboard edit");
    await page.getByRole("button", { name: "Save task", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(edit).toBeFocused();
    await expect(page.getByRole("heading", { name: "Keyboard edit", exact: true })).toBeVisible();
  });
}

test("project access expansion requires a named scoped confirmation and cancellation never mutates", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--project&viewMode=story");
  await page.getByRole("tab", { name: "Project settings", exact: true }).click();
  const sharing = page.getByRole("region", { name: "Project sharing", exact: true });
  await sharing.getByRole("combobox", { name: "Person or agent", exact: true }).click();
  await page.getByRole("option", { name: "Release assistant (agent)", exact: true }).click();
  const update = sharing.getByRole("button", { name: "Update access", exact: true });
  await update.focus();
  await page.keyboard.press("Enter");
  await expect(sharing.getByRole("button", { name: "Confirm access", exact: true })).toBeFocused();
  await expect(
    sharing.getByRole("heading", { name: "Review project access", exact: true }),
  ).toBeVisible();
  await expect(
    sharing.getByText("Give Release assistant Edit access to Product launch?", { exact: true }),
  ).toBeVisible();
  await expect(
    sharing.getByText("This grants access to every task, subtask, and comment in this project.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(sharing.getByRole("listitem")).toHaveCount(1);
  await sharing.getByRole("button", { name: "Cancel access change", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(update).toBeFocused();
  await expect(sharing.getByRole("listitem")).toHaveCount(1);
  await sharing.getByRole("button", { name: "Update access", exact: true }).click();
  await sharing.getByRole("button", { name: "Confirm access", exact: true }).click();
  await expect(sharing.getByRole("listitem")).toHaveCount(2);
  await expect(update).toBeFocused();
  await sharing.getByRole("combobox", { name: "Permission", exact: true }).click();
  await page.getByRole("option", { name: "Owner", exact: true }).click();
  await sharing.getByRole("button", { name: "Update access", exact: true }).click();
  await expect(
    sharing.getByText("Give Release assistant Owner access to Product launch?", { exact: true }),
  ).toBeVisible();
  await expect(
    sharing.getByText("Owners can manage project access.", { exact: true }),
  ).toBeVisible();
  await expect(sharing.getByText("Owner access", { exact: true })).toHaveCount(1);
  await sharing.getByRole("button", { name: "Cancel access change", exact: true }).click();
  await expect(sharing.getByText("Edit access", { exact: true })).toHaveCount(1);
  await sharing.getByRole("button", { name: "Update access", exact: true }).click();
  await sharing.getByRole("button", { name: "Confirm access", exact: true }).click();
  await expect(sharing.getByText("Owner access", { exact: true })).toHaveCount(2);
  await sharing.getByRole("combobox", { name: "Permission", exact: true }).click();
  await page.getByRole("option", { name: "View", exact: true }).click();
  await sharing.getByRole("button", { name: "Update access", exact: true }).click();
  await expect(
    sharing.getByRole("region", { name: "Access change review", exact: true }),
  ).toHaveCount(0);
  await expect(sharing.getByText("View access", { exact: true })).toHaveCount(1);
  await sharing.getByRole("button", { name: "Update access", exact: true }).click();
  await expect(
    sharing.getByRole("region", { name: "Access change review", exact: true }),
  ).toHaveCount(0);
  await sharing.getByRole("button", { name: "Remove Release assistant", exact: true }).click();
  await expect(sharing.getByRole("listitem")).toHaveCount(1);
});

test("access loss removes mounted drafts and sharing metadata, not just their visibility", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--draft-access-loss&viewMode=story");
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("Private draft");
  await page.getByRole("tab", { name: "Project settings", exact: true }).click();
  await page.getByRole("button", { name: "Lose project access", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Project unavailable", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Task title", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Project sharing", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Remove Alex Morgan", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(page.getByLabel("Task title", { exact: true })).toHaveValue("");
});

test("access loss clears the inactive task editor and comment draft", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--draft-access-loss&viewMode=story");
  await page.getByRole("button", { name: /Ship the launch/ }).click();
  await page.getByLabel("Add a comment", { exact: true }).fill("Private comment draft");
  await page.getByRole("button", { name: "Edit task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("Private edit draft");
  await page.getByRole("tab", { name: "Project settings", exact: true }).click();
  await page.getByRole("button", { name: "Lose project access", exact: true }).click();
  await expect(
    page.getByRole("form", { name: "Edit task", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Add a comment", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await page.getByRole("tab", { name: "Tasks", exact: true }).click();
  await expect(
    page.getByRole("form", { name: "Edit task", exact: true, includeHidden: true }),
  ).toHaveCount(0);
  await expect(page.getByLabel("Add a comment", { exact: true })).toHaveValue("");
  await expect(page.getByRole("heading", { name: "Ship the launch", exact: true })).toBeVisible();
});
