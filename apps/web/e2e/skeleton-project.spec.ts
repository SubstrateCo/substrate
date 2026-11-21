import { test } from "./test-support/fixtures";
import { project } from "./test-support/tasks";
import { expect } from "@playwright/test";

test("project loading placeholders give way to the real project and remain noninteractive", async ({
  actors,
  client,
}) => {
  const created = await project(actors.sender);
  const user = await client(actors.sender);
  const release = Promise.withResolvers<void>();
  const projectHeld = Promise.withResolvers<void>();
  const projectsHeld = Promise.withResolvers<void>();
  await user.page.route(/\/api\/v1\/tasks\/projects?(?:\?|$)/, async (route) => {
    const response = await route.fetch();
    if (new URL(route.request().url()).pathname.endsWith("/projects")) projectsHeld.resolve();
    else projectHeld.resolve();
    await release.promise;
    await route.fulfill({ response });
  });

  try {
    const since = user.events.length;
    const search = new URLSearchParams({
      workspaceId: user.actor.organizationId,
      projectId: created.entityId,
    });
    await user.page.goto(`/tasks?${search}`);
    await user.waitForEvent(
      since,
      (event) => event.type === "ready",
      "The real authenticated WebSocket completes its ready handshake",
    );
    await Promise.all([projectHeld.promise, projectsHeld.promise]);
    const sidebar = user.page.getByRole("complementary", { name: "Projects", exact: true });
    const loading = user.page.getByRole("status", { name: "Loading project", exact: true });
    await expect(sidebar.getByRole("status", { name: "Loading projects" })).toBeVisible();
    await expect(
      sidebar.getByRole("status", { name: "Loading projects" }).getByRole("button"),
    ).toHaveCount(0);
    await expect(loading).toBeVisible();
    await expect(loading.getByText("Tasks", { exact: true })).toBeVisible();
    await expect(loading.getByText("Discussions", { exact: true })).toBeVisible();
    await expect(loading.getByText("Settings", { exact: true })).toBeVisible();
    await expect(loading.getByRole("button")).toHaveCount(0);
    await expect(loading.getByRole("tab")).toHaveCount(0);
    release.resolve();
    await expect(loading).toHaveCount(0);
    await expect(sidebar.getByRole("link", { name: created.name, exact: true })).toBeVisible();
    await expect(user.page.getByRole("heading", { name: created.name, exact: true })).toBeVisible();
    await expect(user.page.getByRole("tab", { name: "Tasks", exact: true })).toBeVisible();
    await expect(user.page.getByText("No tasks yet", { exact: true })).toBeVisible();
    await expect(
      user.page.getByText(
        /Reconnecting to live updates|Live updates disconnected|some data failed to refresh/,
      ),
    ).toHaveCount(0);
  } finally {
    release.resolve();
  }
});
