import type { ProjectDetail } from "../../src/components/tasks/types";
import { expect, post, type Actor, type Client } from "./fixtures";
import type { Page } from "@playwright/test";

export async function project(actor: Actor) {
  const name = `Project ${crypto.randomUUID()}`;
  const result = await post<{ id: string }>(actor, "tasks/mutations", {
    organizationId: actor.organizationId,
    action: "createProject",
    name,
  });
  return { entityId: result.id, name };
}

export async function detail(actor: Actor, projectEntityId: string): Promise<ProjectDetail> {
  const response = await actor.request.get("/api/v1/tasks/project", {
    params: { organizationId: actor.organizationId, projectEntityId },
  });
  expect(response.ok()).toBe(true);
  return (await response.json()).data;
}

export async function share(
  actor: Actor,
  projectEntityId: string,
  name: string,
  level: "view" | "edit",
) {
  const data = await detail(actor, projectEntityId);
  const target = data.actors.find((candidate) => candidate.name === name);
  if (!target) throw new Error("Fixture member is missing from workspace actors.");
  await post(actor, "tasks/mutations", {
    organizationId: actor.organizationId,
    action: "share",
    projectEntityId,
    actorEntityId: target.entityId,
    level,
  });
}

export async function visitProject(client: Client, projectId: string, taskId?: string) {
  const search = new URLSearchParams({ workspaceId: client.actor.organizationId, projectId });
  if (taskId) search.set("taskId", taskId);
  await client.page.goto(`/tasks?${search}`);
  await expect.poll(() => client.events.some((event) => event.type === "ready")).toBe(true);
  await expect(
    client.page.getByText(/Reconnecting to live updates|Live updates disconnected/),
  ).toHaveCount(0);
}

export async function select(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option, exact: true }).click();
}
