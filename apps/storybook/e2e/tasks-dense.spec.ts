import { expect, test } from "@playwright/test";

test("populated projects switch task lists and retain changes in their own project", async ({
  page,
}) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--populated-workspace&viewMode=story");
  const projects = page.getByRole("complementary", { name: "Projects" });
  await expect(projects.getByRole("button")).toHaveCount(19);
  const tasks = page.getByRole("region", { name: "Project tasks" });
  await expect(tasks.getByRole("button")).toHaveCount(48);
  await projects.getByRole("button", { name: "Customer onboarding", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Customer onboarding", exact: true }),
  ).toBeVisible();
  await expect(
    tasks.getByRole("button", {
      name: /^Map the current workflow · Customer onboarding urgent priority/,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await page.getByLabel("Task title", { exact: true }).fill("Onboarding follow-up");
  await page.getByRole("button", { name: "Create task", exact: true }).click();
  await expect(tasks.getByRole("button")).toHaveCount(49);
  await projects.getByRole("button", { name: "Product launch", exact: true }).click();
  await expect(tasks.getByRole("button")).toHaveCount(48);
  await expect(tasks.getByRole("button", { name: /Onboarding follow-up/ })).toHaveCount(0);
  await projects.getByRole("button", { name: "Customer onboarding", exact: true }).click();
  await expect(tasks.getByRole("button", { name: /Onboarding follow-up/ })).toBeVisible();
});

test("large project can scroll to later tasks and open their details", async ({ page }) => {
  await page.goto("/iframe.html?id=projects-scenes-tasks--large-project&viewMode=story");
  const tasks = page.getByRole("region", { name: "Project tasks" });
  await expect(tasks.getByRole("button")).toHaveCount(160);
  const lateTask = tasks.getByRole("button", {
    name: /Design the first-run experience · Product launch · Sprint 14/,
  });
  await lateTask.click();
  await expect(
    page.getByRole("heading", {
      name: "Design the first-run experience · Product launch · Sprint 14",
      exact: true,
    }),
  ).toBeVisible();
});
