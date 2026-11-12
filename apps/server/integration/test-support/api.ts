import type { ServiceResult } from "@substrate/contracts/result";
import type { TasksWrite } from "@substrate/contracts/tasks/input";

import { appOrigin } from "./environment";
import { expect, type APIRequestContext, type APIResponse } from "@playwright/test";

export async function result<T>(response: APIResponse): Promise<T> {
  expect(response.ok(), "The authorized operation succeeds").toBe(true);
  const body: ServiceResult<T> = await response.json();
  expect(body.success, "The operation returns successful application data").toBe(true);
  if (!body.success) throw new Error("The operation did not succeed.");
  return body.data;
}

export async function rejected(response: APIResponse, privateValues: readonly string[] = []) {
  expect(response.status(), "The operation is rejected, not a server error").toBeGreaterThanOrEqual(
    400,
  );
  expect(response.status()).toBeLessThan(500);
  const text = await response.text();
  for (const value of privateValues)
    expect(text.includes(value), "The rejection does not disclose private data").toBe(false);
  if (response.headers()["content-type"]?.includes("application/json")) {
    const body = JSON.parse(text);
    expect(body.data ?? null, "Rejected operations expose no successful resource data").toBeNull();
    expect(body.success).not.toBe(true);
  }
}

export type TaskWrite<T = TasksWrite> = T extends TasksWrite ? Omit<T, "organizationId"> : never;
export type WorkspaceClient = { request: APIRequestContext; organizationId: string };
const write = (actor: WorkspaceClient, data: TaskWrite, origin = appOrigin) =>
  actor.request.post("/api/v1/tasks/mutations", {
    headers: { origin },
    data: { ...data, organizationId: actor.organizationId },
  });

export const tasks = {
  write,
  async create(this: void, actor: WorkspaceClient, data: TaskWrite) {
    return (await result<{ id: string }>(await write(actor, data))).id;
  },
  project(this: void, actor: WorkspaceClient, projectEntityId: string) {
    return actor.request.get("/api/v1/tasks/project", {
      params: { organizationId: actor.organizationId, projectEntityId },
    });
  },
};
